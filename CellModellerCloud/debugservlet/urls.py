from django.contrib import admin
from django.urls import path, include

from . import views

import simrunner.views as sm_views

urlpatterns = [
	path("", views.index),
	path("api/saveviewer/", include("saveviewer.urls")),
	path("api/simrunner/stopsimulation", sm_views.stop_simulation),
]
