from channels.generic.websocket import WebsocketConsumer
import json

from simrunner import websocket_groups as wsgroups
from simrunner.instances.manager import is_simulation_running, send_message_to_simulation

from .apps import get_dbgservlet_instance

"""
Both of these are basically modified version of the consumer classes in 'simrunner.consumers'. I' 
"""
class SimCommsConsumer(WebsocketConsumer):
	def connect(self):
		self.sim_uuid = str(get_dbgservlet_instance().sim_uuid)

		if not is_simulation_running(self.sim_uuid):
			self.close(code=4101)
			return

		wsgroups.add_websocket_to_group(f"simcomms/{self.sim_uuid}", self)

		self.accept()

	def disconnect(self, close_code):
		wsgroups.remove_websocket_from_group(f"simcomms/{self.sim_uuid}", self)

	def receive(self, text_data):
		send_message_to_simulation(self.sim_uuid, json.loads(text_data))

class InitLogsConsumer(WebsocketConsumer):
	def connect(self):
		self.sim_uuid = str(get_dbgservlet_instance().sim_uuid)

		self.accept()

		close_parameters = wsgroups.get_close_parameters(f"initlogs/{self.sim_uuid}")
		if not close_parameters is None:
			if not close_parameters[1] is None:
				self.send(text_data=str(close_parameters[1]))
			
			self.close(code=close_parameters[0])
			return

		if not wsgroups.add_websocket_to_group(f"initlogs/{self.sim_uuid}", self):
			self.close(code=4102)

	def disconnect(self, close_code):
		wsgroups.remove_websocket_from_group(f"initlogs/{self.sim_uuid}", self)