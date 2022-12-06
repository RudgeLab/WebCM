from django.http import HttpResponse, FileResponse, HttpResponseBadRequest
from django.contrib.auth.decorators import login_required

from saveviewer import archiver
from saveviewer import format as sv_format

from cloudserver.models import SimulationEntry, SourceContentEntry, lookup_source_content
from simrunner.instances import manager

from uuid import UUID, uuid4

import json

def response_no_cache(response):
	response["Cache-Control"] = "no-store"

	return response

def frame_data(request):
	if not "index" in request.GET:
		return HttpResponseBadRequest("No frame index provided")

	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	# Read simulation file
	sim_id = request.GET["uuid"]
	index = request.GET["index"]

	(step_file, viz_file) = archiver.get_simulation_step_files(UUID(sim_id), index)

	response = FileResponse(open(viz_file, "rb"))
	response["Content-Encoding"] = "deflate"

	return response_no_cache(response)

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

	(step_file, viz_file) = archiver.get_simulation_step_files(UUID(sim_id), frameindex)
	cell_data = sv_format.read_state_with_id(step_file, int(cellid))

	response_content = json.dumps(cell_data.create_display_dict())
	response = HttpResponse(response_content, content_type="application/json")
	response["Content-Length"] = len(response_content)

	return response_no_cache(response)

def shape_list(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	index_data = archiver.get_instance_index_data(UUID(request.GET["uuid"]))

	response_content = json.dumps(index_data["shape_list"])
	response = HttpResponse(response_content, content_type="application/json")
	response["Content-Length"] = len(response_content)

	return response_no_cache(response)

@login_required
def list_owned_simulations(request):
	entries = SimulationEntry.objects.filter(owner=request.user)

	response_content = []
	for sim in entries:
		is_online = manager.is_simulation_running(sim.uuid)
		response_content.append({ "uuid": str(sim.uuid), "title": sim.title, "desc": sim.description, "isOnline": is_online })

	return response_no_cache(HttpResponse(json.dumps(response_content), content_type="application/json"))


@login_required
def create_source_file(request):
	if not "name" in request.GET:
		return HttpResponseBadRequest("No file name provided")

	entry = SourceContentEntry(owner=request.user, name=request.GET["name"], uuid=uuid4(), content="")
	entry.save()

	return response_no_cache(HttpResponse(str(entry.uuid)))

@login_required
def delete_source_file(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No file UUID provided")

	src_uuid = request.GET["uuid"]
	entry = lookup_source_content(UUID(src_uuid))

	if entry is None:
		return HttpResponseBadRequest(f"Source with UUID '{src_uuid}' not found")

	entry.delete()

	return response_no_cache(HttpResponse())

def get_source_content(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")
	
	uuid_val = UUID(request.GET["uuid"])
	
	source_file = lookup_source_content(uuid_val)
	content = archiver.read_simulation_source(uuid_val) if source_file is None else source_file.content

	return response_no_cache(HttpResponse(content, content_type="text/plain"))

def set_source_content(request):
	request_content = request.body.decode("utf-8")
	request_json = json.loads(request_content)

	uuid_val = UUID(request_json["uuid"])

	source_file = lookup_source_content(uuid_val)
	source_content = request_json["source"]

	if not source_file is None:
		source_file.content = source_content
		source_file.save()
	else:
		archiver.write_simulation_source(uuid_val, source_content)

	return response_no_cache(HttpResponse())

@login_required
def list_owned_source_files(request):
	entries = SourceContentEntry.objects.filter(owner=request.user)

	response_content = []
	for src in entries:
		response_content.append({ "uuid": str(src.uuid), "title": src.name })

	return response_no_cache(HttpResponse(json.dumps(response_content), content_type="application/json"))