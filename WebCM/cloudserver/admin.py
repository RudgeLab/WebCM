from django.contrib import admin
from .models import SimulationEntry, SourceContentEntry, PerUserSetting

admin.site.register(SimulationEntry)
admin.site.register(SourceContentEntry)
admin.site.register(PerUserSetting)