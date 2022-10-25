"""VizToolServer URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/3.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.contrib.staticfiles.urls import staticfiles_urlpatterns

from django.contrib import admin

from . import views

urlpatterns = [
    re_path(r"view/(?P<sim_uuid>[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12})/?$", views.viewer),

    path("", views.home),
    path("login/", views.login_form),
    path("admin/", admin.site.urls),
    path("api/saveviewer/", include("saveviewer.urls")),
    path("api/simrunner/", include("simrunner.urls")),
    path("api/userauth/", include("userauth.urls")),
]

urlpatterns += staticfiles_urlpatterns()