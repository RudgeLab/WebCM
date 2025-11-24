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

def create_simulation(user, sim_title, sim_desc, sim_source, sim_version, sim_max_size):
	global global__active_instances
	global global__instance_lock

	assert type(sim_max_size) is int

	sim_uuid = archiver.register_simulation(user, sim_title, sim_desc, sim_max_size)
	save_dir = archiver.get_simulation_location(sim_uuid)

	with global__instance_lock:
		archiver.write_sim_source_to_location(save_dir, sim_source)

		sim_instance = SimulationInstance(sim_uuid, sim_version, save_dir, sim_max_size)
		sim_instance.launch()

		global__active_instances[sim_uuid] = sim_instance

	return sim_uuid

def delete_simulation(uuid):
	assert type(uuid) is UUID
	
	kill_simulation(uuid)
	archiver.remove_simulation(uuid)

def get_simulation_status(uuid):
	assert type(uuid) is UUID

	global global__active_instances
	global global__instance_lock

	with global__instance_lock:
		if uuid in global__active_instances:
			return global__active_instances[uuid].get_status_str()
		else:
			return "offline"

def kill_simulation(uuid):
	assert type(uuid) is UUID

	global global__active_instances
	global global__instance_lock

	with global__instance_lock:
		sim_instance = global__active_instances.pop(uuid, None)
		if sim_instance is None: return False
		
		sim_instance.close()

	return True

def continue_simulation(uuid):
	assert type(uuid) is UUID

	global global__active_instances
	global global__instance_lock

	with global__instance_lock:
		sim_instance = global__active_instances.get(uuid, None)
		if sim_instance is None: return False
	
	sim_instance.continue_simulation()

	return True

def pause_simulation(uuid):
	assert type(uuid) is UUID

	global global__active_instances
	global global__instance_lock

	with global__instance_lock:
		sim_instance = global__active_instances.get(uuid, None)
		if sim_instance is None: return False
	
	sim_instance.pause_simulation()

	return True

def reload_simulation(uuid):
	assert type(uuid) is UUID

	global global__active_instances
	global global__instance_lock

	is_running = False

	with global__instance_lock:
		sim_instance = global__active_instances.get(uuid, None)
		is_running = (not sim_instance is None) and sim_instance.is_running()

	if is_running:
		# NOTE(Jason): Originally, the message was sent to the simulation while the lock
		# was still acquired. I changed it because it caused some problems with 'simthread'.
		# There is a slight chance that this could cause an issue (e.g. if someone closes but before
		# the simulation instance after the instance is retreived from 'global__active_instances',
		# 'send_item_to_instance' is invoked), but I think its highly unlikely that it will happen.
		with global__instance_lock:
			sim_instance = global__active_instances.get(uuid, None)
			if sim_instance is None: return False
		
		sim_instance.reload_simulation()
	else:
		from cloudserver.models import lookup_simulation

		save_dir = archiver.get_simulation_location(uuid)
		index_data = archiver.get_instance_index_data(uuid)
		simulation = lookup_simulation(uuid)

		with global__instance_lock:
			sim_instance = SimulationInstance(uuid, index_data["backend_version"], save_dir, simulation.max_cell_count)
			sim_instance.launch()

			global__active_instances[uuid] = sim_instance

	return True