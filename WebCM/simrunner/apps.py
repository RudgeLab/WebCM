from django.apps import AppConfig
from django.utils.deprecation import MiddlewareMixin

from simrunner.instances import archiver

class SimRunnerConfig(AppConfig):
	default_auto_field = 'django.db.models.BigAutoField'
	name = 'simrunner'

class SimRunnerMiddlware(MiddlewareMixin):
	def __init__(self, get_response):
		super().__init__(get_response)
		
		archiver.initialize_save_archiver()