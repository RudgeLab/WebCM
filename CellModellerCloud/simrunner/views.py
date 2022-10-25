from django.http import HttpResponse, HttpResponseBadRequest, HttpResponseNotAllowed
from django.views.decorators.csrf import csrf_exempt

from .instances.manager import spawn_simulation, spawn_simulation_from_branch, kill_simulation
from .instances.simprocess import SimulationProcess
from .backends.backend import BackendParameters

from saveviewer import archiver as sv_archiver

import json
import uuid
import traceback

@csrf_exempt
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

	# Register simulation
	params = BackendParameters()
	params.uuid = sim_uuid
	params.name = sim_name
	params.source = sim_source
	
	use_custom_backend = type(sim_backend) is dict
	id_str = str(sim_uuid)

	try:
		extra_vars = { "backend_version": sim_backend }
		paths = sv_archiver.get_save_archiver().register_simulation(id_str, f"./{id_str}", sim_name, use_custom_backend, extra_init_vars=extra_vars)
	except Exception as e:
		traceback.print_exc()
		return HttpResponseBadRequest(str(e))

	params.sim_root_dir = paths.root_path
	params.cache_dir = paths.cache_path
	params.cache_relative_prefix = paths.relative_cache_path
	params.backend_dir = paths.backend_path
	params.backend_relative_prefix = paths.relative_backend_path

	# Download backend
	params.backend_version = sim_backend

	print(f"[SIMULATION RUNNER]: Creating new simulation: {id_str}")
	
	if use_custom_backend:
		if not "url" in sim_backend: return HttpResponseBadRequest("Backend URL not provided")
		if not "branch" in sim_backend: return HttpResponseBadRequest("Backend branch not provided")
		if not "version" in sim_backend: return HttpResponseBadRequest("Backend version not provided")
		
		spawn_simulation_from_branch(id_str, sim_backend["url"], sim_backend["branch"], paths.backend_path, proc_class=SimulationProcess, proc_args=(params,))
	elif type(sim_backend) is str:
		spawn_simulation(id_str, proc_class=SimulationProcess, proc_args=(params,))
	else:
		return HttpResponseBadRequest(f"Invalid backend data type: {type(sim_backend)}")

	return HttpResponse(id_str)

@csrf_exempt
def stop_simulation(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	kill_simulation(request.GET["uuid"])

	return HttpResponse()