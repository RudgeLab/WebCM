import multiprocessing as mp
import threading
import traceback
import json
import sys, os

from cloudserver import settings
from saveviewer import archiver

from simrunner import websocket_groups as wsgroups

from simrunner.backends.backend import BackendParameters
from simrunner.backends.cellmodeller4 import CellModeller4Backend
from simrunner.backends.cellmodeller5 import CellModeller5Backend

from simrunner.instances import clientmessages
from simrunner.instances.duplex_pipe_endpoint import DuplexPipeEndpoint

class _InstanceProcessParams:
	root_dir = ""
	backend = ""
	max_cell_count = 0

# Encoding/decoding with JSON because its (probably) faster than the pickle-ing that
# Pytohn's pipe (might) be doing
def encode_pipe_message(message):
	return json.dumps(message)

def decode_pipe_message(message):
	message_json = json.loads(message)
	message_key = list(message_json)[0]
	message_value = message_json[message_key]

	return (message_key, message_value)

class SimulationInstance:
	def __init__(self, uuid, version, root_path, max_cell_count=0):
		self.uuid = uuid
		self.backend_version = version
		self.root_path = os.path.abspath(root_path)
		self.is_alive = False
		self.max_cell_count = max_cell_count
		self.current_status = "launching"
	
	def __del__(self):
		self.close()

	def launch(self):
		archiver.update_cached_instance_index(self.uuid, archiver.init_empty_instance_index())

		self.send_message_to_clients(clientmessages.Status(self.current_status))
		self.send_message_to_clients(clientmessages.NewFrame(0))

		# Launch the simulation process
		params = _InstanceProcessParams()
		params.root_dir = self.root_path
		params.backend = self.backend_version
		params.max_cell_count = self.max_cell_count

		# The "spawn" context will start a completely new process of the python
		# interpeter. This is also the only context type that is supported on both
		# Unix and Windows systems.
		ctx = mp.get_context("spawn")

		# We need to create a pipe to communicate with the child process. 'mp.Pipe()' creates
		# two 'Connection' objects. Each of the 'Connection' objects represents one of the two
		# ends of the pipe. One object should be used by the parent, and the other should be 
		# used by the child.
		parent_pipe, child_pipe = mp.Pipe(duplex=True)

		self.pipes = (parent_pipe, child_pipe)
		self.is_alive = True

		# Create a new process and start it
		self.process = ctx.Process(target=instance_control_thread, args=(child_pipe, params), daemon=True)
		self.process.start()

		# We also need to create a thread to communicate with the instance process
		self.endpoint = DuplexPipeEndpoint(parent_pipe, self.recv_message_from_instance, self.on_endpoint_closed)
		self.endpoint.start()

	def recv_message_from_instance(self, message):
		(action, data) = decode_pipe_message(message)

		if action == "newframe":
			archiver.update_cached_instance_index(self.uuid, data["new_data"])

			self.send_message_to_clients(clientmessages.NewFrame(data["frame_count"]))
		elif action == "newshape":
			archiver.update_cached_instance_index(self.uuid, data["new_data"])

			self.send_message_to_clients(clientmessages.NewShape())
		elif action == "error_message":
			archiver.update_cached_instance_index(self.uuid, data["new_data"])
			
			self.send_message_to_clients(clientmessages.ErrorMessage(data["new_data"]["crash_message"]))
		elif action == "status":
			self.current_status = data
			self.send_message_to_clients(clientmessages.Status(self.current_status))
		elif action == "source_request":
			source_content = archiver.update_and_fetch_simulation_source(self.uuid)

			self.send_message_to_instance({ "source_response": source_content })
		elif action == "close":
			self._cleanup()

	def send_message_to_instance(self, message):
		self.endpoint.send_item(encode_pipe_message(message))

	# This is not needed. All messages coming from clients are handled by the WebSocket consumers
	# def recv_message_from_clients(self, data):
	# 	pass

	def send_message_to_clients(self, message):
		wsgroups.send_message_to_websocket_group(f"simcomms/{str(self.uuid)}", message)

	def _cleanup(self):
		self.is_alive = False

	def on_endpoint_closed(self):
		self.pipes[0].close()
		self.pipes[1].close()
		self._cleanup()
		
		# I don't think joining the child process would be a good idea because it might take a long time
		# for it to actually shutdown (when simulation steps get long)
		# self.process.join()

		return

	def reload_simulation(self):
		self.send_message_to_instance({ "reload": "" })

	def pause_simulation(self):
		self.send_message_to_instance({ "pause": "" })

	def continue_simulation(self):
		self.send_message_to_instance({ "continue": "" })

	def close(self):
		if not self.is_alive:
			return

		self.send_message_to_instance({ "stop": "" })
		self._cleanup()

	def is_running(self):
		return self.is_alive
	
	def get_status_str(self):
		return self.current_status

def create_instance_from_name(backend_name, params):
	if backend_name == "CellModeller5":
		if not settings.ENABLE_CELLMODELLER5:
			raise Exception(f"CellModeller5 is not enabled. To enable CellModeller5, set ENABLE_CELLMODELLER5=True in cloudserver/settings.py")

		return CellModeller5Backend(params)
	elif backend_name == "CellModeller4":
		return CellModeller4Backend(params)
	
	raise Exception(f"Backend type '{backend_name}' is not supported")

# This is what actually runs the simulation
# !!! It runs in a child process !!!
def instance_control_thread(pipe, instance_params):
	# We don't want the simulation's output to go to the output of the main process, 
	# because that will quickly get very messy. Instead, we can redirect the print
	# streams to a file.
	# Because we are running is a subprocess, changing 'sys.stdout' and 'sys.stderr'
	# will only affect the output streams of this simulation instance.
	out_stream = sys.stdout
	err_stream = sys.stderr
	
	# This should probably only be used for debugging
	redirect_io_to_file = True

	if redirect_io_to_file:
		log_file_path = os.path.join(instance_params.root_dir, "log.txt")

		log_stream = open(log_file_path, "w")
		sys.stdout = log_stream
		sys.stderr = log_stream

	is_running = True
	needs_reload = False
	paused_event = threading.Event()
	paused_event.set()

	source_response = ""
	source_response_event = threading.Event()
	source_response_event.set()

	def endpoint_close_callback():
		# We don't have any endpoint-related resources to clean up, but there is no point in
		# running the simulation if we have disconnected from the server, so we should stop the
		# simulation.
		# This may be gratuitous since if the simulation process is shut down properly, it would 
		# have already sent a close message, but its better to be safe than sorry
		nonlocal is_running
		is_running = False

	def recv_message_from_control(message):
		(action, data) = decode_pipe_message(message)

		nonlocal is_running
		nonlocal needs_reload
		nonlocal paused_event
		nonlocal source_response
		nonlocal source_response_event

		if action == "stop":
			is_running = False
		elif action == "reload":
			needs_reload = True
			paused_event.set()
		elif action == "pause":
			paused_event.clear()
		elif action == "continue":
			paused_event.set()
		elif action == "source_response":
			source_response = data
			source_response_event.set()

	endpoint = DuplexPipeEndpoint(pipe, recv_message_from_control, endpoint_close_callback)
	endpoint.start()

	def send_message_to_control(message):
		endpoint.send_item(encode_pipe_message(message))

	print(f"Root directory: {instance_params.root_dir}")
	print(f"Initial CWD: {os.getcwd()}")

	os.chdir(instance_params.root_dir)
	print(f"CWD changed to: {os.getcwd()}")

	index_data = archiver.init_empty_instance_index()

	# This is more of a "sanity try-catch". It is here to make sure that
	# if any exceptions occur, we still properly clean up the simulation instance
	try:
		params = BackendParameters()
		params.sim_root_dir = instance_params.root_dir
		params.cache_relative_prefix = "cache"
		params.cache_dir = os.path.join(params.sim_root_dir, params.cache_relative_prefix)
		params.max_cell_count = instance_params.max_cell_count
		
		while True:
			# Read source file
			send_message_to_control({ "source_request": "" })
			print("Waiting for simulation source...")

			source_response_event.clear()
			source_response_event.wait()
			params.source = source_response

			# Create backend
			backend = create_instance_from_name(instance_params.backend, params)
			backend.initialize()

			# Write shapes
			index_data = archiver.init_empty_instance_index()
			index_data["shape_list"] = backend.get_shape_list()
			
			send_message_to_control({ "newshape": { "new_data": index_data } })
			send_message_to_control({ "status": "running" })

			while is_running and backend.is_running() and not needs_reload:
				# Take another step in the simulation
				backend.step()

				# Write step files
				step_path, viz_bin_path = backend.write_step_files()

				# Its better if we update the index file from the simulation process because, otherwise,
				# some message might get lost when closing the pipe and some step files might not get added
				# to the index file
				index_data["vizframes"].append(viz_bin_path)
				index_data["stepframes"].append(step_path)
				index_data["num_frames"] = len(index_data["stepframes"])

				archiver.write_simulation_index(instance_params.root_dir, index_data)

				send_message_to_control({ "newframe": { "frame_count": index_data["num_frames"], "new_data": index_data } })

				# NOTE(Jason): The stream won't write the results to a file immediately after getting some data.
				# If we close Django from the terminal (with Ctrl+C or Ctrl+Break), then the simulation
				# instance won't be closed properly, and the print output will not be written to the file
				# To avoid this, we'll manually flush the stream after every frame (we might still loose
				# a small amount of print output, but its better than nothing).
				sys.stdout.flush()
				sys.stderr.flush()

				# Wait on the 'paused' event if its set
				if not paused_event.is_set():
					send_message_to_control({ "status": "paused" })
					paused_event.wait()
					send_message_to_control({ "status": "running" })

			backend.shutdown()

			# Handle simulation reload
			if needs_reload:
				needs_reload = False

				send_message_to_control({ "status": "reloading" })
				send_message_to_control({ "newframe": { "frame_count": 0, "new_data": archiver.init_empty_instance_index() } })

				continue

			# If the simulation ends by itself (i.e. it finishes), we don't want to keep running the instance
			break
	except BrokenPipeError:
		# This isn't really a regular error. It happens all the time because the server closes the pipe before
		# the instance has a chance to quit. For now, we won't treat this as an errorand just print a message
		print("IPC pipe was closed")
	except Exception as e:
		exc_message = traceback.format_exc()
		print(exc_message)

		# Add the crash message to the index
		index_data["has_crashed"] = True
		index_data["crash_message"] = str(exc_message)

		archiver.write_simulation_index(instance_params.root_dir, index_data)

		send_message_to_control({ "error_message": { "new_data": index_data } })
		send_message_to_control({ "close": { "abrupt": True } })
	finally:
		send_message_to_control({ "status": "offline" })

		endpoint.shutdown()

	if redirect_io_to_file:
		log_stream.close()