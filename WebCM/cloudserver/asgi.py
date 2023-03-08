"""
ASGI config for cloudserver project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/3.2/howto/deployment/asgi/
"""

import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'cloudserver.settings')

# Initialize Django ASGI application early to ensure the AppRegistry
# is populated before importing code that may import ORM models.
django_asgi_app = get_asgi_application()

# NOTE: The code above needs to happens BEFORE everything else, otherwise, ASGI applications won't work
import simrunner.routing
from channels.routing import ProtocolTypeRouter, URLRouter

application = ProtocolTypeRouter({
	"http": django_asgi_app,
	"websocket": URLRouter(simrunner.routing.websocket_urlpatterns),
})