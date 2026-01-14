from django.conf import settings
from django.db import models
from django.db.utils import OperationalError

import uuid

class SimulationEntry(models.Model):
	owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
	uuid = models.UUIDField(default=uuid.uuid4, editable=True)
	title = models.TextField(unique=True)
	backend_version = models.TextField()
	source_uuid = models.UUIDField(default=None, null=True, editable=True)
	source_copy = models.TextField()
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

class PerUserSetting(models.Model):
	owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, primary_key=True)
	max_cell_count = models.IntegerField(default=0)

	def __str__(self):
		return f"(Settings: {self.owner}, { '<no limit>' if self.max_cell_count <= 0 else self.max_cell_count })"

def iterate_all_simulations():
	from cloudserver.models import SimulationEntry
	
	try:
		return iter(SimulationEntry.objects.all())
	except OperationalError:
		return iter([])

def lookup_simulation(id):
	from cloudserver.models import SimulationEntry
	
	try:
		return SimulationEntry.objects.get(uuid=id)
	except (OperationalError, SimulationEntry.DoesNotExist, SimulationEntry.MultipleObjectsReturned):
		return None

def lookup_simulation_by_name(name):
	from cloudserver.models import SimulationEntry
	
	try:
		return SimulationEntry.objects.get(title=name)
	except (OperationalError, SimulationEntry.DoesNotExist, SimulationEntry.MultipleObjectsReturned):
		return None
	
def lookup_all_simulations_by_owner(owning_user):
	from cloudserver.models import SimulationEntry
	
	try:
		return iter(SimulationEntry.objects.filter(owner=owning_user))
	except (OperationalError, SimulationEntry.DoesNotExist):
		return iter([])

def lookup_source_content(id):
	try:
		return SourceContentEntry.objects.get(uuid=id)
	except (OperationalError, SourceContentEntry.DoesNotExist, SourceContentEntry.MultipleObjectsReturned):
		return None

def lookup_source_content_by_name(name):
	try:
		return SourceContentEntry.objects.get(name=name)
	except (OperationalError, SourceContentEntry.DoesNotExist, SourceContentEntry.MultipleObjectsReturned):
		return None
	
def lookup_all_source_content_by_owner(owning_user):
	try:
		return iter(SourceContentEntry.objects.filter(owner=owning_user))
	except (OperationalError, SourceContentEntry.DoesNotExist):
		return iter([])

def lookup_per_user_settings(user):
	try:
		return PerUserSetting.objects.get(owner=user)
	except (OperationalError, PerUserSetting.DoesNotExist, PerUserSetting.MultipleObjectsReturned):
		return None