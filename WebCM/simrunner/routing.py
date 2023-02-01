from django.urls import path

from . import consumers

websocket_urlpatterns = [
    path('ws/usercomms/', consumers.UserCommsConsumer.as_asgi()),
]