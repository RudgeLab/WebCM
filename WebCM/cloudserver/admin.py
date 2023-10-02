from django.contrib import admin
from .models import SimulationEntry, SourceContentEntry, PerUserSettings

admin.site.register(SimulationEntry)
admin.site.register(SourceContentEntry)
admin.site.register(PerUserSettings)