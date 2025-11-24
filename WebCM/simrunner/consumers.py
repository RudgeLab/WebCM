from channels.generic.websocket import WebsocketConsumer

from cloudserver.models import lookup_simulation
from saveviewer import archiver

from simrunner import websocket_groups as wsgroups
from simrunner.instances import clientmessages
from simrunner.instances import manager

from uuid import UUID

import json
import traceback

class UserCommsConsumer(WebsocketConsumer):
	def __init__(self, *args, **kwargs):
		super().__init__(args, kwargs)

	def connect(self):
		self.sim_uuid = None
		self.is_reloading = False
		self.accept()

	def receive(self, text_data):
		try: 
			msg_data = json.loads(text_data)
			msg_action  = msg_data["action"]
			msg_payload = msg_data["data"]

			if False: pass # This exists for formatting reasons
			elif msg_action == "connectto": self.handle_connectto(msg_payload)
			elif msg_action == "start": self.handle_start()
			elif msg_action == "stop": self.handle_stop()
			elif msg_action == "pause": self.handle_pause()
			elif msg_action == "reload": self.handle_reload()
		except Exception:
			self.send_message("error_message", f"Exception occured in websocket connection handler:\n{traceback.format_exc()}")
		
		return
	
	def disconnect(self, close_code):
		wsgroups.remove_websocket_from_group(f"simcomms/{self.sim_uuid}", self)
	
	##
	## Request handlers
	##

	def handle_connectto(self, data):
		uuid = UUID(data)

		if lookup_simulation(uuid) is None:
			self.close(code=4101)
			return

		if not self.sim_uuid == None:
			wsgroups.remove_websocket_from_group(f"simcomms/{self.sim_uuid}", self)

		wsgroups.add_websocket_to_group(f"simcomms/{uuid}", self)
		self.sim_uuid = uuid

		# Send simulation information to the client
		simulation = lookup_simulation(self.sim_uuid)
		index_data = archiver.get_instance_index_data(self.sim_uuid)
		status = manager.get_simulation_status(self.sim_uuid)

		response_data = {
			"uuid": str(simulation.uuid),
			"name": simulation.title,
			"maxSimSize": simulation.max_cell_count,

			"status": status,

			"frameCount": index_data["num_frames"],
			"crashMessage": index_data["crash_message"] if index_data.get("has_crashed") else None
		}

		self.send_message("connectheader", response_data)

	def handle_start(self):
		manager.continue_simulation(self.sim_uuid)
	
	def handle_pause(self):
		manager.pause_simulation(self.sim_uuid)
		
	def handle_stop(self):
		manager.kill_simulation(self.sim_uuid)

	def handle_reload(self):
		manager.reload_simulation(self.sim_uuid)

	def send_client_message(self, message):
		if False: pass
		elif type(message) == clientmessages.NewFrame: self.send_message("newframe", { "frameCount": message.frame_count })
		elif type(message) == clientmessages.NewShape: self.send_message("newshape", "")
		elif type(message) == clientmessages.Status:   self.send_message("status_change", message.status)
		elif type(message) == clientmessages.ErrorMessage: self.send_message("error_message", message.message)

	def send_message(self, action, data):
		self.send(text_data=json.dumps({ "action": action, "data": data }))