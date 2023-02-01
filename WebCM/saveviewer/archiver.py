import os
import json
import pathlib
import shutil

from uuid import UUID, uuid4

class SaveArchiver:
	def __init__(self):
		self.archive_root = "./save-archive/"
		self.sim_data = {}

global__archiver = SaveArchiver()

def initialize_save_archiver():
	global global__archiver

	# Create the root directory
	pathlib.Path(global__archiver.archive_root).mkdir(parents=False, exist_ok=True)

def register_simulation(user, sim_title, sim_desc):
	# We don't want to import this globally because it causes problems
	# when the archiver is imported from the simulation instance process
	from cloudserver.models import SimulationEntry

	global global__archiver

	sim_uuid = uuid4()
	save_dir = os.path.join(global__archiver.archive_root, "simulation_" + str(sim_uuid))

	entry = SimulationEntry(owner=user, title=sim_title, description=sim_desc, uuid=sim_uuid, save_location=save_dir)
	entry.save()

	os.mkdir(save_dir)
	os.mkdir(os.path.join(save_dir, "cache"))

	return entry

def remove_simulation(sim_uuid):
	global global__archiver

	entry = __get_simulation(sim_uuid)
	dir_path = entry.save_location

	entry.delete()

	shutil.rmtree(dir_path)

def update_instance_index(uuid, data):
	global global__archiver

	if data is str:
		raise Exception("Instance data must be a dictionary, not a string")

	global__archiver.sim_data[uuid] = data

def get_instance_index_data(uuid):
	assert type(uuid) is UUID

	global global__archiver

	if not uuid in global__archiver.sim_data:
		sim = __get_simulation(uuid)
		index_path = os.path.join(sim.save_location, "index.json")

		with open(index_path, "r") as index_file:
			index_data = json.loads(index_file.read())

		global__archiver.sim_data[sim.uuid] = index_data

		return index_data
	else:
		return global__archiver.sim_data[uuid]

def get_simulation_step_files(uuid, index):
	simulation = __get_simulation(uuid)
	index_data = get_instance_index_data(uuid)

	step_frame = os.path.join(simulation.save_location, index_data["stepframes"][index])
	viz_frame = os.path.join(simulation.save_location, index_data["vizframes"][index])

	return (step_frame, viz_frame)

def write_empty_index_file(path, backend_version):
	init_index_data = {
		"vizframes": {},
		"stepframes": {},
		"num_frames": 0,
		"backend_version": backend_version,
		"shape_list": [],
	}

	sim_data_str = json.dumps(init_index_data)

	with open(path, "w") as indexfile:
		indexfile.write(sim_data_str)

	return init_index_data

def __update_sim_index(index_path, callback):
	with open(index_path, "r+") as index_file:
		sim_data = json.loads(index_file.read())
		return_value = callback(sim_data)
		sim_data_str = json.dumps(sim_data)

		index_file.seek(0)
		index_file.write(sim_data_str)
		index_file.truncate()

	return return_value

def write_shapes_to_sim_index(index_path, shape_list):
	def update_action(sim_data):
		sim_data["shape_list"] = shape_list

		return sim_data
	
	return __update_sim_index(index_path, update_action)

def write_entry_to_sim_index(index_path, step_file, viz_bin_file):
	def update_action(sim_data):
		frame_count = len(sim_data["vizframes"])
		sim_data["vizframes"][frame_count] = viz_bin_file
		sim_data["stepframes"][frame_count] = step_file
		sim_data["num_frames"] = frame_count + 1

		return (sim_data, frame_count)

	return __update_sim_index(index_path, update_action)

def read_sim_source_from_location(location):
	source_path = os.path.join(location, "source.py")
	
	with open(source_path, "r") as source_file:
		return source_file.read()

def write_sim_source_to_location(location, source_content):
	source_path = os.path.join(location, "source.py")
	
	with open(source_path, "wb") as source_file:
		source_file.write(source_content.encode("utf-8"))

def read_simulation_source(uuid):
	simulation = __get_simulation(uuid)
	return read_sim_source_from_location(simulation.save_location)

def write_simulation_source(uuid, source_content):
	simulation = __get_simulation(uuid)
	write_sim_source_to_location(simulation.save_location, source_content)

def __get_simulation(id):
	from cloudserver.models import lookup_simulation

	return lookup_simulation(id)