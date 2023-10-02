from django.conf import settings
from django.db import models

import uuid

class SimulationEntry(models.Model):
	owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
	title = models.TextField(unique=True)
	description = models.TextField()
	uuid = models.UUIDField(default=uuid.uuid4, editable=True)
	save_location = models.TextField()
	max_cell_count = models.IntegerField(default=0)

	def __str__(self):
		return f"(Simulation: {self.uuid}, {self.owner})"

class SourceContentEntry(models.Model):
	owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
	name = models.TextField(unique=True)
	uuid = models.UUIDField(default=uuid.uuid4, editable=True)
	content = models.TextField()

	def __str__(self):
		return f"(Source: {self.uuid}, {self.owner})"

class PerUserSettings(models.Model):
	owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, primary_key=True)
	max_cell_count = models.IntegerField(default=0)

	def __str__(self):
		return f"(Settings: {self.owner}, { '<no limit>' if self.max_cell_count <= 0 else self.max_cell_count })"

def lookup_simulation(id):
	from cloudserver.models import SimulationEntry
	
	try:
		return SimulationEntry.objects.get(uuid=id)
	except (SimulationEntry.DoesNotExist, SimulationEntry.MultipleObjectsReturned):
		return None

def lookup_simulation_by_name(name):
	from cloudserver.models import SimulationEntry
	
	try:
		return SimulationEntry.objects.get(title=name)
	except (SimulationEntry.DoesNotExist, SimulationEntry.MultipleObjectsReturned):
		return None

def lookup_source_content(id):
	try:
		return SourceContentEntry.objects.get(uuid=id)
	except (SourceContentEntry.DoesNotExist, SourceContentEntry.MultipleObjectsReturned):
		return None

def lookup_source_content_by_name(name):
	try:
		return SourceContentEntry.objects.get(name=name)
	except (SourceContentEntry.DoesNotExist, SourceContentEntry.MultipleObjectsReturned):
		return None

def lookup_per_user_settings(user):
	try:
		return PerUserSettings.objects.get(owner=user)
	except (PerUserSettings.DoesNotExist, PerUserSettings.MultipleObjectsReturned):
		return None