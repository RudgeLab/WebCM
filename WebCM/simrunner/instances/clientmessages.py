class SimLaunch:
	def __init__(self):
		pass

class NewFrame:
	def __init__(self, frame_count):
		self.frame_count = frame_count

class NewShape:
	def __init__(self):
		pass

class Status:
	def __init__(self, status):
		self.status = status

class ServerMessage:
	def __init__(self, message, show_popup, is_error):
		self.message = message
		self.show_popup = show_popup
		self.is_error = is_error