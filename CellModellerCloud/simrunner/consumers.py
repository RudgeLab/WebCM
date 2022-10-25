from multiprocessing.connection import Client
from channels.generic.websocket import WebsocketConsumer
import json

from saveviewer import archiver as sv_archiver

from . import websocket_groups as wsgroups
from .instances.manager import is_simulation_running, send_message_to_simulation, kill_simulation
from .instances.siminstance import ClientAction, ClientMessage

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
			all_sims = sv_archiver.get_save_archiver().get_all_sim_data()

			if msg_data["data"] in all_sims:
				if not self.sim_uuid == None:
					wsgroups.remove_websocket_from_group(f"simcomms/{self.sim_uuid}", self)

				self.sim_uuid = msg_data["data"]

				wsgroups.add_websocket_to_group(f"simcomms/{self.sim_uuid}", self)

				self.send_sim_header()
			else:
				self.close(code=4101)
		elif msg_data["action"] == "getheader":
			self.send_sim_header()
		elif msg_data["action"] == "stop":
			kill_simulation(self.sim_uuid)
		elif msg_data["action"] == "msgtoinstance":
			send_message_to_simulation(self.sim_uuid, msg_data["data"])
		elif not self.custom_action_callback == None:
			self.custom_action_callback(msg_data["action"], msg_data["data"], self)

		return

	def send_sim_header(self):
		archiver = sv_archiver.get_save_archiver()

		sim_data = archiver.get_sim_index_data(self.sim_uuid)
		is_online = is_simulation_running(self.sim_uuid)

		response_data = {
			"uuid": self.sim_uuid,
			"name": sim_data["name"],
			"frameCount": sim_data["num_frames"],
			"isOnline": is_online
		}

		self.send_client_message(ClientMessage(ClientAction.SIM_HEADER, response_data))

	def send_client_message(self, message):
		action_names = {
			ClientAction.NEW_FRAME: "newframe",
			ClientAction.SIM_HEADER: "simheader",
			ClientAction.ERROR_MESSAGE: "error_message",
			ClientAction.INFO_LOG: "infolog",
			ClientAction.CLOSE_INFO_LOG: "closeinfolog",
			ClientAction.RELOAD_DONE: "reloaddone",
			ClientAction.SIM_STOPPED: "simstopped",
		}

		data = {} if message.data is None else message.data

		message_json = { "action": action_names[message.action], "data": data }
		self.send(text_data=json.dumps(message_json))

	def on_websocket_group_closed(self):
		self.send_client_message(ClientMessage(ClientAction.SIM_STOPPED, None))
		