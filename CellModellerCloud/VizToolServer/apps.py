from django.apps import AppConfig

class MainAppConfig(AppConfig):
	name = "VizToolServer"
	verbose_name = "CellModeller Visualization Tool"

	def ready(self):
		pass
		