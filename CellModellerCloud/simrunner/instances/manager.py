import threading

from simrunner import websocket_groups as wsgroups

from .siminstance import ClientAction, ClientMessage

# NOTE(Jason): Yes, I know that globals are considered bad practice, but I couldn't find another way to do it.
# This isn't "just some data that you can save in a database", so all solutions that invlove persistent
# storage or caching are out the window. We also cannot use sessions because they are limited to a single
# client connection.
# I'm going to give it a bit of an unorthodox name so that is doesn't get used somewhere else accidentally
global__active_instances = {}
global__instance_lock = threading.Lock()

def spawn_simulation(uuid: str, proc_class: type, proc_args: tuple=None, should_create_ws_group: bool=True):
	global global__active_instances
	global global__instance_lock

	if should_create_ws_group:
		wsgroups.create_websocket_group(f"simcomms/{uuid}")

	with global__instance_lock:
		global__active_instances[uuid] = proc_class() if proc_args is None else proc_class(*proc_args)

	return

def kill_simulation(uuid: str, remove_only=False):
	global global__active_instances
	global global__instance_lock

	with global__instance_lock:
		sim_instance = global__active_instances.pop(uuid, None)

		if sim_instance is None:
			return False
		
		if not remove_only:
			print(f"[Simulation Runner]: Stopping simulation '{uuid}'")

			sim_instance.close()

	wsgroups.close_websocket_group(f"simcomms/{uuid}")

	return True

def is_simulation_running(uuid: str):
	global global__active_instances
	global global__instance_lock

	with global__instance_lock:
		if not uuid in global__active_instances:
			return False

		process = global__active_instances[uuid]
		return not process.is_closed() if not process is None else True

def send_message_to_simulation(uuid: str, message):
	global global__active_instances
	global global__instance_lock

	# NOTE(Jason): Originally, the message was sent to the simulation while the lock
	# was still acquired. I changed it because it caused some problems with 'simthread'.
	# There is a slight chance that this could cause an issue (e.g. if someone closes but before
	# the simulation instance after the instance is retreived from 'global__active_instances',
	# 'send_item_to_instance' is invoked), but I think its highly unlikely that it will happen.
	with global__instance_lock:
		sim_instance = global__active_instances[uuid]
	
	sim_instance.send_item_to_instance(message)