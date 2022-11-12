from django.http import HttpResponse, HttpResponseRedirect, HttpResponseNotFound
from django.template import Context, RequestContext, Template

from django.contrib.auth.decorators import login_required

from cloudserver.models import SimulationEntry
from simrunner.instances import manager
from saveviewer import archiver

from uuid import UUID

import json

@login_required
def home(request):
	index_data = ""

	with open("static/index.html", "r") as index_file:
		index_data = index_file.read()

	context = RequestContext(request)
	content = Template(index_data).render(context)

	return HttpResponse(content)

@login_required
def viewer(request, sim_uuid):
	if archiver.get_simulation(UUID(sim_uuid)) is None:
		return HttpResponseNotFound(f"Simulation '{sim_uuid}' does not exist")

	index_data = ""

	with open("static/viewer.html", "r") as index_file:
		index_data = index_file.read()

	is_online = manager.is_simulation_running(UUID(sim_uuid))
	context = RequestContext(request, { "simulation_uuid": sim_uuid, "is_online": is_online })
	content = Template(index_data).render(context)

	return HttpResponse(content)

@login_required
def editor(request, sim_uuid):
	if archiver.get_simulation(UUID(sim_uuid)) is None:
		return HttpResponseNotFound(f"Simulation '{sim_uuid}' does not exist")

	index_data = ""

	with open("static/editor.html", "r") as index_file:
		index_data = index_file.read()

	is_online = manager.is_simulation_running(UUID(sim_uuid))
	context = RequestContext(request, { "simulation_uuid": sim_uuid, "is_online": is_online })
	content = Template(index_data).render(context)

	return HttpResponse(content)

@login_required
def list_owned_simulations(request):
	entries = SimulationEntry.objects.filter(owner=request.user)

	response_content = []
	for sim in entries:
		is_online = manager.is_simulation_running(sim.uuid)
		response_content.append({ "uuid": str(sim.uuid), "title": sim.title, "desc": sim.description, "isOnline": is_online })

	return HttpResponse(json.dumps(response_content), content_type="application/json")
	
def login_form(request):
	if request.user.is_authenticated:
		return HttpResponseRedirect("/")

	index_data = ""

	with open("static/login.html", "r") as index_file:
		index_data = index_file.read()

	context = RequestContext(request)
	content = Template(index_data).render(context)

	return HttpResponse(content)