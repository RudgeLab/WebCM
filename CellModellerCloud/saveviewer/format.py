import zlib
import msgpack
import numpy

class PackedCell:
	def __init__(self):
		self.id = 0
		self.position = [ 0, 0, 0 ]
		self.direction = [ 0, 0, 0 ]
		self.radius = 0.0
		self.length = 0.0
		self.growth_rate = 0.0
		self.cell_age = 0
		self.eff_growth = 0.0
		self.cell_type = 0
		self.cell_adhesion = 0
		self.target_volume = 0.0
		self.volume = 0.0
		self.strain_rate = 0.0
		self.start_volume = 0.0

	def create_display_dict(self):
		output = {
			"Cell Id": self.id,
			"Radius": self.radius,
			"Length": self.length,
			"Growth rate": self.growth_rate,
			"Cell age": self.cell_age,
			"Effective growth": self.eff_growth,
			"Cell type": self.cell_type,
			"Cell adhesion": self.cell_adhesion,
			"Target volume": self.target_volume,
			"Volume": self.volume,
			"Strain rate": self.strain_rate,
			"Start volume": self.start_volume,
		}

		return dict(filter(lambda val: not val[1] is None, output.items()))

	@staticmethod
	def from_named_entries(entries):
		cell = PackedCell()
		cell.id = entries.get("id")
		cell.position = entries.get("position")
		cell.direction = entries.get("direction")
		cell.radius = entries.get("radius")
		cell.length = entries.get("length")
		cell.growth_rate = entries.get("growth_rate")
		cell.cell_age = entries.get("cell_age")
		cell.eff_growth = entries.get("eff_growth")
		cell.cell_type = entries.get("cell_type")
		cell.cell_adhesion = entries.get("cell_adhesion")
		cell.target_volume = entries.get("target_volume")
		cell.volume = entries.get("volume")
		cell.strain_rate = entries.get("strain_rate")
		cell.start_volume = entries.get("start_volume")

		return cell


def write_states_to_csv(path, states):
	with open(path, "w") as output:
		output.write("id,")
		output.write("position x,position y,position z,")
		output.write("direction x,direction y,direction z,")
		output.write("radius,")
		output.write("length,")
		output.write("growth_rate,")
		output.write("cell_age,")
		output.write("eff_growth,")
		output.write("cell_type,")
		output.write("cell_adhesion,")
		output.write("target_volume,")
		output.write("volume,")
		output.write("strain_rate,")
		output.write("start_volume,")
		output.write("\n")

		for cell in states:
			output.write(f"{cell.id},")
			output.write(f"{cell.position[0]},{cell.position[1]},{cell.position[2]},")
			output.write(f"{cell.direction[0]},{cell.direction[1]},{cell.direction[2]},")
			output.write(f"{cell.radius},")
			output.write(f"{cell.length},")
			output.write(f"{cell.growth_rate},")
			output.write(f"{cell.cell_age},")
			output.write(f"{cell.eff_growth},")
			output.write(f"{cell.cell_type},")
			output.write(f"{cell.cell_adhesion},")
			output.write(f"{cell.target_volume},")
			output.write(f"{cell.volume},")
			output.write(f"{cell.strain_rate},")
			output.write(f"{cell.start_volume}")
			output.write("\n")

	return

def write_states(path, cell_states, id_attribute, attributes_to_pack):
	key_mappings = { "id": 0 }
	cell_objects = []

	for it in cell_states.keys():
		state = cell_states[it]
		state_variables = vars(state)
		state_object = {}

		# Write ID
		state_object[0] = state_variables[id_attribute]

		# Write customizable attributes
		for (attr, standard_name) in attributes_to_pack:
			if not attr in state_variables:
				continue

			if not standard_name in key_mappings:
				# The ID attribute has a key id of zero, so we need to add one to all ids
				# to prevent collisions
				key_mappings[standard_name] = len(key_mappings)

			key_id = key_mappings[standard_name]
			state_object[key_id] = state_variables[attr]

		cell_objects.append(state_object)

	output_object = { "key_mappings": key_mappings, "states": cell_objects }

	def default(obj):
		if isinstance(obj, numpy.float32):
			return float(obj)
		
		raise TypeError(f"Could not pack type: {type(obj)}")

	with open(path, "wb") as out_file:
		packed_data = msgpack.packb(output_object, default=default)

		out_file.write(zlib.compress(packed_data, 2))


def __read_state_internal(path, target_id):
	raw_data = None

	# Read and unpack the file
	with open(path, "rb") as in_file:
		raw_data = zlib.decompress(in_file.read())

	unpacked_data = msgpack.unpackb(raw_data, strict_map_key=False)

	# Create reverse key mappings
	reverse_key_mappings = { value:key for (key, value) in unpacked_data["key_mappings"].items() }

	if target_id is None:
		unpacked_cells = []

		for state in unpacked_data["states"]:
			unpacked_cells.append( PackedCell.from_named_entries({ reverse_key_mappings[key]:value for (key, value) in state.items() }) )
		
		return unpacked_cells
	else:
		for state in unpacked_data["states"]:
			if not state[0] == target_id:
				continue

			return PackedCell.from_named_entries({ reverse_key_mappings[key]:value for (key, value) in state.items() })
		return None


def read_state_with_id(path, target_id):
	assert not target_id is None

	return __read_state_internal(path, target_id)

def read_all_states(path):
	return __read_state_internal(path, None)