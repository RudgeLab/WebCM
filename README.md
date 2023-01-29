# CellModellerCloud

CellModellerCloud is a web platform used to develop and run bacterial simulations in a lab environment.

![Screenshot](./Documentation/ScreenshotHeader.png)

## Setup

Run the following to clone the repository;

	git clone --recursive https://github.com/RudgeLab/CellModellerCloud.git

You then need to install the required Python packages by running:

	pip install -r requirements.txt

You will also need to create the database used be Django. To do this, navigate to the server's root directory (under `CellModellerCloud/`) and run:

	python ./manage.py migrate

(You only need to do this once)

## Creating an admin user

CellModellerCloud uses Django's built-in user management system. You will first need to create an admin user. To do this, go to the server's root directory and run the following command

	python ./manage.py createsuperuser

This needs to be done AFTER the database has been created. If you then run the server, you will be able to log in to the admin page. By default, this is located at `localhost:8000/admin/`.

CellModellerCloud doesn't have its own user management page, so if you want to add users you will have to do it through the admin page.

## Running the server

To run the server, navigate to the server's root directory and run:

	python ./manage.py runserver
