import { ViewerRenderer } from './renderer-main.js'

function setSimName(name) {
	document.getElementById("sim-name").innerHTML = `Name: ${name}`;
	document.title = `${name} - CellModeller Simulation`;
}

function setSimFrame(index, frameCount) {
	document.getElementById("sim-frame").innerHTML = `Frame: ${index} / ${frameCount}`;
}

function setSimCurrentCellCount(cellCount) {
	document.getElementById("simdets-cellcount").innerText = cellCount;
}

function setSimMaxCellCount(cellCount) {
	document.getElementById("simdets-maxcellcount").innerText = cellCount <= 0 ? "None" : cellCount;
}

function setStatusMessage(message) {
	document.getElementById("status-label").innerHTML = `Status: ${message}`;
}

function setStatusFromServer(message) {
	if (message == "launching") setStatusMessage("Launching");
	else if (message == "offline") setStatusMessage("Offline");
	else if (message == "running") setStatusMessage("Running");
	else if (message == "paused") setStatusMessage("Paused");
	else if (message == "reloading") setStatusMessage("Reloading");
}

/****** Dialog windows ******/

function showSettings() { closeAll(); document.getElementById("settings-container").style.display = "inline"; }
function closeSettings() {            document.getElementById("settings-container").style.display = "none"; }

function showServerLog() { closeAll(); document.getElementById("message-log-container").style.display = "inline"; }
function closeServerLog() {            document.getElementById("message-log-container").style.display = "none"; }

function showPlayback() { closeAll(); document.getElementById("playback-container").style.display = "inline"; }
function closePlayback() {            document.getElementById("playback-container").style.display = "none"; }

window.closeSettings = closeSettings;
window.closeServerLog = closeServerLog;
window.closePlayback = closePlayback;

function closeAll() {
	closeSettings();
	closeServerLog()
	closePlayback();
}

function toggleSettings() {
	if (document.getElementById("settings-container").style.display == "inline")
		closeSettings()
	else
		showSettings();
}

function toggleServerLog() {
	if (document.getElementById("message-log-container").style.display == "inline")
		closeServerLog()
	else
		showServerLog();
}

function togglePlayback() {
	if (document.getElementById("playback-container").style.display == "inline")
		closePlayback()
	else
		showPlayback();
}

function writeServerLogMessage(message) {
	var textArea = document.getElementById("message-log-text");
	textArea.value += message + " \n";
	textArea.scrollTop = textArea.scrollHeight;
}

function clearServerLog() {
	var textArea = document.getElementById("message-log-text");
	textArea.value = "";
	textArea.scrollTop = textArea.scrollHeight;
}

/****** ************************ ******/

async function requestShapes(context) {
	const data = await fetch(`/api/shapelist?uuid=${context["simUUID"]}`);
	if (!data.ok) {
		console.error(`Error when shape list ${data.status} - ${data.statusText}`);
		return;
	}

	const buffer = await data.json();

	context["shapeList"] = buffer;
}



async function sendVizDataRequest(uuid, index) {
	try {
		const frameData = await fetch(`/api/vizdata?index=${index}&uuid=${uuid}`);

		if (frameData.ok) {
			return await frameData.arrayBuffer();
		} else {
			console.error(`Error when requesting frame ${index}: ${frameData.status} - ${frameData.statusText}`);
		}
	} catch (error) {
		console.error(error);
	}

	return null;
}

async function updateCellInfo(context, currentFrameIndex, selectedCellIdentifier) {
	const cellDetailsHeader = document.getElementById("cell-details-header");
	const cellDetailsSection = document.getElementById("cell-details-section");

	if (selectedCellIdentifier === -1) {
		cellDetailsHeader.style.display = "none";
		cellDetailsSection.style.display = "none";
	} else {
		const simUUID = context["simUUID"];
		const cellData = await fetch(`/api/cellinfoindex?cellid=${selectedCellIdentifier}&frameindex=${currentFrameIndex}&uuid=${simUUID}`);

		if (cellData.ok) {
			const cellProps = await cellData.json();

			let cellText = "";

			for (const key in cellProps) {
				const value = cellProps[key];
				const text = customFormat(value);

				cellText += `<tr><td>${key}</td><td>${text}</td></tr>`;
			}

			cellDetailsHeader.style.display = "flex";
			cellDetailsSection.style.display = "flex";

			cellDetailsSection.innerHTML = cellText;
		} else {
			console.error(`Error when cell info: ${cellData.status} - ${cellData.statusText}`);

			cellDetailsHeader.style.display = "flex";
			cellDetailsSection.style.display = "flex";

			cellDetailsSection.innerHTML = `<td colspan="2" style="text-align: center;">Failed to fetch cell data</td>`;
		}
	}
}

function connectToSimulation(context, uuid) {
	return createServerConnection(context)
		.then((socket) => { socket.send(JSON.stringify({ "action": "connectto", "data": `${uuid}` })); })
		.catch(() => {
			writeServerLogMessage("Failed to connect to server");
			writeServerLogMessage("    (Check your browser's developer console for more details)");
			showServerLog();
		});
}

function createServerConnection(context) {
	return new Promise((resolve, reject) => {
		setStatusMessage("Connecting");

		let commsSocket = null;

		try {
			commsSocket = new WebSocket(`ws://${window.location.host}/ws/usercomms/`);
		} catch (err) {
			reject(err);
			return;
		}
		
		commsSocket.onopen = function(e) {
			resolve(commsSocket);
		};

		commsSocket.onerror = function(err) {
			reject(err);
		};
		
		commsSocket.onmessage = async function(e) {
			const message = JSON.parse(e.data);

			const action = message["action"];
			const data = message["data"];

			if (action === "connectheader") {
				context["simUUID"] = data["uuid"];

				context["simInfo"] = {};
				context["simInfo"].name = data.name;
				context["simInfo"].frameCount = data.frameCount;

				context["timelineSlider"].max = data.frameCount;

				setSimFrame(0, data.frameCount);
				setSimName(data.name);
				setSimMaxCellCount(data.maxSimSize);
				setStatusFromServer(data.status);
				clearServerLog();

				await requestShapes(context);

				if (data.crashMessage) {
					writeServerLogMessage("========= CRASH LOG =========");
					writeServerLogMessage("");
					writeServerLogMessage(data.crashMessage);
					showServerLog();
				}

				if (data.frameCount > 0) {
					context["renderer"].requestFrameAndDisplay(0);
				}
			} else if (action == "simlaunch") {
				clearServerLog();
				writeServerLogMessage("New simulation launched");
			} else if (action === "newframe") {
				const frameCount = data["frameCount"];

				context["simInfo"].frameCount = frameCount;
				context["timelineSlider"].max = frameCount;

				if (context["alwaysUseLatestStep"]) {
					if (frameCount == 0) {
						context["renderer"].clearFrame();
						setSimFrame(0, 0);
					} else {
						context["renderer"].requestFrameAndDisplay(frameCount - 1);
					}

					context["timelineSlider"].value = frameCount;
				} else {
					setSimFrame(context["renderer"].state.currentFrameIndex + 1, context["simInfo"].frameCount);
				}
			} else if (action === "newshape") {
				await requestShapes(context);
			} else if (action === "status_change") {
				setStatusFromServer(data);
			} else if (action === "server_message") {
				if (data["is_error"]) {
					writeServerLogMessage("\n!!! A fatal error has occured !!!\n");
				}

				writeServerLogMessage(data["content"]);

				if (data["show_popup"]) {
					showServerLog();
				}

				if (data["is_error"]) {
					setStatusMessage("Fatal Error");
				}
			}
		};
		
		commsSocket.onclose = (e) => {
			setStatusMessage("Connection Lost");
			context["commsSocket"] = null;
		};

		context["commsSocket"] = commsSocket;
	});
}

function reloadSimulation(context) {
	if (context["commsSocket"] !== null) {
		context["commsSocket"].send(JSON.stringify({ "action": "reload", "data": "" }));
	}
}

function startSimulation(context) {
	if (context["commsSocket"] !== null) {
		context["commsSocket"].send(JSON.stringify({ "action": "start", "data": "" }));
	}
}

function pauseSimulation(context) {
	if (context["commsSocket"] !== null) {
		context["commsSocket"].send(JSON.stringify({ "action": "pause", "data": "" }));
	}
}

function stopSimulation(context) {
	if (context["commsSocket"] !== null) {
		context["commsSocket"].send(JSON.stringify({ "action": "stop", "data": "" }));
	}
}

function processTimelineChange(context, value) {
	//NOTE: When someone re-opens a closed tab, the web browser may send an oninput
	//event. This might happen before "simUUID" has been set, so we end sending "undefined" as the UUID
	if (context["simUUID"] != undefined) {
		context["renderer"].requestFrameAndDisplay(value - 1);
	}
}

function beginPlayback(context) {
	const firstFrameInput = document.getElementById("playback-first-frame");
	const lastFrameInput = document.getElementById("playback-last-frame");
	const speedInput = document.getElementById("playback-speed");
	const backwardsInput = document.getElementById("playback-backwards");

	const frameCount = context["simInfo"].frameCount;

	let firstFrameValue = parseInt(firstFrameInput.value);
	let lastFrameValue = parseInt(lastFrameInput.value);

	firstFrameValue = !isNaN(firstFrameValue) ? firstFrameValue : 1;
	lastFrameValue = !isNaN(lastFrameValue) ? lastFrameValue : frameCount;

	firstFrameValue = Math.min(Math.max(firstFrameValue, 1), frameCount);
	lastFrameValue = Math.min(Math.max(lastFrameValue, 1), frameCount);

	const firstFrameIndex = Math.min(firstFrameValue, lastFrameValue);
	const lastFrameIndex = Math.max(firstFrameValue, lastFrameValue);
	const speed = parseFloat(speedInput.value);
	const backwards = backwardsInput.checked;

	const currentIndex = backwards ? lastFrameIndex : firstFrameIndex;

	context["playbackInfo"] = {
		"lowestIndex": firstFrameIndex,
		"highestIndex": lastFrameIndex,
		"currentIndex": currentIndex,
		
		"lastMoveTime": Date.now(),
		"speed": isNaN(speed) ? 0 : speed,
		"backwards": backwards,
	};

	console.log(currentIndex);

	//Update the timeline 
	document.getElementById("frame-timeline").value = currentIndex;

	processTimelineChange(context, currentIndex);
	closePlayback();
}

function downloadSimulation(context) {
	window.open(`/api/downloadsim?uuid=${context["simUUID"]}`, "_blank");
}

function customFormat(value) {
	if (typeof value == 'number') {
		const magnitude = Math.pow(10, 5);

		return String(Math.floor(value * magnitude) / magnitude);
	} else if (Array.isArray(value)) {
		let content = "";

		for (let i = 0; i < value.length; i++) {
			content += customFormat(value[i]);

			if (i + 1 < value.length) content += ", ";
		}

		return "[ " + content + " ]";
	}
}

async function main() {
	setStatusMessage("Initializing");

	let context = {
		"playbackInfo": null,
		"simInfo": {
			"name": "",
			"frameCount": 0,
		}
	};

	//Create canvas
	const renderer = new ViewerRenderer();

	renderer.state.camera.orbitRadius = 60;
	renderer.state.camera.rotation = quat.fromEuler(quat.create(), -45, 0, 0)

	context["renderer"] = renderer;

	//Initialize timeline slider 
	const timelineSlider = document.getElementById("frame-timeline");
	timelineSlider.min = 1;
	timelineSlider.max = 1;
	timelineSlider.step = 1;
	timelineSlider.value = 0;
	
	timelineSlider.oninput = function() {
		//Stop the playback. This event will only get called when the user intertacts with
		//the slider (not when we change its value programmatically).
		context["playbackInfo"] = null;

		processTimelineChange(context, this.value);
	};

	context["timelineSlider"] = timelineSlider;

	const snapToLastCheckbox = document.getElementById("snap-to-last");
	snapToLastCheckbox.onchange = function(event) { context["alwaysUseLatestStep"] = this.checked; };

	context["alwaysUseLatestStep"] = snapToLastCheckbox.checked;

	//
	// Setup viewer buttons
	//

	function resetOrigin() {
		const camera = renderer.state.camera;
		camera.orbitCenter = vec3.fromValues(0, 0.0, 0.0);
		camera.orbitRadius = initOrbitRadius;
		camera.rotation = initRotation;
		camera.yaw = 0;
		camera.pitch = -45;

		renderer.updateCamera();
	}

	const uuid = param__simulationUUID;

	let tempButton = null;
	if (tempButton = document.getElementById("source-btn")) tempButton.onclick = (e) => { window.open(`/edit/${uuid}/`, "_blank");s };
	if (tempButton = document.getElementById("playback-begin-btn")) tempButton.onclick = (e) => { beginPlayback(context); };
	if (tempButton = document.getElementById("reset-origin-btn")) tempButton.onclick = (e) => { resetOrigin(); };
	if (tempButton = document.getElementById("download-btn")) tempButton.onclick = (e) => { downloadSimulation(context); };
	if (tempButton = document.getElementById("playback-btn")) tempButton.onclick = (e) => { togglePlayback(); };
	if (tempButton = document.getElementById("show-log-btn")) tempButton.onclick = (e) => { toggleServerLog(); };
	if (tempButton = document.getElementById("settings-btn")) tempButton.onclick = (e) => { toggleSettings(); };	
	if (tempButton = document.getElementById("reload-btn")) tempButton.onclick = (e) => { reloadSimulation(context); };
	if (tempButton = document.getElementById("start-btn")) tempButton.onclick = (e) => { startSimulation(context); };
	if (tempButton = document.getElementById("pause-btn")) tempButton.onclick = (e) => { pauseSimulation(context); };
	if (tempButton = document.getElementById("stop-btn")) tempButton.onclick = (e) => { stopSimulation(context); };
	
	//
	// Setup settings inputs
	//

	const currentVersion = 1;
	const renderSettings = renderer.state.renderSettings;
	
	function parseBool(x) {
		return x === "true";
	}

	function settingsUpdated() {
		//IMPORTANT: Remember to change the version number (i.e. the "vX;" at the start) whenever you change the stored settings
		let cookieValue = `v${currentVersion};`
			+ encodeURIComponent(renderSettings.flatShading) + ";"
			+ encodeURIComponent(renderSettings.showOutlines) + ";"
			+ encodeURIComponent(renderSettings.signalVolumeEnabled) + ";"
			+ encodeURIComponent(renderSettings.signalVolumeDensity) + ";"
			+ encodeURIComponent(renderSettings.depthPeeling.enabled) + ";"
			+ encodeURIComponent(renderSettings.depthPeeling.layerCount) + ";";

		document.cookie = `settings=${encodeURIComponent(cookieValue)}; path=/; max-age=31536000`;
	}

	function findCookieValue() {
		const cookies = document.cookie.split("; ");
		const cookieName = "settings=";

		for (const cookie of cookies) {
			if (cookie.startsWith(cookieName))
				return cookie.substring(cookieName.length);
		}

		return "";
	}

	let cookieValue = decodeURIComponent(findCookieValue());
	
	if (cookieValue.startsWith(`v${currentVersion}`)) {
		let comps = cookieValue.split(";");
		renderSettings.flatShading = parseBool(decodeURIComponent(comps[1]));
		renderSettings.showOutlines = parseBool(decodeURIComponent(comps[2]));
		renderSettings.signalVolumeEnabled = parseBool(decodeURIComponent(comps[3]));
		renderSettings.signalVolumeDensity = parseInt(decodeURIComponent(comps[4]));
		renderSettings.depthPeeling.enabled = parseBool(decodeURIComponent(comps[5]));
		renderSettings.depthPeeling.layerCount = parseInt(decodeURIComponent(comps[6]));
	}

	document.getElementById("use-flat-shading").checked = renderSettings.flatShading;
	document.getElementById("show-cell-outlines").checked = renderSettings.showOutlines;
	document.getElementById("signal-density-input").value = renderSettings.signalVolumeDensity;
	document.getElementById("signals-enabled-input").checked = renderSettings.signalVolumeEnabled;
	document.getElementById("depth-peel-layers-input").value = renderSettings.depthPeeling.layerCount;
	document.getElementById("transparency-enabled-input").checked = renderSettings.depthPeeling.enabled;

	document.getElementById("use-flat-shading").onchange = function(e) { renderSettings.flatShading = this.checked; settingsUpdated(); };
	document.getElementById("show-cell-outlines").onchange = function(e) { renderSettings.showOutlines = this.checked; settingsUpdated(); };
	document.getElementById("signal-density-input").onchange = function(e) { renderSettings.signalVolumeDensity = this.value; settingsUpdated(); };
	document.getElementById("signals-enabled-input").onchange = function(e) { renderSettings.signalVolumeEnabled = this.checked; settingsUpdated(); };
	document.getElementById("depth-peel-layers-input").onchange = function(e) { renderSettings.depthPeeling.layerCount = this.value; settingsUpdated(); };
	document.getElementById("transparency-enabled-input").onchange = function(e) { renderSettings.depthPeeling.enabled = this.checked; settingsUpdated(); };

	//
	// Timeline process
	//
	function processTimelineFrame(now) {
		//Process playback
		const playbackInfo = context["playbackInfo"];

		if (playbackInfo) {
			//"elapsed" is in milliseconds, but "speed" is in seconds
			const now = Date.now();
			const elapsed = (now - playbackInfo["lastMoveTime"]) / 1000;
			const speed = playbackInfo["speed"];

			if (elapsed >= speed) {
				//Determine the next frame
				const incrementCount = speed <= 0 ? 1 : Math.floor(elapsed / speed);

				let nextFrame = playbackInfo["backwards"] ? (playbackInfo["currentIndex"] - incrementCount) : (playbackInfo["currentIndex"] + incrementCount);
				nextFrame = Math.max(nextFrame, playbackInfo["lowestIndex"]);
				nextFrame = Math.min(nextFrame, playbackInfo["highestIndex"]);

				playbackInfo["currentIndex"] = nextFrame;
				playbackInfo["lastMoveTime"] = now;

				//Update the slider
				document.getElementById("frame-timeline").value = nextFrame;
				
				//Process the timeline change
				processTimelineChange(context, nextFrame);

				//Stop the playback is needed
				if (playbackInfo["currentIndex"] == playbackInfo["lowestIndex"] || playbackInfo["currentIndex"] == playbackInfo["highestIndex"])
					context["playbackInfo"] = null;
			}
		}
		
		window.requestAnimationFrame(processTimelineFrame);
	}

	window.requestAnimationFrame(processTimelineFrame);

	//
	// Initialize the renderer
	//
	const canvas = document.getElementById("renderTargetCanvas");

	await renderer.start(
		canvas,
		async () => {
			await updateCellInfo(context, renderer.state.currentFrameIndex, renderer.state.selectedCellIdentifier);

			setSimFrame(renderer.state.currentFrameIndex + 1, context["simInfo"].frameCount);
			setSimCurrentCellCount(renderer.state.cellCount);
		},
		() => {
			updateCellInfo(context, renderer.state.currentFrameIndex, renderer.state.selectedCellIdentifier)
		},
		async (frameIndex) => {
			return await sendVizDataRequest(context["simUUID"], frameIndex);
		}
	);
	
	await connectToSimulation(context, uuid);
}

window.onload = main;