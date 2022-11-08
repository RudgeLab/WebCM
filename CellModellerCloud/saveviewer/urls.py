from django.urls import path

from . import views

urlpatterns = [
    path("framedata", views.frame_data),
    path("cellinfoindex", views.cell_info_from_index),

    path("getsimsource", views.get_simulation_source),
    path("setsimsource", views.set_simulation_source),
]