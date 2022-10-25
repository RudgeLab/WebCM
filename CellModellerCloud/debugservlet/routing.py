from django.urls import path

import simrunner.consumers as consumers

from . import apps

websocket_urlpatterns = [
    path('ws/usercomms/', consumers.UserCommsConsumer.as_asgi(custom_action_callback=apps.dev_action_callback)),
]