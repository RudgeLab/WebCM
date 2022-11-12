from django.http import HttpResponse, HttpResponseBadRequest, HttpResponseNotAllowed
from django.contrib.auth.decorators import login_required

from simrunner.instances import manager
from uuid import UUID

import json

@login_required
def create_new_simulation(request):
	# This needs to be a POST request since this method is not idempotent
	if request.method != "POST":
		return HttpResponseNotAllowed([ "POST" ])

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

	uuid = manager.create_simulation(request.user, sim_name, "", sim_source, sim_backend)

	return HttpResponse(str(uuid))

@login_required
def stop_simulation(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	manager.kill_simulation(UUID(request.GET["uuid"]))

	return HttpResponse()

@login_required
def delete_simulation(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	manager.delete_simulation(UUID(request.GET["uuid"]))

	return HttpResponse()