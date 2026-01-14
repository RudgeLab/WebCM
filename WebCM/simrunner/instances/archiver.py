import os
import json
import pathlib
import shutil
import traceback

from uuid import UUID, uuid4

class SaveArchiver:
	def __init__(self):
		self.archive_root = "./save-archive/"
		self.sim_data_cache = {}

global__archiver = SaveArchiver()

def initialize_save_archiver():
	# We don't want to import this globally because it causes problems
	# when the archiver is imported from the simulation instance process
	from cloudserver.models import SimulationEntry
	from django.db.utils import OperationalError
	import logging

	logger = logging.getLogger(__name__)

	global global__archiver

	# Create the root directory
	pathlib.Path(global__archiver.archive_root).mkdir(parents=False, exist_ok=True)

	# Read simulation indices
	try:
		# Because we call this method at an "unexpected" point during startup, the simulation entry table may
		# not have been created yet (if it doesn't already exist from a previous run), which causes an exception.
		all_objects = iter(SimulationEntry.objects.all())
	except OperationalError:
		all_objects = iter([])

	for entry in all_objects:
		try:
			save_dir = get_simulation_location(entry.uuid)
			index_path = os.path.join(save_dir, "index.json")

			with open(index_path, "r") as index_file:
				index_data = json.load(index_file)

			global__archiver.sim_data_cache[entry.uuid] = index_data
		except:
			logger.error(f"Failed to read index for simulation {entry.uuid}:")
			logger.error(traceback.format_exc())

			global__archiver.sim_data_cache[entry.uuid] = init_empty_instance_index()
	
	logger.info("Initialized save archiver")

# Look at `update_and_fetch_simulation_source` for how the source content of the simulation is determined
def register_simulation(user, sim_title, sim_version, sim_max_size, source_uuid, source_copy):
	# Same as above. Import here instead of at the top because siminstance can't access the database
	from cloudserver.models import SimulationEntry

	global global__archiver

	sim_uuid = uuid4()
	save_dir = get_simulation_location(sim_uuid)

	entry = SimulationEntry(owner=user, uuid=sim_uuid, title=sim_title, backend_version=sim_version, \
							max_cell_count=sim_max_size, source_uuid=source_uuid, source_copy=source_copy)
	entry.save()

	os.mkdir(save_dir)
	os.mkdir(os.path.join(save_dir, "cache"))

	return sim_uuid

def remove_simulation(sim_uuid):
	# Same as above. Import here instead of at the top because siminstance can't access the database
	from cloudserver.models import lookup_simulation

	entry = lookup_simulation(sim_uuid)
	entry.delete()

	save_dir = get_simulation_location(sim_uuid)
	shutil.rmtree(save_dir)

def get_simulation_location(uuid):
	return os.path.join(global__archiver.archive_root, "simulation_" + str(uuid))

# If the source file UUID (source_uuid) is not None, the simulation will pull its source from the source file
# with that UUID. Otherwise, it will use whatever the value of 'source_copy' is.
def update_and_fetch_simulation_source(sim_uuid):
	from cloudserver.models import lookup_simulation, lookup_source_content

	entry = lookup_simulation(sim_uuid)

	if not entry.source_uuid is None:
		updated_content = lookup_source_content(entry.source_uuid)
		
		if not updated_content is None:
			entry.source_copy = updated_content.content
			entry.save()

	return entry.source_copy	

def read_simulation_index(location):
	index_path = os.path.join(location, "index.json")

	with open(index_path, "r") as index_file:
		return json.load(index_file)

def write_simulation_index(location, index_data):
	index_path = os.path.join(location, "index.json")

	with open(index_path, "w") as index_file:
		json.dump(index_data, index_file)

##
##
##

def init_empty_instance_index():
	init_index_data = {
		"vizframes": [],
		"stepframes": [],
		"num_frames": 0,
		"shape_list": [],
		"has_crashed": False,
		"crash_message": ""
	}

	return init_index_data

def update_cached_instance_index(uuid, data):
	assert type(data) is dict

	global global__archiver
	global__archiver.sim_data_cache[uuid] = data

def get_cached_instance_index_data(uuid):
	assert type(uuid) is UUID

	global global__archiver
	return global__archiver.sim_data_cache.get(uuid, None)

def get_simulation_step_files(uuid, index):
	save_dir = get_simulation_location(uuid)
	index_data = get_cached_instance_index_data(uuid)

	if index_data["num_frames"] <= int(index):
		return None

	step_frame = os.path.join(save_dir, index_data["stepframes"][index])
	viz_frame = os.path.join(save_dir, index_data["vizframes"][index])

	return (step_frame, viz_frame)
