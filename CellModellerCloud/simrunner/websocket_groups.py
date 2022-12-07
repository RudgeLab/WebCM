import threading

# NOTE(Jason): This is basically a simplified, custom version of Django channels. I tried using channels,
# but for some reason, they were quite slow. I'm not sure if this is because the default, in-memory
# channel layer is for testing purposes only, or if its because channels are generally a bit slow.
global__ws_groups = {}
global__ws_group_lock = threading.Lock()

def add_websocket_to_group(group_name: str, consumer):
	global global__ws_groups
	global global__ws_group_lock

	with global__ws_group_lock:
		if not group_name in global__ws_groups:
			global__ws_groups[group_name] = []

		global__ws_groups[group_name].append(consumer)

def remove_websocket_from_group(group_name: str, consumer):
	global global__ws_groups
	global global__ws_group_lock

	with global__ws_group_lock:
		group = global__ws_groups.get(group_name, None)
		if group is None: return

		if consumer in group:
			group.remove(consumer)

		if len(group) == 0:
			del global__ws_groups[group_name]

def send_message_to_websocket_group(group_name: str, message):
	global global__ws_groups
	global global__ws_group_lock

	with global__ws_group_lock:
		group = global__ws_groups.get(group_name, None)
		if group is None: return

		for client in group:
			client.send_client_message(message)

def close_websocket_group(group_name: str, close_code=None, close_message=None):
	global global__ws_groups
	global global__ws_group_lock

	with global__ws_group_lock:
		group = global__ws_groups.get(group_name, None)
		if group is None: return
		
	for client in group:
		client.on_websocket_group_closed()