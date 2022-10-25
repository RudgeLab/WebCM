import threading

# NOTE(Jason): This is basically a simplified, custom version of Django channels. I tired using channels,
# but for some reason, they were quite slow. I'm not sure if this is because the default, in-memory
# channel layer is for testing purposes only, or if its because channels are generally a bit slow.
global__ws_groups = {}
global__ws_group_lock = threading.Lock()

class __WsGroupCloseMarker:
	def __init__(self, code, message):
		self.code = code
		self.message = message

def create_websocket_group(group_name: str):
	global global__ws_groups
	global global__ws_group_lock

	with global__ws_group_lock:
		if group_name in global__ws_groups:
			raise KeyError(f"WebSocket group '{group_name}' already exists")

		global__ws_groups[group_name] = []

def close_websocket_group(group_name: str, close_code=None, close_message=None):
	global global__ws_groups
	global global__ws_group_lock

	with global__ws_group_lock:
		# NOTE(Jason): When we close the connection object, the communication thread will
		# remove the client from the clients list. This is going to cause a problem, since
		# we are also iterating over the list of clients. To solve this, we can just create
		# a copy (shallow copy) of the clients list and iterate over that
		group = global__ws_groups.get(group_name, None)

		if (group is None) or (type(group) is __WsGroupCloseMarker):
			return

		global__ws_groups[group_name] = __WsGroupCloseMarker(close_code, close_message)
		
	for client in group:
		client.on_websocket_group_closed()

def get_close_parameters(group_name: str):
	global global__ws_groups
	global global__ws_group_lock

	with global__ws_group_lock:
		group = global__ws_groups.get(group_name, None)

		# Return None if the group doesn't exist, or the group is still active
		if (group is None) or (not type(group) is __WsGroupCloseMarker):
			return None
		
	return (group.code, group.message)

def add_websocket_to_group(group_name: str, consumer):
	global global__ws_groups
	global global__ws_group_lock

	with global__ws_group_lock:
		group = global__ws_groups.get(group_name, None)

		if (group is None) or (type(group) is __WsGroupCloseMarker):
			return False

		group.append(consumer)

	return True

def remove_websocket_from_group(group_name: str, consumer):
	global global__ws_groups
	global global__ws_group_lock

	with global__ws_group_lock:
		group = global__ws_groups.get(group_name, None)

		if (group is None) or (type(group) is __WsGroupCloseMarker):
			return

		if consumer in group:
			group.remove(consumer)

def send_message_to_websocket_group(group_name: str, message):
	global global__ws_groups
	global global__ws_group_lock

	with global__ws_group_lock:
		group = global__ws_groups.get(group_name, None)

		if (group is None) or (type(group) is __WsGroupCloseMarker):
			return

		for client in group:
			client.send_client_message(message)