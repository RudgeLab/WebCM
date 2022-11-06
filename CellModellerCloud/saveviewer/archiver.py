import os
import json
import pathlib

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

	# We don't want to import this globally because it causes problems
	# when the archiver is imported from the simulation instance process
	from cloudserver.models import SimulationEntry

	global__archiver.sim_data = {}

	for sim in SimulationEntry.objects.all():
		index_path = os.path.join(sim.save_location, "index.json")

		with open(index_path, "r") as index_file:
			index_data = json.loads(index_file.read())

		global__archiver.sim_data[sim.uuid] = index_data

	return

def register_simulation(user, sim_title, sim_desc):
	from cloudserver.models import SimulationEntry

	global global__archiver

	sim_uuid = uuid4()
	save_dir = os.path.join(global__archiver.archive_root, str(sim_uuid))

	entry = SimulationEntry(owner=user, title=sim_title, description=sim_desc, uuid=sim_uuid, save_location=save_dir)
	entry.save()

	os.mkdir(save_dir)

	return entry

def get_simulation(id):
	from cloudserver.models import SimulationEntry
	
	try:
		return SimulationEntry.objects.get(uuid=id)
	except (SimulationEntry.DoesNotExist, SimulationEntry.MultipleObjectsReturned):
		return None

def update_instance_index(uuid, data):
	global global__archiver

	if data is str:
		raise Exception("Instance data must be a dictionary, not a string")

	global__archiver.sim_data[uuid] = data

def get_instance_index_data(uuid):
	assert type(uuid) is UUID

	global global__archiver
	return global__archiver.sim_data[uuid]

def get_simulation_step_files(uuid, index):
	simulation = get_simulation(uuid)
	index_data = get_instance_index_data(uuid)

	step_frame = os.path.join(simulation.save_location, index_data["stepframes"][index])
	viz_frame = os.path.join(simulation.save_location, index_data["vizframes"][index])

	return (step_frame, viz_frame)

def write_empty_index_file(path, backend_version):
	init_index_data = {
		"vizframes": {},
		"stepframes": {},
		"num_frames": 0,
		"backend_version": backend_version
	}

	sim_data_str = json.dumps(init_index_data)

	with open(path, "w") as indexfile:
		indexfile.write(sim_data_str)

	return init_index_data

def write_entry_to_sim_index(index_path, step_file, viz_bin_file):
	with open(index_path, "r+") as index_file:
		sim_data = json.loads(index_file.read())

		frame_count = len(sim_data["vizframes"])
		sim_data["vizframes"][frame_count] = viz_bin_file
		sim_data["stepframes"][frame_count] = step_file
		sim_data["num_frames"] = frame_count + 1

		sim_data_str = json.dumps(sim_data)

		index_file.seek(0)
		index_file.write(sim_data_str)
		index_file.truncate()

	return (sim_data, frame_count)