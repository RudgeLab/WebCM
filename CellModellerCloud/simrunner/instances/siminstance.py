import json
from enum import Enum

from saveviewer import archiver as sv_archiver
from simrunner import websocket_groups as wsgroups

class InstanceAction(Enum):
	NEW_FRAME = 1
	STEP_FILE_ADDED = 2
	ERROR_MESSAGE = 3
	MESSAGE_TO_CLIENTS = 4
	CLOSE = 5
	STOP = 6

class InstanceMessage:
	def __init__(self, action: InstanceAction, data=None):
		self.action = action
		self.data = data

class ClientAction(Enum):
	NEW_FRAME = 1
	SIM_HEADER = 2
	ERROR_MESSAGE = 3
	INFO_LOG = 4
	CLOSE_INFO_LOG = 5
	SIM_STOPPED = 6

	RELOAD_DONE = 7

class ClientMessage:
	def __init__(self, action: ClientAction, data=None):
		self.action = action
		self.data = data

class ISimulationInstance:
	def __init__(self, uuid):
		self.is_alive = True
		self.uuid = uuid
	
	def send_item_to_instance(self, item):
		pass

	def send_item_to_clients(self, item):
		wsgroups.send_message_to_websocket_group(f"simcomms/{self.uuid}", item)

	def process_message_from_instance(self, message):
		if not isinstance(message, InstanceMessage):
			return

		# Process the message from the child process and make
		# the message that will be sent to the clients
		if message.action == InstanceAction.NEW_FRAME:
			new_step_data = json.loads(message.data["new_data"])
			frame_count = message.data["frame_count"]

			sv_archiver.get_save_archiver().update_step_data(str(self.params.uuid), new_step_data)

			self.send_item_to_instance(InstanceMessage(InstanceAction.STEP_FILE_ADDED, None))

			self.send_item_to_clients(ClientMessage(ClientAction.NEW_FRAME, { "frameCount": frame_count }))
		elif message.action == InstanceAction.ERROR_MESSAGE:
			self.send_item_to_clients(ClientMessage(ClientAction.ERROR_MESSAGE, str(message.data)))
		elif message.action == InstanceAction.CLOSE:
			self.close()

	def close(self):
		self.is_alive = False

	def is_closed(self):
		return not self.is_alive