from django.urls import path

from . import views

urlpatterns = [
    path("createnewsimulation", views.create_new_simulation),
    path("stopsimulation", views.stop_simulation),
]
