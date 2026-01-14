from django.http import HttpResponse, FileResponse, StreamingHttpResponse, HttpResponseRedirect, HttpResponseNotAllowed
from django.template import RequestContext, Template

from django.contrib.auth.decorators import login_required

# from rest_framework.response import Response
from rest_framework.parsers import BaseParser
from rest_framework.decorators import api_view
from rest_framework.authentication import SessionAuthentication, TokenAuthentication
from rest_framework.permissions import IsAuthenticated

from cloudserver import settings, models
from simrunner.instances import manager, archiver

from webcmformat import format

from uuid import UUID, uuid4

import os
import json
import zipfile
import asyncio

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

	context = RequestContext(request, { "simulation_uuid": sim_uuid })
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

	if from_source_file:
		page_title = f"{as_source_file.name} - Source file"
	else:
		page_title = f"{as_simulation.title} - Simulation source"

	if from_source_file:
		source_name = f"Source file '{as_source_file.name}'"
	else:
		if not as_simulation.source_uuid is None:
			source_file = models.lookup_source_content(as_simulation.source_uuid)
			source_name = f"Simulation '{as_simulation.title}'" if source_file is None else f"Source file '{source_file.name}'"
		else:
			source_name = f"Simulation '{as_simulation.title}'"

	context = RequestContext(request, { "source_uuid": src_uuid, "page_title": page_title, "source_name": source_name })
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
		return HttpResponseBackendError("No simulation UUID provided")

	sim_id = UUID(request.GET["uuid"])
	simulation = models.lookup_simulation(sim_id)
	index_data = archiver.get_cached_instance_index_data(sim_id)
	status = manager.get_simulation_status(sim_id)

	response_content = json.dumps({
		"uuid": str(simulation.uuid),
		"name": simulation.title,
		"frameCount": index_data["num_frames"],
		"status": status,
		"crashMessage": index_data["crash_message"] if index_data.get("has_crashed") else None
	})

	response = HttpResponse(response_content, content_type="application/json")
	response["Content-Length"] = len(response_content)
	return response

@authenticate_view(["GET"])
def viz_data(request):
	if not "index" in request.GET:
		return HttpResponseBackendError("No frame index provided")

	if not "uuid" in request.GET:
		return HttpResponseBackendError("No simulation UUID provided")

	# Read simulation file
	sim_id = request.GET["uuid"]
	index = request.GET["index"]

	try:
		sim_id = UUID(sim_id)
		index = int(index)
	except Exception as e:
		return HttpResponseBackendError(f"Malformed input: {e}")

	files = archiver.get_simulation_step_files(sim_id, index)
	if files is None: return HttpResponseBackendError(f"Index '{index}' in simulation '{sim_id}' does not exist")

	response = FileResponse(open(files[1], "rb"))
	response["Content-Encoding"] = "deflate"

	return response_no_cache(response)

@authenticate_view(["GET"])
def cell_states(request):
	if not "index" in request.GET:
		return HttpResponseBackendError("No frame index provided")

	if not "uuid" in request.GET:
		return HttpResponseBackendError("No simulation UUID provided")

	# Read simulation file
	sim_id = request.GET["uuid"]
	index = request.GET["index"]

	files = archiver.get_simulation_step_files(UUID(sim_id), int(index))
	if files is None: return HttpResponseBackendError(f"Index '{index}' in simulation '{sim_id}' does not exist")

	response = FileResponse(open(files[0], "rb"))
	return response_no_cache(response)

@authenticate_view(["GET"])
def cell_info_from_index(request):
	if not "cellid" in request.GET:
		return HttpResponseBackendError("No cell index provided")

	if not "frameindex" in request.GET:
		return HttpResponseBackendError("No frame index provided")

	if not "uuid" in request.GET:
		return HttpResponseBackendError("No simulation UUID provided")

	# Read simulation file
	sim_id = request.GET["uuid"]
	frameindex = request.GET["frameindex"]
	cellid = request.GET["cellid"]

	files = archiver.get_simulation_step_files(UUID(sim_id), int(frameindex))
	if files is None: return HttpResponseBackendError(f"No simulation with UUID '{sim_id}' (index {frameindex}) found")

	cell_data = format.read_state_with_id(files[0], int(cellid))
	if cell_data is None: return HttpResponseBackendError(f"Failed find data for cell {cellid}")

	response_content = json.dumps(cell_data.create_display_dict())
	response = HttpResponse(response_content, content_type="application/json")
	response["Content-Length"] = len(response_content)

	return response_no_cache(response)

@authenticate_view(["GET"])
def shape_list(request):
	if not "uuid" in request.GET:
		return HttpResponseBackendError("No simulation UUID provided")

	sim_id = request.GET["uuid"]

	index_data = archiver.get_cached_instance_index_data(UUID(sim_id))
	if index_data is None: return HttpResponseBackendError(f"No simulation with UUID '{sim_id}' found")

	response_content = json.dumps(index_data["shape_list"])
	response = HttpResponse(response_content, content_type="application/json")
	response["Content-Length"] = len(response_content)

	return response_no_cache(response)

@authenticate_view(["GET"])
def list_owned_simulations(request):
	response_content = []
	
	for sim in models.lookup_all_simulations_by_owner(request.user):
		status = manager.get_simulation_status(sim.uuid)

		response_content.append({ "uuid": str(sim.uuid), "title": sim.title, "status": status })

	return response_no_cache(HttpResponse(json.dumps(response_content), content_type="application/json"))

@authenticate_view(["GET"])
def create_source_file(request):
	if not "name" in request.GET:
		return HttpResponseBackendError("No file name provided")
	
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
		return HttpResponseBackendError("No file UUID provided")

	src_uuid = request.GET["uuid"]
	entry = models.lookup_source_content(UUID(src_uuid))

	if entry is None:
		return HttpResponseBackendError(f"Source with UUID '{src_uuid}' not found")

	entry.delete()

	return response_no_cache(HttpResponse())

def get_source_content(request):
	if not "uuid" in request.GET:
		return HttpResponseBackendError("No simulation UUID provided")
	
	uuid_val = UUID(request.GET["uuid"])
	content =  ""

	source_file = models.lookup_source_content(uuid_val)
	
	if not source_file is None:
		content = source_file.content
	else:
		simulation = models.lookup_simulation(uuid_val)
		if simulation is None:
			return HttpResponseBackendError("Provided UUID does matches neiter a simulation nor a source file")

		if not simulation.source_uuid is None:
			source_file = models.lookup_source_content(simulation.source_uuid)

			if not source_file is None:
				content = source_file.content
			else:
				content = simulation.source_copy
		else:
			content = simulation.source_copy

	return response_no_cache(HttpResponse(content, content_type="text/plain"))

def set_source_content(request):
	request_content = request.body.decode("utf-8")
	request_json = json.loads(request_content)

	uuid_val = UUID(request_json["uuid"])
	content = request_json["source"]

	source_file = models.lookup_source_content(uuid_val)
	
	if not source_file is None:
		source_file.content = content
		source_file.save()
	else:
		simulation = models.lookup_simulation(uuid_val)
		if simulation is None:
			return HttpResponseBackendError("Provided UUID does matches neiter a simulation nor a source file")

		if not simulation.source_uuid is None:
			source_file = models.lookup_source_content(simulation.source_uuid)

			if not source_file is None:
				source_file.content = content
				source_file.save()
			else:
				simulation.source_copy = content
				simulation.save()
		else:
			simulation.source_copy = content
			simulation.save()

	return response_no_cache(HttpResponse())

@authenticate_view(["GET"])
def list_owned_source_files(request):
	response_content = []

	for src in models.lookup_all_simulations_by_owner(request.user):
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
		return HttpResponseBackendError(f"Invalid JSON provided as request body: {str(e)}")

	# Check parameters
	sim_name = creation_parameters.get("name", None)
	sim_backend = creation_parameters.get("backend", None)
	source_uuid = creation_parameters.get("source-uuid", None)
	source_copy = creation_parameters.get("source-content", "")

	if sim_name is None: return HttpResponseBackendError("Simulation name not provided")
	if sim_backend is None: return HttpResponseBackendError("Simulation backend not specified")
	if source_uuid is None and source_copy is None: return HttpResponseBackendError("Neither simulation source nor source file provided")

	if not type(sim_backend) is str: return HttpResponseBackendError(f"Invalid backend data type: {type(sim_backend)}")

	# Check the simulation name
	sim_name = sim_name.strip()

	if sim_name == "":
		return HttpResponseBackendError("Empty simulation name is not allowed")

	if not models.lookup_simulation_by_name(sim_name) is None:
		return HttpResponseBackendError(f"Simulation with name '{sim_name}' already exists")

	# Create the simulation and return its UUID
	user_settings = models.lookup_per_user_settings(request.user)
	max_size = 0 if user_settings is None else int(user_settings.max_cell_count)

	uuid = manager.create_simulation(request.user, sim_name, sim_backend, max_size, source_uuid, source_copy)

	return HttpResponse(str(uuid))

import logging
logger = logging.getLogger(__name__)

@authenticate_view(["GET"])
def delete_simulation(request):
	if not "uuid" in request.GET:
		return HttpResponseBackendError("No simulation UUID provided")

	sim_id = UUID(request.GET["uuid"])
	simulation = models.lookup_simulation(sim_id)

	if simulation is None:
		return HttpResponseBackendError(f"Simulation '{sim_id}' does not exist")

	if simulation.owner != request.user:
		return HttpResponseBackendError(f"Simluation not owned by user")

	ret = manager.delete_simulation(sim_id)

	if type(ret) == manager.DownloadInProgress:
		return HttpResponseBackendError(f"Simulation download is in progress. Cannot delete at this moment!")

	return HttpResponse()

class DownloadBuffer:
	def __init__(self):
		self.buffer = bytearray()

	def write(self, data):
		self.buffer.extend(data)

		return len(data)
	
	def flush(self):
		pass

	def take(self):
		buffer = self.buffer
		self.buffer = bytearray()

		return bytes(buffer)

async def generate_download_stream(uuid, download_lock, source_copy):
	with download_lock:
		location = archiver.get_simulation_location(uuid)
		buffer = DownloadBuffer()

		with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED, compresslevel=2) as zip_file:
			# Zip all the files under the simulation's folder 
			for dirpath, dirs, files in os.walk(location):
				subpath = os.path.relpath(dirpath, location)

				for file in files:
					filename = os.path.join(subpath, file)
					filepath = os.path.join(dirpath, file)

					zip_file.write(filepath, arcname=filename)

					yield buffer.take()

					# So... Python puts all async tasks/coroutines in one big "event loop". When the currently-running task "surrenders"
					# control, the event loop will continue executing some other task (possibly). Notably, the "surrender" can only happen
					# at specific points (the "yield" keyword has nothing to do with async, btw) that explicitly tell the event loop that
					# the current task is "surrendering".
					#
					# Now... that being said, you'd think that django/daphne/whatever-the-hell-else would "surrender" after it receives a
					# chunk from this generator function and writes it to the HTTP connection... it doesn't (at least django v5.2.8, and
					# daphne v4.2.1 don't). So, we have to "surrender" manually. If we don't do this, the response will keep buffering on
					# the server and memory usage will skyrocket!
					await asyncio.sleep(0.001)

			# Automatically insert a file that contains the source code of the simulation
			zip_file.writestr("Copy of last-used source (Inserted automitically by WebCM).py", source_copy)

		yield buffer.take()

	return

@authenticate_view(["GET"])
def download_simulation(request):
	if not "uuid" in request.GET:
		return HttpResponseBackendError("No simulation UUID provided")
	
	sim_id = UUID(request.GET["uuid"])
	simulation = models.lookup_simulation(sim_id)

	if simulation is None:
		return HttpResponseBackendError(f"Simulation '{sim_id}' does not exist")

	if simulation.owner != request.user:
		return HttpResponseBackendError(f"Simluation not owned by user")
	
	download_lock = manager.acquire_download_lock(sim_id)

	if download_lock is None:
		return HttpResponseBackendError(f"Cannot download because the simluation is currently running")

	response = StreamingHttpResponse(generate_download_stream(sim_id, download_lock, simulation.source_copy), content_type='text/event-stream')
	response["Content-Disposition"] = f"attachment; filename=\"Download '{simulation.title}'.zip\""
	response['Cache-Control'] = 'no-cache'

	return response