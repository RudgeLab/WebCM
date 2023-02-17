import multiprocessing as mp
import traceback
import json
import sys, os

from saveviewer import archiver

from simrunner import websocket_groups as wsgroups

from simrunner.backends.backend import BackendParameters
from simrunner.backends.cellmodeller4 import CellModeller4Backend
from simrunner.backends.cellmodeller5 import CellModeller5Backend

from simrunner.instances import clientmessages
from simrunner.instances.duplex_pipe_endpoint import DuplexPipeEndpoint

class _InstanceProcessParams:
	root_dir = ""
	source_path = ""
	backend = ""

def decode_json_message(message):
	message_json = json.loads(message)
	message_key = list(message_json)[0]
	message_value = message_json[message_key]

	return (message_key, message_value)

class SimulationInstance:
	def __init__(self, uuid, version, root_path):
		self.uuid = uuid
		self.backend_version = version
		self.root_path = os.path.abspath(root_path)
		self.is_alive = True
	
	def __del__(self):
		self.close()

	def launch(self):
		# Setup the simulation directory
		index_data = archiver.write_empty_index_file(os.path.join(self.root_path, "index.json"), self.backend_version)
		archiver.update_instance_index(self.uuid, index_data)

		# Launch the simulation process
		params = _InstanceProcessParams()
		params.root_dir = self.root_path
		params.source_path = self.get_source_file_path()
		params.backend = self.backend_version

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
		self.process = ctx.Process(target=instance_control_thread, args=(child_pipe, params), daemon=True)
		self.process.start()

		# We also need to create a thread to communicate with the instance process
		self.endpoint = DuplexPipeEndpoint(parent_pipe, self.recv_message_from_instance, self.on_endpoint_closed)
		self.endpoint.start()

	def recv_message_from_instance(self, message):
		(action, data) = decode_json_message(message)

		if action == "newframe":
			archiver.update_instance_index(self.uuid, data["new_data"])

			self.send_message_to_clients(clientmessages.NewFrame(data["frame_count"]))
		elif action == "newshape":
			archiver.update_instance_index(self.uuid, data["new_data"])

			self.send_message_to_clients(clientmessages.NewShape())
		elif action == "error_message":
			self.send_message_to_clients(clientmessages.ErrorMessage(data))
		elif action == "close":
			self._cleanup()

	def send_message_to_instance(self, message):
		self.endpoint.send_item(json.dumps(message))

	# This is not needed. All messages coming from clients are handled by the WebSocket consumers
	# def recv_message_from_clients(self, data):
	# 	pass

	def send_message_to_clients(self, message):
		wsgroups.send_message_to_websocket_group(f"simcomms/{str(self.uuid)}", message)

	def get_source_file_path(self):
		return os.path.join(self.root_path, "source.py")

	def _cleanup(self):
		if not self.is_alive:
			return

		wsgroups.close_websocket_group(f"simcomms/{self.uuid}")

		self.is_alive = False

	def on_endpoint_closed(self):
		self._cleanup()

		self.pipes[0].close()
		self.pipes[1].close()
		
		# I don't think joining the child process would be a good idea because it might take a long time
		# for it to actually shutdown (when simulation steps get long)
		# self.process.join()

		return

	def reload_simulation(self):
		self.send_message_to_instance({ "reload": "" })

	def close(self):
		if not self.is_alive:
			return

		self.send_message_to_instance({ "stop": "" })
		self._cleanup()

	def is_closed(self):
		return not self.is_alive

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

	log_file_path = os.path.join(instance_params.root_dir, "log.txt")

	log_stream = open(log_file_path, "w")
	sys.stdout = log_stream
	sys.stderr = log_stream

	running = True
	needs_reload = False

	def endpoint_callback():
		# We don't have any endpoint-related resources to clean up, but there is no point in
		# running the simulation if we have disconnected from the server, so we should stop the
		# simulation.
		# This may be gratuitous since if the simulation process is shut down properly, it would 
		# have already sent a close message, but its better to be safe than sorry
		nonlocal running
		running = False

	def recv_message_from_control(message):
		(action, data) = decode_json_message(message)

		if action == "stop":
			nonlocal running
			running = False
		elif action == "reload":
			nonlocal needs_reload
			needs_reload = True

	endpoint = DuplexPipeEndpoint(pipe, recv_message_from_control, endpoint_callback)
	endpoint.start()

	def send_message_to_control(message):
		endpoint.send_item(json.dumps(message))

	print(f"Root directory: {instance_params.root_dir}")
	print(f"Initial CWD: {os.getcwd()}")

	os.chdir(instance_params.root_dir)
	print(f"CWD changed to: {os.getcwd()}")

	# This is more of a "sanity try-catch". It is here to make sure that
	# if any exceptions occur, we still properly clean up the simulation instance
	try:
		params = BackendParameters()
		params.sim_root_dir = instance_params.root_dir
		params.cache_relative_prefix = "cache"
		params.cache_dir = os.path.join(params.sim_root_dir, params.cache_relative_prefix)
		
		index_path = os.path.join(params.sim_root_dir, "index.json")

		while True:
			# Read source file
			with open(instance_params.source_path, "rt") as srcfile:
				params.source = srcfile.read()

			# Create backend
			if instance_params.backend == "CellModeller5":
				backend = CellModeller5Backend(params)
			else:
				backend = CellModeller4Backend(params)

			# Run the backend
			backend.initialize()

			# Write shapes
			index_data = archiver.write_shapes_to_sim_index(index_path, backend.get_shape_list())
			
			send_message_to_control({ "newshape": { "new_data": index_data } })

			while running and backend.is_running() and not needs_reload:
				# Take another step in the simulation
				backend.step()

				# Write step files
				step_path, viz_bin_path = backend.write_step_files()

				# Its better if we update the index file from the simulation process because, otherwise,
				# some message might get lost when closing the pipe and some step files might not get added
				# to the index file
				index_data, frame_count = archiver.write_entry_to_sim_index(index_path, step_path, viz_bin_path)

				send_message_to_control({ "newframe": { "frame_count": frame_count, "new_data": index_data } })

				# NOTE(Jason): The stream won't write the results to a file immediately after getting some data.
				# If we close Django from the terminal (with Ctrl+C or Ctrl+Break), then the simulation
				# instance won't be closed properly, and the print output will not be written to the file
				# To avoid this, we'll manually flush the stream after every frame (we might still loose
				# a small amount of print output, but its better than nothing).
				log_stream.flush()

			backend.shutdown()

			# Handle simulation reload
			if needs_reload:
				needs_reload = False

				index_data = archiver.write_empty_index_file(index_path, instance_params.backend)

				send_message_to_control({ "newframe": { "frame_count": 0, "new_data": index_data } })

				continue

			# If the simulation ends by itself (i.e. it finishes), we don't want to keep running the instance
			break

		endpoint.shutdown()
	except Exception as e:
		exc_message = traceback.format_exc()
		print(exc_message)

		send_message_to_control({ "error_message": str(exc_message) })
		send_message_to_control({ "close": { "abrupt": True } })
		endpoint.shutdown()

	log_stream.close()