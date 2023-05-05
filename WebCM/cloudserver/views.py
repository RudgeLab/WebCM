from django.http import HttpResponse, FileResponse, HttpResponseRedirect, HttpResponseBadRequest, HttpResponseNotAllowed
from django.template import RequestContext, Template

from django.contrib.auth.decorators import login_required

# from rest_framework.response import Response
from rest_framework.parsers import BaseParser
from rest_framework.decorators import api_view
from rest_framework.authentication import SessionAuthentication, TokenAuthentication
from rest_framework.permissions import IsAuthenticated

from cloudserver import settings, models
from saveviewer import archiver
from saveviewer import format as sv_format
from simrunner.instances import manager

from uuid import UUID, uuid4

import json

class HttpResponseBackendError(HttpResponse):
	status_code = 483 # Custom error code

	def __init__(self, *args, **kwargs):
		super().__init__(args, kwargs)

		# Django prints an extra error message when logging responses that have a status code >= 400. I don't like that.
		# Django uses `_has_been_logged` in django.utils.log.log_response to check if it should log the response or not.
		# This doesn't seem to be used anywhere else, so I think its ok if we set it here
		self._has_been_logged = True

class PassthroughParser(BaseParser):
    media_type = '*/*'

    def parse(self, stream, media_type=None, parser_context=None):
        return stream

def authenticate_view(view_params):
	def decorator(func):
		func.authentication_classes = [SessionAuthentication, TokenAuthentication]
		func.permission_classes = [IsAuthenticated]
		func.parser_classes = [PassthroughParser]
		return api_view(view_params)(func)
	return decorator

def response_no_cache(response):
	response["Cache-Control"] = "no-store"

	return response

	def __init__(self, *args, **kwargs):
		super().__init__(args, kwargs)

		# Django prints an extra error message when logging responses that have a status code >= 400. I don't like that.
		# Django uses `_has_been_logged` in django.utils.log.log_response to check if it should log the response or not.
		# This doesn't seem to be used anywhere else, so I think its ok if we set it here
		self._has_been_logged = True

# ####### Pages #######

@login_required
def home(request):
	index_data = ""

	with open("static/index.html", "r") as index_file:
		index_data = index_file.read()

	context = RequestContext(request, { "enable_cellmodeller5": settings.ENABLE_CELLMODELLER5 })
	content = Template(index_data).render(context)

	return HttpResponse(content)

@login_required
def viewer(request, sim_uuid):
	if models.lookup_simulation(UUID(sim_uuid)) is None:
		return HttpResponseBackendError(f"Simulation '{sim_uuid}' does not exist")

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

	as_simulation = models.lookup_simulation(uuid_val)
	as_source_file = models.lookup_source_content(uuid_val)

	from_simulation = not as_simulation is None
	from_source_file = not as_source_file is None

	if not from_simulation and not from_source_file:
		return HttpResponseBackendError(f"The provided UUID ({src_uuid}) did not match a simulation or a source file")

	index_data = ""

	with open("static/editor.html", "r") as index_file:
		index_data = index_file.read()

	is_online = from_source_file or manager.is_simulation_running(uuid_val)

	if from_source_file:
		page_title = f"{as_source_file.name} - Source file"
	else:
		page_title = f"{as_simulation.title} - Simulation source"

	context = RequestContext(request, { "source_uuid": src_uuid, "is_online": is_online, "page_title": page_title })
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


# ####### API Endpoints #######

@authenticate_view(["GET"])
def sim_header(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	sim_id = UUID(request.GET["uuid"])
	simulation = models.lookup_simulation(sim_id)
	index_data = archiver.get_instance_index_data(sim_id)
	is_online = manager.is_simulation_running(sim_id)

	response_content = json.dumps({
		"uuid": str(simulation.uuid),
		"name": simulation.title,
		"frameCount": index_data["num_frames"],
		"isOnline": is_online,
		"crashMessage": index_data["crash_message"] if index_data.get("has_crashed") else None
	})

	response = HttpResponse(response_content, content_type="application/json")
	response["Content-Length"] = len(response_content)
	return response

@authenticate_view(["GET"])
def viz_data(request):
	if not "index" in request.GET:
		return HttpResponseBadRequest("No frame index provided")

	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	# Read simulation file
	sim_id = request.GET["uuid"]
	index = request.GET["index"]

	files = archiver.get_simulation_step_files(UUID(sim_id), index)
	if files is None: return HttpResponseBackendError(f"Index '{index}' in simulation '{sim_id}' does not exist")

	response = FileResponse(open(files[1], "rb"))
	response["Content-Encoding"] = "deflate"

	return response_no_cache(response)

@authenticate_view(["GET"])
def cell_states(request):
	if not "index" in request.GET:
		return HttpResponseBadRequest("No frame index provided")

	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	# Read simulation file
	sim_id = request.GET["uuid"]
	index = request.GET["index"]

	files = archiver.get_simulation_step_files(UUID(sim_id), index)
	if files is None: return HttpResponseBackendError(f"Index '{index}' in simulation '{sim_id}' does not exist")

	response = FileResponse(open(files[0], "rb"))
	return response_no_cache(response)

@authenticate_view(["GET"])
def cell_info_from_index(request):
	if not "cellid" in request.GET:
		return HttpResponseBadRequest("No cell index provided")

	if not "frameindex" in request.GET:
		return HttpResponseBadRequest("No frame index provided")

	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	# Read simulation file
	sim_id = request.GET["uuid"]
	frameindex = request.GET["frameindex"]
	cellid = request.GET["cellid"]

	files = archiver.get_simulation_step_files(UUID(sim_id), frameindex)
	if files is None: return HttpResponseBackendError(f"No simulation with UUID '{sim_id}' (index {frameindex}) found")

	cell_data = sv_format.read_state_with_id(files[0], int(cellid))
	if cell_data is None: return HttpResponseBackendError(f"Failed find data for cell {cellid}")

	response_content = json.dumps(cell_data.create_display_dict())
	response = HttpResponse(response_content, content_type="application/json")
	response["Content-Length"] = len(response_content)

	return response_no_cache(response)

@authenticate_view(["GET"])
def shape_list(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	sim_id = request.GET["uuid"]

	index_data = archiver.get_instance_index_data(UUID(sim_id))
	if index_data is None: return HttpResponseBackendError(f"No simulation with UUID '{sim_id}' found")

	response_content = json.dumps(index_data["shape_list"])
	response = HttpResponse(response_content, content_type="application/json")
	response["Content-Length"] = len(response_content)

	return response_no_cache(response)

@authenticate_view(["GET"])
def list_owned_simulations(request):
	entries = models.SimulationEntry.objects.filter(owner=request.user)

	response_content = []
	for sim in entries:
		is_online = manager.is_simulation_running(sim.uuid)
		response_content.append({ "uuid": str(sim.uuid), "title": sim.title, "desc": sim.description, "isOnline": is_online })

	return response_no_cache(HttpResponse(json.dumps(response_content), content_type="application/json"))

@authenticate_view(["GET"])
def create_source_file(request):
	if not "name" in request.GET:
		return HttpResponseBadRequest("No file name provided")
	
	src_name = request.GET["name"]
	src_name = src_name.strip()

	# Check the simulation name
	if src_name == "":
		return HttpResponseBackendError("Empty Source file name is not allowed");

	if not models.lookup_source_content_by_name(src_name) is None:
		return HttpResponseBackendError(f"Source file with name '{src_name}' already exists");

	entry = models.SourceContentEntry(owner=request.user, name=src_name, uuid=uuid4(), content="")
	entry.save()

	return response_no_cache(HttpResponse(str(entry.uuid)))

@authenticate_view(["GET"])
def delete_source_file(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No file UUID provided")

	src_uuid = request.GET["uuid"]
	entry = models.lookup_source_content(UUID(src_uuid))

	if entry is None:
		return HttpResponseBackendError(f"Source with UUID '{src_uuid}' not found")

	entry.delete()

	return response_no_cache(HttpResponse())

def get_source_content(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")
	
	uuid_val = UUID(request.GET["uuid"])
	
	source_file = models.lookup_source_content(uuid_val)
	content = archiver.read_simulation_source(uuid_val) if source_file is None else source_file.content

	return response_no_cache(HttpResponse(content, content_type="text/plain"))

def set_source_content(request):
	request_content = request.body.decode("utf-8")
	request_json = json.loads(request_content)

	uuid_val = UUID(request_json["uuid"])

	source_file = models.lookup_source_content(uuid_val)
	source_content = request_json["source"]

	if not source_file is None:
		source_file.content = source_content
		source_file.save()
	else:
		archiver.write_simulation_source(uuid_val, source_content)

	return response_no_cache(HttpResponse())

@authenticate_view(["GET"])
def list_owned_source_files(request):
	entries = models.SourceContentEntry.objects.filter(owner=request.user)

	response_content = []
	for src in entries:
		response_content.append({ "uuid": str(src.uuid), "title": src.name })

	return response_no_cache(HttpResponse(json.dumps(response_content), content_type="application/json"))

@authenticate_view(["POST"])
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

	# Check the simulation name
	sim_name = sim_name.strip()

	if sim_name == "":
		return HttpResponseBackendError("Empty simulation name is not allowed");

	if not models.lookup_simulation_by_name(sim_name) is None:
		return HttpResponseBackendError(f"Simulation with name '{sim_name}' already exists");

	# Create the simulation and return its UUID
	uuid = manager.create_simulation(request.user, sim_name, "", sim_source, sim_backend)

	return HttpResponse(str(uuid))

@authenticate_view(["GET"])
def stop_simulation(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")
	
	sim_id = UUID(request.GET["uuid"])

	if models.lookup_simulation(sim_id) is None:
		return HttpResponseBackendError(f"Simulation '{sim_id}' does not exist")
	
	manager.kill_simulation(sim_id)

	return HttpResponse()

@authenticate_view(["GET"])
def delete_simulation(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	sim_id = UUID(request.GET["uuid"])

	if models.lookup_simulation(sim_id) is None:
		return HttpResponseBackendError(f"Simulation '{sim_id}' does not exist")

	manager.delete_simulation(sim_id)

	return HttpResponse()