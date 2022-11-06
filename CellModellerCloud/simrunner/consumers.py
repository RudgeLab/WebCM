from channels.generic.websocket import WebsocketConsumer

from saveviewer import archiver

from simrunner import websocket_groups as wsgroups
from simrunner.instances import clientmessages
from simrunner.instances import manager

from uuid import UUID

import json

class UserCommsConsumer(WebsocketConsumer):
	def __init__(self, custom_action_callback=None, *args, **kwargs):
		super().__init__(args, kwargs)

		self.custom_action_callback = custom_action_callback

	def connect(self):
		self.sim_uuid = None
		self.accept()

	def receive(self, text_data):
		msg_data = json.loads(text_data)
		
		if msg_data["action"] == "connectto":
			uuid = UUID(msg_data["data"])

			if not archiver.get_simulation(uuid) is None:
				if not self.sim_uuid == None:
					wsgroups.remove_websocket_from_group(f"simcomms/{self.sim_uuid}", self)

				self.sim_uuid = uuid

				wsgroups.add_websocket_to_group(f"simcomms/{self.sim_uuid}", self)

				self.send_sim_header()
			else:
				self.close(code=4101)
		elif msg_data["action"] == "getheader":
			self.send_sim_header()
		elif msg_data["action"] == "stop":
			manager.kill_simulation(self.sim_uuid)
		elif msg_data["action"] == "reload":
			manager.reload_simulation(self.sim_uuid)

		return

	def send_sim_header(self):
		simulation = archiver.get_simulation(self.sim_uuid)
		index_data = archiver.get_instance_index_data(self.sim_uuid)
		is_online = manager.is_simulation_running(self.sim_uuid)

		response_data = {
			"uuid": str(simulation.uuid),
			"name": simulation.title,
			"frameCount": index_data["num_frames"],
			"isOnline": is_online
		}

		self.send_message_data("simheader", response_data)

	def send_client_message(self, message):
		if type(message) == clientmessages.NewFrame:
			self.send_message_data("newframe", { "frameCount": message.frame_count })
		elif type(message) == clientmessages.ErrorMessage:
			self.send_message_data("error_message", message.message)

	def send_message_data(self, action, data):
		self.send(text_data=json.dumps({ "action": action, "data": data }))

	def on_websocket_group_closed(self):
		self.send_message_data("simstopped", "")