from django.apps import AppConfig
from django.utils.deprecation import MiddlewareMixin

from . import archiver

class SaveViewerConfig(AppConfig):
	name = "saveviewer"
	verbose_name = "CellModeller Save Viewer"

class SaveArchiverMiddlware(MiddlewareMixin):
	def __init__(self, get_response):
		super().__init__(get_response)
		
		archiver.initialize_save_archiver()