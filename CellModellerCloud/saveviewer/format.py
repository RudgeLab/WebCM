import struct, io, zlib

class PackedCell:
	def __init__(self):
		self.id = 0
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

	@staticmethod
	def from_cellmodeller4(state):
		packed_cell = PackedCell()
		packed_cell.id = state.id
		packed_cell.radius = state.radius
		packed_cell.length = state.length
		packed_cell.growth_rate = state.growthRate
		packed_cell.cell_age = state.cellAge
		packed_cell.eff_growth = state.effGrowth
		packed_cell.cell_type = state.cellType
		packed_cell.cell_adhesion = state.cellAdh
		packed_cell.target_volume = state.targetVol
		packed_cell.volume = state.volume
		packed_cell.strain_rate = state.strainRate
		packed_cell.start_volume = state.startVol

		return packed_cell

	@staticmethod
	def byte_size():
		return 8 + 4 * 11

	@staticmethod
	def write_to_bytesio(cell, byte_buffer):
		# Index, Radius, Length
		byte_buffer.write(struct.pack("<Qff", cell.id, cell.radius, cell.length))

		# Growth rate, Cell age, Effective growth
		byte_buffer.write(struct.pack("<fif", cell.growth_rate, cell.cell_age, cell.eff_growth))

		# Cell type, Cell adhesion, Target volume
		byte_buffer.write(struct.pack("<iif", cell.cell_type, cell.cell_adhesion, cell.target_volume))

		# Volume, Strain rate, Start volume, 
		byte_buffer.write(struct.pack("<fff", cell.volume, cell.strain_rate, cell.start_volume))

	@staticmethod
	def read_from_bytesio(byte_buffer, offset=0):
		(id, radius, length,\
			growth_rate, cell_age, eff_growth,\
			cell_type, cell_adhesion, target_volume,\
			volume, strain_rate, start_volume) = struct.unpack_from("<Qfffifiiffff", byte_buffer, offset)

		packed_cell = PackedCell()
		packed_cell.id = id
		packed_cell.radius = radius
		packed_cell.length = length
		packed_cell.growth_rate = growth_rate
		packed_cell.cell_age = cell_age
		packed_cell.eff_growth = eff_growth
		packed_cell.cell_type = cell_type
		packed_cell.cell_adhesion = cell_adhesion
		packed_cell.target_volume = target_volume
		packed_cell.volume = volume
		packed_cell.strain_rate = strain_rate
		packed_cell.start_volume = start_volume

		return packed_cell

class PackedCellWriter:
	def __init__(self):
		self.byte_buffer = io.BytesIO()
	
	def write_header(self, cell_count):
		self.byte_buffer.write(struct.pack("<i", int(cell_count)))

	def write_cell(self, cell):
		PackedCell.write_to_bytesio(cell, self.byte_buffer)

	def flush_to_file(self, file):
		file.write(zlib.compress(self.byte_buffer.getbuffer(), 2))

class PackedCellReader:
	def __init__(self, file):
		self.byte_buffer = zlib.decompress(file.read())
		self._read_header()
		
	def _read_header(self):
		(cell_count,) = struct.unpack_from("<i", self.byte_buffer, 0)

		self.cell_count = cell_count
	
	def read_cell_at_index(self, index):
		if self.cell_count <= index:
			raise IndexError(f"Cell index ({index}) is out of bounds. Acceptable range is 0 to {self.cell_count - 1}")

		return PackedCell.read_from_bytesio(self.byte_buffer, 4 + PackedCell.byte_size() * index)

	def find_cell_with_id(self, id):
		for i in range(0, self.cell_count):
			cell = self.read_cell_at_index(i)

			if cell.id == id:
				return cell
		
		return None