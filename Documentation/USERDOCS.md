# Creating a new simulation
To create a new simulation, first go to the "Create Simulation" tab. You can set the name of the simulation, select the simulation backend (currently, only CellModeller is supported), and select the source file to use for the simulation.

Once a simulation starts, it will keep running until you manually stop it (or it crashes). This means you can leave the viewer window (described below) and even close your browser, and the simulation will keep running. This can be very usefull if you want to leave simulations running for a very long time.

Each simulation is controlled by a Python script. The Python script is responsible for setting up the simulation environment, selecting which model to use, etc. Some examples of Python scripts are provided under the `Examples/` directory.

Each simulation is assigned to a specific directory, which will hold information such as the state of the simulation after each step. 

## Selecting an existing simulation
To look at a simulation that has already been created, go to the "Select simulation" tab, find the simulation and click on the arrow in the green button. This will open the viewer for the selected simulation.

## Deleting simulations
To delete a simulation, find the simulation under the "Select simulation" tab and click on the X in the grey button. This will bring up a confirmation dialog, and if you accept, the simulation will be permanently deleted.

*Note*: If a simulation is particularly large, it might take a while for it to get deleted.

## Connecting to the WebRenderer
TODO...

## Advnaced script features
You can create custom files from the script to save data generated by the simulation that is not saved automatically. The current working directory will be set to the directory assigned to the current simulation (e.g. `<path_to_WebCM>/save-archive/simulation_f7e9cc4a-7f2f-4759-a95a-fb36b4f96f2e`). This means that files such as `./cell_names.txt` or `./snapshots/histogram.png` will be placed inside the folder assigned to the simulation. 

Also, any Python packages installed on the server will be accessible from the script.


# Creating source files
Source files are text files that are stored on the server and can be used to create simulations. They do not belong to any particular simulation, nor can you create a simulation directly from them.

When you create a simulation, you'll need to specify which source file you want to use, if any. The server will then **copy** the contents of the source file and use them as the Python script that will control the simulation. This means that if you modify the Python script of a simulation, the original source file will **not** be modified. Likewise, modifing the a source file, will not affect any simulations that copied it.

Source files use the same editor as Python scripts. 

# Using the editor
WebCM offers a built-in editor for modifying Python scripts and source files. This editor offers some simple syntax highlighting and is very similar to Visual Studio Code.

*Note*: You'll need to manually save any changes you make to the file/script you're modifying. You can do this by either pressing `Ctrl + S` or by clicking on the "Save Source" buttton.

