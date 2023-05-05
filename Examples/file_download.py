import requests, json
import sys, importlib

host = "http://localhost:8000"

"""
The format.py file includes all the methods and classes required for packing and unpacking cell states.

The file itself does not depend on the rest of WebCM, so you are free to copy it to any place you need.
You will, however, need to have the following packages installed:
	- msgpack
	- numpy

Because this example file is outside the main WebCM codebase, we cannot import the format.py using a
regular import statement. We have to use this method instead. It is only meant for demonstration purposes!
It is recommended that you copy the format.py next to your scripts and use an import statement. 
"""
def load_format_script(path, name="format"):
	spec = importlib.util.spec_from_file_location(name, path)
	mod = importlib.util.module_from_spec(spec)
	sys.modules[name] = mod
	spec.loader.exec_module(mod)
	return mod

fmt = load_format_script("../WebCM/saveviewer/format.py")

def check_response(r):
	if r.status_code >= 300:
		print(f"Request failed with: {r.status_code}")
		quit(-1)
	
	return r

def main():
	username = "admin"
	password = "password123"

	# Authenticate with the server
	signin_response = check_response(requests.post(f"{host}/api/userauth/rest_signin", data={
		"username": username,
		"password": password
	}))
	
	token = f"Token {signin_response.text}"
	
	print(f"Authenticated with token:    {token}")

	# Get a list of all simulations owned by the logged in user
	response = check_response(requests.get(f"{host}/api/listsimulations", headers={ "Authorization": token }))
	listsimulations = json.loads(response.text)

	print("Owned simulations:")
	for sim in listsimulations:
		print(f"    Simulation '{sim['title']}' ~~~ UUID: {sim['uuid']}")
	
	if len(listsimulations) == 0:
		print("    (No simulations)")
		return
	
	sim = listsimulations[0]

	# Get the header of the selected simulation
	response = check_response(requests.get(f"{host}/api/simheader", params={ "uuid": sim['uuid'] }, headers={ "Authorization": token }))
	sim_header = json.loads(response.text)

	print("Details:")
	print(f"    Name: {sim_header['name']}")
	print(f"    UUID: {sim_header['uuid']}")
	print(f"    Frame count: {sim_header['frameCount']}")
	print(f"    Is Online: {sim_header['isOnline']}")
	
	# Get the cell states
	frame_count = int(sim_header['frameCount'])
	if frame_count == 0:
		return

	response = check_response(requests.get(f"{host}/api/cellstates", params={ "uuid": sim['uuid'], "index": frame_count - 1 }, headers={ "Authorization": token }))

	# Unpack the cell states
	states = fmt.read_all_states_from_buffer(response.content)

	avg_volume = 0
	for state in states:
		avg_volume += state.target_volume
	avg_volume /= len(states)

	print(f"Average Volume: {avg_volume}")

main()