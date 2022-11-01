from django.http import HttpResponse, HttpResponseBadRequest, HttpResponseNotAllowed
from django.contrib.auth.decorators import login_required

from .instances.manager import spawn_simulation, kill_simulation
from .instances.simprocess import SimulationProcess
from .backends.backend import BackendParameters

from saveviewer import archiver as sv_archiver

import json
import uuid
import traceback

@login_required
def create_new_simulation(request):
	# This needs to be a POST request since this method is not idempotent
	if request.method != "POST":
		return HttpResponseNotAllowed([ "POST" ])

	sim_uuid = uuid.uuid4()

	# Parse the request body
	try:
		creation_parameters = json.loads(request.body)
	except json.JSONDecodeError as e:
		return HttpResponseBadRequest(f"Invalid JSON provided as request body: {str(e)}")

	# Check parameters
	sim_name = creation_parameters.get("name", None)
	sim_source = creation_parameters.get("source", None)
	sim_backend = creation_parameters.get("backend", None)

	if sim_name is None: return HttpResponseBadRequest("Simulation name not provided")
	if sim_source is None: return HttpResponseBadRequest("Simulation source not provided")
	if sim_backend is None: return HttpResponseBadRequest("Simulation backend not specified")

	if not type(sim_backend) is str: return HttpResponseBadRequest(f"Invalid backend data type: {type(sim_backend)}")

	# Register simulation
	params = BackendParameters()
	params.uuid = sim_uuid
	params.name = sim_name
	params.source = sim_source
	
	id_str = str(sim_uuid)

	try:
		paths = sv_archiver.get_save_archiver().register_simulation(id_str, f"./{id_str}", sim_name, sim_backend)
	except Exception as e:
		traceback.print_exc()
		return HttpResponseBadRequest(str(e))

	params.sim_root_dir = paths.root_path
	params.cache_dir = paths.cache_path
	params.cache_relative_prefix = paths.relative_cache_path
	params.backend_version = sim_backend

	print(f"[SIMULATION RUNNER]: Creating new simulation: {id_str}")

	spawn_simulation(id_str, proc_class=SimulationProcess, proc_args=(params,))

	return HttpResponse(id_str)

@login_required
def stop_simulation(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	kill_simulation(request.GET["uuid"])

	return HttpResponse()