from django.urls import path

from . import views

urlpatterns = [
    path("django_signin", views.django_signin),
    path("rest_signin", views.rest_signin),
]