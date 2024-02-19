
# Installation

WebCM uses CellModeller to perform cellular simulations. You do not need CellModeller to run WebCM if you only want to view simulation, however, if you want to run them, you'll have to have CellModeller installed. This means that the installation of CellModeller is not done by default when installing WebCM and is left up to the user. 

## Setting up WebCM

First, run the following to clone the repository:

	git clone https://github.com/RudgeLab/WebCM.git

You then need to navigate to the WebCM directory by running `cd WebCM/` and install the required Python packages by running:

	pip install -r requirements.txt

You will also need to create the database used by Django. To do this, navigate to the server's root directory (under `WebCM/`) and run:

	python ./manage.py migrate

(You only need to do this once)

### Creating an admin user

WebCM uses Django's built-in user management system. You will first need to create an admin user. To do this, go to the server's root directory and run the following command

	python ./manage.py createsuperuser

This needs to be done AFTER the database has been created. If you then run the server, you will be able to log in to the admin page. By default, this is located at `localhost:8000/admin/`.

WebCM doesn't have its own user management page, so if you want to add users you will have to do it through the admin page.

### Running the server locally

To run the server, navigate to the server's root directory and run:

	python ./manage.py runserver

By default, this will start WebCM on `localhost:8000/`. It is recommended that this is only used to launch WebCM for personal use. If you want to deploy WebCM (e.g. in a lab environment), follow the instructions in the [Deploying WebCM](#deploying-webcm) section.

## Setting up CellModeller
CellModeller is an optional dependency. If you only want to view existing simulations and not run new ones, then you don't need to install it.

### Installing PyOpenCL

CellModeller uses PyOpenCL to run simulation code on the GPU. It is not recommended that you build PyOpenCL manually, as it requires you to have the OpenCL SDK installed. Instead, it is recommended that you use something like Conda Forge to download pre-build packages. 

To do this, start by installing [Miniforge](https://github.com/conda-forge/miniforge/releases/latest/).  Then, open a terminal, activate your conda environment (`root` is the default one) and run `conda install pyopencl`. 

More details instructions can be found here: [https://documen.tician.de/pyopencl/misc.html](https://documen.tician.de/pyopencl/misc.html) (you only really need to read the *"Installing PyOpenCL"* section).

### Installing CellModeller

After you've installed PyOpenCL, you can install CellModeller.

Start by cloning the repository at [https://github.com/RudgeLab/CellModeller](https://github.com/RudgeLab/CellModeller). Then, navigate to the new directory and just run `python ./setup.py install`. Note that CellModeller currently requires Python version 3.10.

## Deploying WebCM
WebCM uses `uvicorn` for deployment. To launch WebCM, navigate to the server's root directory (under the `WebCM/` folder) and run:

	python -m uvicorn cloudserver.asgi:application --host 0.0.0.0 --port 8000

This command will launch WebCM on port 8000. Look at the uvicorn [documentation](https://www.uvicorn.org/deployment/) for more details.

### Deploying in an unsecure environment
This setup should be enough if you are deploying WebCM in a trusted setting, like a lab. However, if you are planning to run WebCM in an untrusted environment, like if you were providing public access to your server, this setup won't suffice. Please refer to Django's [deployment checklist](https://docs.djangoproject.com/en/4.1/howto/deployment/checklist/) for instructions on how to properly secure your server.

### Helpful notes
If the console output looks weird, you may want to specify the `--no-use-colors` option. This disables *ANSI color codes*, which are not supported by some terminals.

If you are on a Linux system, you may want to use `gunicorn` instead. It is more mature and offers some features that uvicorn doesn't, such as process management. However, Gunicorn only supports WSGI, so you need to connect it with uvicorn to run an ASGI application . The uvicorn [documentation](https://www.uvicorn.org/deployment/#gunicorn) provides details on how to run gunicorn properly.
