import multiprocessing as mp
import traceback
import sys, os

from .duplex_pipe_endpoint import DuplexPipeEndpoint

from .manager import kill_simulation
from .siminstance import ISimulationInstance, InstanceAction, InstanceMessage

from simrunner.backends.cellmodeller4 import CellModeller4Backend
from simrunner.backends.cellmodeller5 import CellModeller5Backend
from saveviewer import archiver as sv_archiver

class SimulationProcess(ISimulationInstance):
	def __init__(self, params):
		super(SimulationProcess, self).__init__(params.uuid)
		self.params = params

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

		# Create a new process and start it
		self.process = ctx.Process(target=instance_control_thread, args=(child_pipe,params), daemon=True)
		self.process.start()

		# We also need to create a thread to communicate with the instance process
		self.endpoint = DuplexPipeEndpoint(parent_pipe, self.on_message_from_instance, self.on_endpoint_closed)
		self.endpoint.start()

		print(f"[INSTANCE CONTROLLER]: Started instance controller")

	def __del__(self):
		self.close()

	def on_message_from_instance(self, message):
		# Another "sanity-check" try-except
		try:
			super().process_message_from_instance(message)
		except Exception:
			traceback.print_exc()

		return

	def on_endpoint_closed(self):
		kill_simulation(self.params.uuid, True)

		self.pipes[0].close()
		self.pipes[1].close()

		# I don't think joining the child process would be a good idea because it might take a long time
		# for it to actually shutdown (when simulation steps get long)
		# self.process.join()

		print(f"[INSTANCE CONTROLLER]: Closed instance controller")

	def send_item_to_instance(self, item):
		super().send_item_to_instance(item)
		self.endpoint.send_item(item)

	def close(self):
		super().close()
		
		self.endpoint.send_item(InstanceMessage(InstanceAction.STOP, None))
		#self.endpoint.shutdown()

# This is what actually runs the simulation
# !!! It runs in a child process !!!
def instance_control_thread(pipe, params):
	# We don't want the simulation's output to go to the output of the main process, 
	# because that will quickly get very messy. Instead, we can redirect the print
	# streams to a file.
	# Because we are running is a subprocess, changing 'sys.stdout' and 'sys.stderr'
	# will only affect the output streams of this simulation instance.
	out_stream = sys.stdout
	err_stream = sys.stderr

	log_file_path = os.path.join(params.sim_root_dir, "log.txt")

	log_stream = open(log_file_path, "w")
	sys.stdout = log_stream
	sys.stderr = log_stream

	# Create pipe endpoint
	out_stream.write(f"[INSTANCE PROCESS]: Creating instance process\n")

	running = True

	def endpoint_callback():
		# We don't have any endpoint-related resources to clean up, but there is no point in
		# running the simulation if we have disconnected from the server, so we should stop the
		# simulation.
		# This may be gratuitous since if the simulation process is shut down properly, it would 
		# have already sent a close message, but its better to be safe than sorry
		nonlocal running
		running = False

	def got_user_message(message):
		if not isinstance(message, InstanceMessage):
			return

		if message.action == InstanceAction.STOP:
			endpoint_callback()

			out_stream.write(f"[INSTANCE PROCESS]: Stopping simulation loop\n")

		return

	endpoint = DuplexPipeEndpoint(pipe, got_user_message, endpoint_callback)
	endpoint.start()

	# This is more of a "sanity try-catch". It is here to make sure that
	# if any exceptions occur, we still properly clean up the simulation instance
	try:
		if params.backend_version == "CellModeller5":
			backend = CellModeller5Backend(params)
		else:
			backend = CellModeller4Backend(params)

		backend.initialize()

		while running and backend.is_running():
			# Take another step in the simulation
			backend.step()

			# Write step files
			step_path, viz_bin_path = backend.write_step_files()

			# Its better if we update the index file from the simulation process because, otherwise,
			# some message might get lost when closing the pipe and some step files might not get added
			# to the index file
			index_path = os.path.join(params.sim_root_dir, "index.json")
			sim_data_str, frame_count = sv_archiver.add_entry_to_sim_index(index_path, step_path, viz_bin_path)

			endpoint.send_item(InstanceMessage(InstanceAction.NEW_FRAME, { "frame_count": frame_count, "new_data": sim_data_str }))

			# NOTE(Jason): The stream won't write the results to a file immediately after getting some data.
			# If we close Django from the terminal (with Ctrl+C or Ctrl+Break), then the simulation
			# instance won't be closed properly, and the print output will not be written to the file
			# To avoid this, we'll manually flush the stream after every frame (we might still loose
			# a small amount of print output, but its better than nothing).
			log_stream.flush()

		backend.shutdown()

		# Clean up instance
		out_stream.write(f"[INSTANCE PROCESS]: Closing instance process\n")

		endpoint.send_item(InstanceMessage(InstanceAction.CLOSE, { "abrupt": False }))
		endpoint.shutdown()
	except Exception as e:
		exc_message = traceback.format_exc()
		out_stream.write(exc_message)
		out_stream.write(f"[INSTANCE PROCESS]: Instance process terminated due to exception\n")

		endpoint.send_item(InstanceMessage(InstanceAction.ERROR_MESSAGE, str(exc_message)))
		endpoint.send_item(InstanceMessage(InstanceAction.CLOSE, { "abrupt": True }))
		endpoint.shutdown()

	log_stream.close()
