from django.http import HttpResponse, HttpResponseRedirect
from django.template import Context, RequestContext, Template

from django.contrib.auth.decorators import login_required

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
    index_data = ""

    with open("static/viewer.html", "r") as index_file:
        index_data = index_file.read()

    context = Context({ "simulation_uuid": sim_uuid, "is_dev_sim": False })
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