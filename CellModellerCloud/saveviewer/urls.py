from django.urls import path

from . import views

urlpatterns = [
    path("framedata", views.frame_data),
    path("cellinfoindex", views.cell_info_from_index),
    path("shapelist", views.shape_list),

    path("listsimulations", views.list_owned_simulations),
    path("listsourcefiles", views.list_owned_source_files),

    path("createsourcefile", views.create_source_file),
    path("deletesourcefile", views.delete_source_file),

    path("getsrccontent", views.get_source_content),
    path("setsrccontent", views.set_source_content),
]