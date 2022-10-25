"""
ASGI config for VizToolServer project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/3.2/howto/deployment/asgi/
"""

import os
import simrunner.routing

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'VizToolServer.settings')

application = ProtocolTypeRouter({
	"http": get_asgi_application(),
	"websocket": URLRouter(simrunner.routing.websocket_urlpatterns),
})