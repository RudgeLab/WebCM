from django.apps import AppConfig

class MainAppConfig(AppConfig):
	name = "cloudserver"
	verbose_name = "WebCM"

	def ready(self):
		pass
		