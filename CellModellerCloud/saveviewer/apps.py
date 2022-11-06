from django.apps import AppConfig

from saveviewer import archiver

class SaveViewerConfig(AppConfig):
	name = "saveviewer"
	verbose_name = "CellModeller Save Viewer"

	def ready(self):
		archiver.initialize_save_archiver()