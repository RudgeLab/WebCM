from django.conf import settings
from django.db import models

import uuid

class SimulationEntry(models.Model):
	owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
	title = models.TextField()
	description = models.TextField()
	uuid = models.UUIDField(default=uuid.uuid4, editable=True)
	save_location = models.TextField()

	def __str__(self):
		return f"({self.owner}, {self.uuid})"