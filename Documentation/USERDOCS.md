# Using WebCM
This section describes how to use WebCM.

## 1. Creating a new simulation
When you first open the home page, the first things you'll see is the simulation list. If you've never created a simulation before, this list will be empty.

<p align="center"><img src="/Documentation/Screenshots/screenshot1.png" alt="Sim List image"/></p>

To create a new simulation, navigate to the "Create Simulation" tab. Enter a name in the *Simulation Name* field and leave *Backend Version* to `CellModeller4` and *Source file* to `<Upload File>`. If you then press the *Create Simulation* button, a file dialog will appear asking you to upload a Python script. This is the script that will controll the simulation.

<p align="center"><img src="/Documentation/Screenshots/screenshot2.png" alt="Create sim image"/></p>

You can select one of the provided example scripts that can be found under the `Examples` folder. Once you've uploaded a file, you will be automatically redirected to the simulation viewer. 

## 2. Viewing existing simulations
The viewer is the page that allows you to interact with and view simulations. The simulation will start automactically when the page opens (Note: ceratain simulations may take a few seconds to start). 

Use **right click** to orbit the camera around and **middle click** to pan the camera. You can also use **left click** to select a cell and view its properties. 

<p align="center"><img src="/Documentation/Screenshots/screenshot7.png" alt="Viewer image"/></p>

At the top of the page, you'll see a big slider, referred to as the *timeline*, which allows you to move to different points in the simulation. By default, the timeline will snap to the end when the simulation completes another step. To prevent this, disable the checkbox called "Snap to last step". 

<p align="center"><img src="/Documentation/Screenshots/screenshot3.png" alt="Timelime image"/></p>

At the bottom left of the page, you'll see a group of buttons:

 1. "Stop" button: Allows you to stop the current simulation. If the simulation isn't running, pressing the button won't have any effect.
 2. "Reload" button: Allows you to restart the current simulation. This will work for both running and stopped simulations. The simulation will start from the beginning and previous contents of the simulation will be overwritten. Any changes made to the Python script of the simulation will take effect when the simulation is reloaded.
 3. "Edit source" button: Opens the editor page in a new tab. More on the editor page in the next section.
 4. "Settings" button: Shows a pop-up window that contains the settings of the visualization.

<p align="center"><img src="/Documentation/Screenshots/screenshot4.png" alt="Buttons image"/></p>

## 3. Modifying simulations on the fly
One of the key features of WebCM is that it allows simulations you to edited directly in the browser. To edit the script of a simulation, press the "Edit source" button in the viewer page. This will open an editor page for that simulation. 

<p align="center"><img src="/Documentation/Screenshots/screenshot5.png" alt="Example editor page"/></p>

Changes made to the script of a simulation will not be saved automatically. To save any changes you've made, click on the "Save Source" button, or press `Ctrl+S`. 

To apply the changes you've made to the script, you need to reload the simulation. You can do so by going back to the viewer page and pressing the "Reload" button. This will start the simulation from the beginning and load the changes you made to the script.

If an error occurs when reloading the script (e.g. because of a syntax error), a message log will appear dispalying the error message provided by Python. Once you've fixed the error, you can reload the simulation again to start it. The message log will also appear if any errors occur during the execution of the simulation. 

<p align="center"><img src="/Documentation/Screenshots/screenshot6.png" alt="Message log error"/></p>


# Adapting CellModeller scripts to WebCM
WebCM uses a new renderer to extract cell data from the simulation. If you are copying scripts for CellModeller to WebCM, you'll have to replace the old renderers with the new WebRenderer.

To add WebRenderer to your simulation, add the following lines:

	from CellModeller.GUI.WebRenderer import WebRenderer
	
and
	
	renderer = WebRenderer()
	sim.addRenderer(renderer)

WebRenderer comes with CellModeller, not WebCM, so you'll need to make sure CellModeller is up-to-date. You will also have to make sure not to use **or import** any of the other renderers.

The WebRenderer also allows you to add shapes and attach a signals grid, which will be displayed in the viewer. Look at the example scripts (such as `ex3_simpleSignal` or `SPPTest_sphere`) for more information.
