import zlib

class BackendParameters:
	def __init__(self):
		self.name = ""
		self.source = ""
		self.delta_time = 0.05

		self.sim_root_dir = None
		self.cache_dir = None
		self.cache_relative_prefix = None

class SimulationBackend:
	STEP_COMPRESSION_LEVEL_ZLIB = 2

	def __init__(self, params):
		assert isinstance(params, BackendParameters)

		self.params = params

	def initialize(self):
		pass

	def step(self):
		pass
	
	def get_shape_list(self):
		return []

	def get_signals_grid(self):
		return None

	def write_step_pickle(self):
		return ""

	def compress_step(self, data):
		return zlib.compress(data, self.STEP_COMPRESSION_LEVEL_ZLIB)

	def is_running(self):
		return True

	def shutdown(self):
		pass