import threading

from simrunner.instances.siminstance import SimulationInstance

from saveviewer import archiver
from uuid import UUID

# NOTE(Jason): Yes, I know that globals are considered bad practice, but I couldn't find another way to do it.
# This isn't "just some data that you can save in a database", so all solutions that invlove persistent
# storage or caching are out the window. We also cannot use sessions because they are limited to a single
# client connection.
# I'm going to give it a bit of an unorthodox name so that is doesn't get used somewhere else accidentally
global__active_instances = {}
global__instance_lock = threading.Lock()

def create_simulation(user, sim_title, sim_desc, sim_source, sim_version):
	global global__active_instances
	global global__instance_lock

	sim_entry = archiver.register_simulation(user, sim_title, sim_desc)
	sim_uuid = sim_entry.uuid

	with global__instance_lock:
		archiver.write_sim_source_to_location(sim_entry.save_location, sim_source)

		sim_instance = SimulationInstance(sim_uuid, sim_version, sim_entry.save_location)
		sim_instance.launch()

		global__active_instances[sim_uuid] = sim_instance

	return sim_uuid

def kill_simulation(uuid):
	assert type(uuid) is UUID

	global global__active_instances
	global global__instance_lock

	with global__instance_lock:
		sim_instance = global__active_instances.pop(uuid, None)

		if sim_instance is None:
			return False
		
		sim_instance.close()

	return True

def delete_simulation(uuid):
	assert type(uuid) is UUID
	
	kill_simulation(uuid)
	archiver.remove_simulation(uuid)

def is_simulation_running(uuid):
	assert type(uuid) is UUID

	global global__active_instances
	global global__instance_lock

	with global__instance_lock:
		if not uuid in global__active_instances:
			return False

		process = global__active_instances[uuid]
		return not process.is_closed() if not process is None else True

def reload_simulation(uuid):
	assert type(uuid) is UUID

	global global__active_instances
	global global__instance_lock

	# NOTE(Jason): Originally, the message was sent to the simulation while the lock
	# was still acquired. I changed it because it caused some problems with 'simthread'.
	# There is a slight chance that this could cause an issue (e.g. if someone closes but before
	# the simulation instance after the instance is retreived from 'global__active_instances',
	# 'send_item_to_instance' is invoked), but I think its highly unlikely that it will happen.
	with global__instance_lock:
		sim_instance = global__active_instances[uuid]
	
	sim_instance.reload_simulation()