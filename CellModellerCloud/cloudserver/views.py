from django.http import HttpResponse, HttpResponseRedirect, HttpResponseNotFound
from django.template import RequestContext, Template

from django.contrib.auth.decorators import login_required

from cloudserver.models import lookup_simulation, lookup_source_content
from simrunner.instances import manager

from uuid import UUID

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
	if lookup_simulation(UUID(sim_uuid)) is None:
		return HttpResponseNotFound(f"Simulation '{sim_uuid}' does not exist")

	index_data = ""

	with open("static/viewer.html", "r") as index_file:
		index_data = index_file.read()

	is_online = manager.is_simulation_running(UUID(sim_uuid))
	context = RequestContext(request, { "simulation_uuid": sim_uuid, "is_online": is_online })
	content = Template(index_data).render(context)

	return HttpResponse(content)

@login_required
def editor(request, src_uuid):
	uuid_val = UUID(src_uuid)

	from_simulation = not lookup_simulation(uuid_val) is None
	from_source_file = not lookup_source_content(uuid_val) is None

	if not from_simulation and not from_source_file:
		return HttpResponseNotFound(f"The provided UUID ({src_uuid}) did not match a simulation or a source file")

	index_data = ""

	with open("static/editor.html", "r") as index_file:
		index_data = index_file.read()

	is_online = from_source_file or manager.is_simulation_running(uuid_val)
	context = RequestContext(request, { "source_uuid": src_uuid, "is_online": is_online })
	content = Template(index_data).render(context)

	return HttpResponse(content)
	
def login_form(request):
	if request.user.is_authenticated:
		return HttpResponseRedirect("/")

	index_data = ""

	with open("static/login.html", "r") as index_file:
		index_data = index_file.read()

	context = RequestContext(request)
	content = Template(index_data).render(context)

	return HttpResponse(content)