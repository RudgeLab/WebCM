from django.http import HttpResponse, FileResponse, HttpResponseBadRequest, HttpResponseNotFound

from . import archiver as sv_archiver
from .format import PackedCellReader

import json

def frame_data(request):
	if not "index" in request.GET:
		return HttpResponseBadRequest("No frame index provided")

	if not "uuid" in request.GET:
		return HttpResponseBadRequest("No simulation UUID provided")

	# Read simulation file
	sim_id = request.GET["uuid"]
	index = request.GET["index"]

	selected_frame = sv_archiver.get_save_archiver().get_sim_bin_file(sim_id, index)

	response = FileResponse(open(selected_frame, "rb"))
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

	selected_frame = sv_archiver.get_save_archiver().get_sim_step_file(sim_id, frameindex)

	with open(selected_frame, "rb") as frame_file:
		frame_reader = PackedCellReader(frame_file)

	cell_data = frame_reader.find_cell_with_id(int(cellid))

	data = {
		"Inde": cell_data.id,
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