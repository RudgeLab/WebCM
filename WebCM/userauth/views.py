from django.http import HttpResponse, HttpResponseNotAllowed, HttpResponseBadRequest
from django.contrib.auth import authenticate, login, logout

def signin_view(request):
    if request.method != "POST":
        return HttpResponseNotAllowed([ request.method ])

    username = request.POST.get("username", default=None)
    password = request.POST.get("password", default=None)

    if not username:
        return HttpResponseBadRequest("No username provided")

    if not password:
        return HttpResponseBadRequest("No password provided")

    user = authenticate(request, username=username, password=password)

    if user is not None:
        login(request, user)
        return HttpResponse()

    return HttpResponseBadRequest("Invalid username/password")

def signout_view(request):
    logout(request)

# localhost:8000/api/userauth/login?username=boo&password=boo