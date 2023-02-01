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
		return f"(Simulation: {self.uuid}, {self.owner})"

class SourceContentEntry(models.Model):
	owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
	name = models.TextField()
	uuid = models.UUIDField(default=uuid.uuid4, editable=True)
	content = models.TextField()

	def __str__(self):
		return f"(Source: {self.uuid}, {self.owner})"

def lookup_simulation(id):
	from cloudserver.models import SimulationEntry
	
	try:
		return SimulationEntry.objects.get(uuid=id)
	except (SimulationEntry.DoesNotExist, SimulationEntry.MultipleObjectsReturned):
		return None

def lookup_source_content(id):
	try:
		return SourceContentEntry.objects.get(uuid=id)
	except (SourceContentEntry.DoesNotExist, SourceContentEntry.MultipleObjectsReturned):
		return None