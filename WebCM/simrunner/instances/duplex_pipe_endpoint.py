import threading
import queue
import traceback

from enum import Enum

class PipeEndpointSignal(Enum):
	# Sent when one endpoint wants to tell the other that it was been closed
	CLOSE_NOTIFICATION = 1
	# Sent when one endpoint wants to tell the other that it has received the close 
	# notification and has closed iteself successfully
	CLOSE_CONFIRMATION = 2

# Used to send and receive messages accross a pipe. You cannot read and write to the
# same 'Connection' object returned by 'mp.Pipe()' at the same time. This means that
# you cannot have a listener thread that's always receiving data from the pipe, and also
# send data over the pipe from other threads. We could have used two pipes, or a'mp.Queue',
# but they both seem like inefficient solutions.
#
# 'DuplexPipeEndpoint' allows you to both read and write at the same time using only one pipe.
# Instead of waiting for messages to be received constantly, it will do so periodically. This
# way, it can send messages down the pipe without there being a chance of data corruption
class DuplexPipeEndpoint:
	def __init__(self, conn, receive_callback, close_callback=None, poll_period=0.1):
		self.connection = conn
		self.receive_callback = receive_callback
		self.close_callback = close_callback

		self.msg_queue = queue.Queue()
		self.poll_period = poll_period

		self.auto_shutdown = False
		self.running = False
		self.thread = threading.Thread(target=self.run)
		self.queue_cond = threading.Condition()

		self.close_confirmed = False
		self.shutdown_cond = threading.Condition()

	def run(self):
		while self.running:
			# Wait for either the queue to not be empty or until the timeout expires
			def wait_predicate():
				return not self.msg_queue.empty()

			self.queue_cond.acquire()
			self.queue_cond.wait_for(wait_predicate, timeout=self.poll_period)

			try:
				# Receive items
				while self.connection.poll():
					item = self.connection.recv()
					self.receive_message(item)

				# Send items
				while not self.msg_queue.empty():
					item = self.msg_queue.get()
					self.connection.send(item)

					self.msg_queue.task_done()

				# We want to send the close notification
				if self.auto_shutdown:
					self.connection.send(PipeEndpointSignal.CLOSE_CONFIRMATION)
					self.running = False
			except BrokenPipeError as e:
				print(traceback.format_exc())
				print("Shutting down pipe endpoint because of exception")
				self.running = False
			except Exception as e:
				print(traceback.format_exc())

			self.queue_cond.release()

		if self.close_callback:
			self.close_callback()

		return

	def start(self):
		self.running = True
		self.thread.start()
	
	def close(self):
		if not self.running:
			return

		# NOTE(Jason): I don't think we should wait for the message queue to be
		# empty. If we are closing the endpoint, that means we probably won't be
		# processing any more messages anyway
		# self.msg_queue.join()

		self.running = False
		self.thread.join()

	# Use this to gracefully close both endpoints of the pipe
	def shutdown(self, block_timeout=1.0):
		if not self.running:
			return
		
		self.send_item(PipeEndpointSignal.CLOSE_NOTIFICATION)

		def wait_predicate():
			return self.close_confirmed

		self.shutdown_cond.acquire()
		self.shutdown_cond.wait_for(wait_predicate, timeout=block_timeout)
		self.shutdown_cond.release()

		self.close()

	def send_item(self, item):
		if not self.running:
			return

		with self.queue_cond:
			self.msg_queue.put(item)
			self.queue_cond.notify_all()

	def receive_message(self, msg):
		if isinstance(msg, PipeEndpointSignal):
			if msg == PipeEndpointSignal.CLOSE_NOTIFICATION:
				self.auto_shutdown = True
			elif msg == PipeEndpointSignal.CLOSE_CONFIRMATION:
				with self.shutdown_cond:
					self.close_confirmed = True
					self.shutdown_cond.notify_all()
		else:
			self.receive_callback(msg)

	def is_alive(self):
		return self.running
