from django.http import HttpResponse, FileResponse, HttpResponseBadRequest, HttpResponseNotFound

from saveviewer import archiver
from saveviewer import format as sv_format

from uuid import UUID

import json

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

	return response

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

	response_content = json.dumps(cell_data.create_readable_dict())
	response = HttpResponse(response_content, content_type="application/json")
	response["Content-Length"] = len(response_content)

	return response

def shape_list(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	index_data = archiver.get_instance_index_data(UUID(request.GET["uuid"]))

	response_content = json.dumps(index_data["shape_list"])
	response = HttpResponse(response_content, content_type="application/json")
	response["Content-Length"] = len(response_content)

	return response

def get_simulation_source(request):
	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")
	
	sim_id = request.GET["uuid"]
	source = archiver.read_simulation_source(UUID(sim_id))

	return HttpResponse(source, content_type="text/plain")

def set_simulation_source(request):
	request_content = request.body.decode("utf-8")
	request_json = json.loads(request_content)

	sim_id = request_json["uuid"]
	archiver.write_simulation_source(UUID(sim_id), request_json["source"])

	return HttpResponse()