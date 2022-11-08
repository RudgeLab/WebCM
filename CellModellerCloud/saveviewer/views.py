from django.http import HttpResponse, FileResponse, HttpResponseBadRequest, HttpResponseNotFound

from saveviewer import archiver
from saveviewer.format import PackedCellReader

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

	with open(step_file, "rb") as frame_file:
		frame_reader = PackedCellReader(frame_file)

	cell_data = frame_reader.find_cell_with_id(int(cellid))

	data = {
		"Cell Id": cell_data.id,
		"Radius": cell_data.radius,
		"Length": cell_data.length,
		"Growth rate": cell_data.growth_rate,
		"Cell age": cell_data.cell_age,
		"Effective growth": cell_data.eff_growth,
		"Cell type": cell_data.cell_type,
		"Cell adhesion": cell_data.cell_adhesion,
		"Target volume": cell_data.target_volume,
		"Volume": cell_data.volume,
		"Strain rate": cell_data.strain_rate,
		"Start volume": cell_data.start_volume,
	}

	response_content = json.dumps(data)
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