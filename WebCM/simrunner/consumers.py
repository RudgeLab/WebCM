from channels.generic.websocket import WebsocketConsumer

from cloudserver.models import lookup_simulation
from saveviewer import archiver

from simrunner import websocket_groups as wsgroups
from simrunner.instances import clientmessages
from simrunner.instances import manager

from uuid import UUID

import json

class UserCommsConsumer(WebsocketConsumer):
	def __init__(self, *args, **kwargs):
		super().__init__(args, kwargs)

	def connect(self):
		self.sim_uuid = None
		self.is_reloading = False
		self.accept()

	def receive(self, text_data):
		msg_data = json.loads(text_data)
		
		if msg_data["action"] == "connectto":
			uuid = UUID(msg_data["data"])

			if not lookup_simulation(uuid) is None:
				if not self.sim_uuid == None:
					wsgroups.remove_websocket_from_group(f"simcomms/{self.sim_uuid}", self)

				self.sim_uuid = uuid

				wsgroups.add_websocket_to_group(f"simcomms/{self.sim_uuid}", self)

				self.send_sim_header()
			else:
				# The UUID provided does not match any simulation, either online or offline
				self.close(code=4101)
		elif msg_data["action"] == "getheader":
			self.send_sim_header()
		elif msg_data["action"] == "stop":
			manager.kill_simulation(self.sim_uuid)
		elif msg_data["action"] == "reload":
			if self.is_reloading:
				return
			
			self.is_reloading = True
			cold_restart = self.handle_reload_action()
			self.is_reloading = False

			if cold_restart:
				self.send_sim_header()

		return
	
	def disconnect(self, close_code):
		wsgroups.remove_websocket_from_group(f"simcomms/{self.sim_uuid}", self)

	def handle_reload_action(self):
		if manager.is_simulation_running(self.sim_uuid):
			manager.reload_simulation(self.sim_uuid)
			return False
		else:
			manager.resurrect_simulation(self.sim_uuid)
			return True

	def send_sim_header(self):
		simulation = lookup_simulation(self.sim_uuid)
		index_data = archiver.get_instance_index_data(self.sim_uuid)
		is_online = manager.is_simulation_running(self.sim_uuid)

		response_data = {
			"uuid": str(simulation.uuid),
			"name": simulation.title,
			"frameCount": index_data["num_frames"],
			"isOnline": is_online,
			"crashMessage": index_data["crash_message"] if index_data["has_crashed"] else None
		}

		self.send_message_data("simheader", response_data)

	def send_client_message(self, message):
		if type(message) == clientmessages.NewFrame:
			self.send_message_data("newframe", { "frameCount": message.frame_count })
		elif type(message) == clientmessages.NewShape:
			self.send_message_data("newshape", "")
		elif type(message) == clientmessages.ErrorMessage:
			self.send_message_data("error_message", message.message)

	def send_message_data(self, action, data):
		self.send(text_data=json.dumps({ "action": action, "data": data }))

	def on_websocket_group_closed(self):
		self.send_message_data("simstopped", "")