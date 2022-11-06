from django.http import HttpResponse, HttpResponseRedirect, HttpResponseNotFound
from django.template import Context, RequestContext, Template

from django.contrib.auth.decorators import login_required

from saveviewer import archiver
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
    if archiver.get_simulation(UUID(sim_uuid)) is None:
        return HttpResponseNotFound(f"Simulation '{sim_uuid}' does not exist")

    index_data = ""

    with open("static/viewer.html", "r") as index_file:
        index_data = index_file.read()

    context = Context({ "simulation_uuid": sim_uuid })
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