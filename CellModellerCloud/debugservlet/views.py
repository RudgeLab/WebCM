from django.http import HttpResponse
from django.template import Context, Template

from .apps import get_dbgservlet_instance

def index(request):
	index_data = ""

	with open("static/viewer.html", "r") as index_file:
		index_data = index_file.read()

	sim_uuid = str(get_dbgservlet_instance().sim_uuid)

	context = Context({ "simulation_uuid": sim_uuid, "is_dev_sim": True })
	content = Template(index_data).render(context)

	return HttpResponse(content)