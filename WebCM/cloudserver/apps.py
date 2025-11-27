from django.apps import AppConfig

from saveviewer import archiver

class MainAppConfig(AppConfig):
	name = "cloudserver"
	verbose_name = "WebCM"

	def ready(self):
		archiver.initialize_save_archiver()
		