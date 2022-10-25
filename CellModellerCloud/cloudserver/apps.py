from django.apps import AppConfig

class MainAppConfig(AppConfig):
	name = "cloudserver"
	verbose_name = "CellModeller Cloud"

	def ready(self):
		pass
		