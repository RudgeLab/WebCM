from django.apps import AppConfig, apps

from simrunner.instances.manager import spawn_simulation, kill_simulation
from simrunner.instances.simthread import SimulationThread
from simrunner.instances.siminstance import ClientAction, ClientMessage
from simrunner.backends.backend import BackendParameters
from simrunner import websocket_groups as wsgroups

from saveviewer import archiver as sv_archiver

import uuid

class DebugServletAppConfig(AppConfig):
	name = "debugservlet"
	verbose_name = "Debug Servlet for CellModeller5"

	def ready(self):
		self.sim_uuid = None

		launch_default_simulation()

def get_dbgservlet_instance():
	return apps.get_app_config("debugservlet")

def launch_default_simulation():
	sim_uuid = uuid.uuid4()

	get_dbgservlet_instance().sim_uuid = sim_uuid

	sim_name = "CellModeller5 Development Simulation"
	sim_backend = "CellModeller5 Development Build"
	sim_source = """
import random
from CellModeller.Regulation.ModuleRegulator import ModuleRegulator
from CellModeller.Biophysics.BacterialModels.CLBacterium import CLBacterium
import numpy
import math

cell_cols = {0:[0,1.0,0], 1:[1.0,0,0]}
outfile = 'all.csv'

def setup(sim):
	# Set biophysics, signalling, and regulation models
	biophys = CLBacterium(sim, jitter_z=False, max_cells=100000, gamma=100.)

	# use this file for reg too
	regul = ModuleRegulator(sim, sim.moduleName)	
	# Only biophys and regulation
	sim.init(biophys, regul, None, None)
 
	# Specify the initial cell and its location in the simulation
	sim.addCell(cellType=0, pos=(0,0,0), dir=(1,0,0))

	# Add some objects to draw the models
	#if sim.is_gui:
	from CellModeller.GUI import Renderers
	therenderer = Renderers.GLBacteriumRenderer(sim)
	sim.addRenderer(therenderer)
	#else:
	#    print("Running in batch mode: no display will be output")

	sim.pickleSteps = 100
	sim.saveOutput = True

def init(cell):
	# Specify mean and distribution of initial cell size
	cell.targetVol = 3.5 + random.uniform(0.0,0.5)
	# Specify growth rate of cells
	cell.growthRate = 1.0
	cell.color = cell_cols[cell.cellType]

def update(cells):
	#Iterate through each cell and flag cells that reach target size for division
	for (id, cell) in cells.items():
		if cell.volume > cell.targetVol:
			cell.divideFlag = True

		gr = cell.strainRate/0.05
		cgr = gr - 0.5
		# Return value is tuple of colors, (fill, stroke)
		#if cgr>0:
		#    cell.color = [1, 1-cgr*2, 1-cgr*2]
		#else:
		#    cell.color = [1+cgr*2, 1+cgr*2, 1]


def divide(parent, d1, d2):
	# Specify target cell size that triggers cell division
	d1.targetVol = 3.5 + random.uniform(0.0,0.5)
	d2.targetVol = 3.5 + random.uniform(0.0,0.5)
		"""

	id_str = str(sim_uuid)

	params = BackendParameters()
	params.uuid = sim_uuid
	params.name = sim_name
	params.source = sim_source
	
	extra_vars = { "backend_version": sim_backend }
	paths = sv_archiver.get_save_archiver().register_simulation(id_str, f"./{id_str}", sim_name, False, extra_init_vars=extra_vars)

	params.sim_root_dir = paths.root_path
	params.cache_dir = paths.cache_path
	params.cache_relative_prefix = paths.relative_cache_path
	params.backend_dir = paths.backend_path
	params.backend_relative_prefix = paths.relative_backend_path

	params.backend_version = sim_backend

	# Spawn simulation
	spawn_simulation(id_str, proc_class=SimulationThread, proc_args=(params,))

	return sim_uuid

def is_dev_simulation(uuid: str):
	return uuid == apps.get_app_config("debugservlet").sim_uuid

def dev_action_callback(action, data, consumer):
	if action == "devreload":
		kill_simulation(str(get_dbgservlet_instance().sim_uuid))
		new_uuid = launch_default_simulation()

		consumer.send_client_message(ClientMessage(ClientAction.RELOAD_DONE, { "uuid": str(new_uuid) }))
	elif action == "devrecompile":
		pass

	return