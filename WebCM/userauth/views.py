from django.http import HttpResponse, HttpResponseNotAllowed, HttpResponseBadRequest
from django.contrib.auth import authenticate, login, logout

from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view

def django_signin(request):
	if request.method != "POST":
		return HttpResponseNotAllowed([ request.method ])

	username = request.POST.get("username", default=None)
	password = request.POST.get("password", default=None)

	if not username:
		return HttpResponseBadRequest("No username provided")

	if not password:
		return HttpResponseBadRequest("No password provided")

	user = authenticate(request, username=username, password=password)

	if user is None:
		return HttpResponseBadRequest("Invalid username/password")
	
	login(request, user)

	return HttpResponse()

@api_view(["POST"])
def rest_signin(request):
	if request.method != "POST":
		return HttpResponseNotAllowed([ request.method ])

	username = request.POST.get("username", default=None)
	password = request.POST.get("password", default=None)

	if not username:
		return HttpResponseBadRequest("No username provided")

	if not password:
		return HttpResponseBadRequest("No password provided")

	user = authenticate(request, username=username, password=password)

	if user is None:
		return HttpResponseBadRequest("Invalid username/password")
	
	try:
		token = Token.objects.get(user_id=user.id)
	except Token.DoesNotExist:
		token = Token.objects.create(user=user)
	
	return HttpResponse(token.key)

def signout_view(request):
	logout(request)

# localhost:8000/api/userauth/login?username=boo&password=boo