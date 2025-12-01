import * as render from './viewer-render.js'

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

function showInitLog() { closeAll(); document.getElementById("message-log-container").style.display = "inline"; }
function closeInitLog() {            document.getElementById("message-log-container").style.display = "none"; }

window.closeSettings = closeSettings;
window.closeInitLog = closeInitLog;

function closeAll() {
	closeSettings();
	closeInitLog();
}

function toggleSettings() {
	if (document.getElementById("settings-container").style.display != "none")
		closeSettings()
	else
		showSettings();
}

function writeInitLogMessage(message) {
	var textArea = document.getElementById("message-log-text");
	textArea.value += message + " \n";
	textArea.scrollTop = textArea.scrollHeight;
}

function clearInitLog() {
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

/*
  Request a new frame to be shown.
  
    The original version of this function did the regular "send request, update viz data, return". However, when scrubbing through
  long timelines, a LOT of requests would get sent to the server, and since django is slow and single-threaded by default, the
  requests pilled up and latency increased to several seconds.
    The solution chosen was to only send a new request after the current one has finished, even if the user asks for a new frame in the
  meantime. The ideal would have been some kind of centralized 'request loop', but since Javascript lacks support for events (the
  synchronization primitive), that idea was canned. The solution implemented here simply checks if a new frame has been requested by the
  caller/user anytime a response arrives.
*/
async function requestFrame(context, index) {
	let handler = context["frameRequestHandler"];
	let uuid = context["simUUID"];

	if (handler.isRunning === true) {
		handler.nextIndex = index;
	} else {
		handler.isRunning = true;
		handler.nextIndex = null;

		//IMPORTANT: Generally, do not "cache" the result of 'handler.nextIndex' because the local variable won't get
		//           updated when another 'thread' changes the next index.
		try {
			/*
			 We want to overlap the execution of 'sendVizDataRequest' and 'onFrameReceived' for speed reasons.
			 This is what that looks like:

			 |      Before loop      |        Loop #0        |       |       Loop #N-1       |      Loop #N       |
			 | sendVizDataRequest(0) | sendVizDataRequest(1) |  ...  | sendVizDataRequest(N) |                    |
			 |                       | onFrameReceived(0)    |  ...  | onFrameReceived(N-1)  | onFrameReceived(N) |
			*/
			let currentIndex = index;
			let currentResponse = await sendVizDataRequest(uuid, index);
	
			while (true) {
				if (handler.nextIndex != null) {
					//Take the next index and reset it
					let reqIndex = handler.nextIndex;
					handler.nextIndex = null;
	
					//We use 'Promise.allSettled' here instead of 'Promise.all' because 'allSettled' waits for all promises
					//to finish even if one of them rejects (i.e. fails)
					let responses = await Promise.allSettled([
						sendVizDataRequest(uuid, reqIndex),
						onFrameReceived(context, currentIndex, currentResponse)
					]);
	
					currentIndex = reqIndex;
					currentResponse = responses[0].status == "fulfilled" ? responses[0].value : null;
				} else {
					if (currentResponse != null)
						await onFrameReceived(context, currentIndex, currentResponse);
	
					if (handler.nextIndex == null)
						break;
				}
			}
		} finally {
			handler.isRunning = false;

			//Under normal conditions, this shouldn't be needed. However, if one of the requests in the try...catch throws an exception,
			//its possible that we will exit the loop before the next index is handled.
			if (handler.nextIndex != null)
				return requestFrame(context, handler.nextIndex);
		}
	}
}

async function sendVizDataRequest(uuid, index) {
	try {
		const frameData = await fetch(`/api/vizdata?index=${index}&uuid=${uuid}`);

		if (frameData.ok) {
			return frameData;
		} else {
			console.error(`Error when requesting frame ${index}: ${frameData.status} - ${frameData.statusText}`);
		}
	} catch (error) {
		console.error(error);
	}

	return null;
}

async function onFrameReceived(context, index, frameResponse) {
	const frameBuffer = await frameResponse.arrayBuffer();

	//Update the user interface
	const cellCount = render.pushFrameData(context["graphics"]["gl"], context, frameBuffer)

	context["currentFrame"]["cellData"] = frameBuffer;
	context["currentFrame"]["cellCount"] = cellCount;
	context["currentFrame"]["frameIndex"] = index;

	setSimFrame(index + 1, context["simInfo"].frameCount);
	setSimCurrentCellCount(cellCount);

	//Update the cell index based on the identifier
	if (context["selectedCellIndex"] >= 0) {
		context["selectedCellIndex"] = -1;

		const identifier = context["selectedCellIdentifier"];

		for (let i = 0; i < cellCount; i++) {
			if (render.lookupCellIdentifier(frameBuffer, i, cellCount) === identifier) {
				context["selectedCellIndex"] = i;
				break;
			}
		}
	}

	await updateCellInfo(context);
}

async function confirmDownload(context) {
	if (context["isDownloadingFrames"]) {
		alert("Cannot start a new download while another is in progress");
		return;
	}

	const frameCount = context["simInfo"].frameCount;
	let startValue = document.getElementById("download-range-start-input").value;
	let endValue = document.getElementById("download-range-end-input").value;

	if (startValue <= 0 || startValue > frameCount) {
		alert(`Start value must be between 1 and ${frameCount}`);
		return;
	}

	if (endValue <= 0 || endValue > frameCount) {
		alert(`End value must be between 1 and ${frameCount}`);
		return;
	}

	if (endValue < startValue) {
		const temp = endValue;
		endValue = startValue;
		startValue = temp;
	}

	closeDownloadOptions(context);

	//Start download
	context["isDownloadingFrames"] = true;

	const downloadCount = endValue - startValue + 1;
	const downloadFirstIndex = startValue - 1;
	const uuid = context["simUUID"];
	const simName = context["simInfo"].name;

	const finalBlobContainer = new zip.BlobWriter();
	const zipWriter = new zip.ZipWriter(finalBlobContainer);

	const downloadBtn = document.getElementById("download-btn");
	downloadBtn.textContent = `0 / ${downloadCount} `;	
	downloadBtn.style.pointerEvents = "none";

	let failed = false;

	for (let i = 0; i < downloadCount; i++) {
		const filename = `step-${downloadFirstIndex + i + 1}.cm5_step`
		
		const response = await fetch(`/api/cellstates?uuid=${uuid}&index=${downloadFirstIndex + i}`);
		if (!response.ok) {
			console.log(`Error when downloading step: ${response.status}:${response.statusText}`);

			failed = true;
			break;
		}
		
		const cellData = await response.blob();
		const cellDataReader = new zip.BlobReader(cellData);
		await zipWriter.add(filename, cellDataReader);

		downloadBtn.textContent = `${i + 1} / ${downloadCount} `;	
	}

	await zipWriter.close();

	if (failed) {
		downloadBtn.style.pointerEvents = "";
		downloadBtn.textContent = "Failed to download";
		context["isDownloadingFrames"] = false;

		return;
	}

	downloadBtn.textContent = "Packaging...";

	const zippedData = await finalBlobContainer.getData();
	const dataURL = URL.createObjectURL(zippedData);

	const downloaderLink = document.getElementById("downloader-link");
	downloaderLink.href = dataURL;
	downloaderLink.download = `${simName}.zip`;
	downloaderLink.click();
	URL.revokeObjectURL(dataURL);

	downloadBtn.style.pointerEvents = "";
	downloadBtn.textContent = "Download";
	context["isDownloadingFrames"] = false;
}

function connectToSimulation(context, uuid) {
	return connectToServer(context)
		.then((socket) => { socket.send(JSON.stringify({ "action": "connectto", "data": `${uuid}` })); })
		.catch(() => {
			writeInitLogMessage("Failed to connect to server");
			writeInitLogMessage("    (Check your browser's developer console for more details)");
			showInitLog();
		});
}

function initializeRenderer(gl, context) {
	return render.init(gl, context)
		.catch((err) => {
			writeInitLogMessage("An error occured when initializing the renderer");
			writeInitLogMessage(`${err}`);
			showInitLog();

			console.log(err);
		});
}

function connectToServer(context) {
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
				clearInitLog();

				await requestShapes(context);

				if (data.crashMessage) {
					writeInitLogMessage("========= CRASH LOG =========");
					writeInitLogMessage("");
					writeInitLogMessage(data.crashMessage);
					showInitLog();
				}

				if (data.frameCount > 0) {
					requestFrame(context, 0);
				}
			} else if (action == "simlaunch") {
				clearInitLog();
				writeInitLogMessage("New simulation launched");
			} else if (action === "newframe") {
				const frameCount = data["frameCount"];

				context["simInfo"].frameCount = frameCount;
				context["timelineSlider"].max = frameCount;

				if (context["alwaysUseLatestStep"]) {
					if (frameCount == 0) {
						render.clearFrameData(context);
						setSimFrame(0, 0);
					} else {
						requestFrame(context, frameCount - 1);
					}

					context["timelineSlider"].value = frameCount;
				} else {
					setSimFrame(context["currentFrame"]["frameIndex"], context["simInfo"].frameCount);
				}
			} else if (action === "newshape") {
				await requestShapes(context);
			} else if (action === "status_change") {
				setStatusFromServer(data);
			} else if (action === "error_message") {
				writeInitLogMessage("\n!!! A fatal error has occured !!!\n");
				writeInitLogMessage(data);
				showInitLog();

				setStatusMessage("Fatal Error");
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

function processTimelineChange(value, context) {
	//NOTE: When someone re-opens a closed tab, the web browser may send an oninput
	//event. This might happen before "simUUID" has been set, so we end sending "undefined" as the UUID
	if (context["simUUID"] != undefined) {
		requestFrame(context, value - 1);
	}
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

async function updateCellInfo(context) {
	const cellIndex = context["selectedCellIndex"];

	const cellDetailsHeader = document.getElementById("cell-details-header");
	const cellDetailsSection = document.getElementById("cell-details-section");

	if (cellIndex === -1) {
		cellDetailsHeader.style.display = "none";
		cellDetailsSection.style.display = "none";
	} else {
		const simUUID = context["simUUID"];
		const frameIndex = context["currentFrame"]["frameIndex"];
		const cellId = context["selectedCellIdentifier"];

		const cellData = await fetch(`/api/cellinfoindex?cellid=${cellId}&frameindex=${frameIndex}&uuid=${simUUID}`);

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

async function initFrame(gl, context) {
	setStatusMessage("Initializing");

	context["selectedCellIndex"] = -1;
	context["selectedCellIdentifier"] = -1;	
	context["isDownloadingFrames"] = false;

	//Initialize current frame data
	context["currentFrame"] = {
		"cellData": null,
		"cellCount": 0,
		"frameIndex": 0,
	};

	//Initialize frame request handler
	context["frameRequestHandler"] = {
		"isRunning": false,
		"nextIndex": 0,
	};

	//Initialize camera details
	context["camera"] = {
		"orbitCenter": vec3.fromValues(0, 0.0, 0.0),
		"orbitRadius": 60.0,
		"orbitMinRadius": 2.0,
		"orbitRadiusSensitivity": 0.02,

		"position": vec3.fromValues(0, 0.0, 0.0),
		"rotation": quat.fromEuler(quat.create(), -45, 0, 0),//quat.fromEuler(quat.create(), -35, 45, 0),

		"yaw": 0,
		"pitch": -45,

		"fovAngle": 60.0,
		"nearZ": 0.1,
		"farZ": 2000.0,

		"projMatrix": mat4.create(),
		"viewMatrix": mat4.create(),
		"invProjMatrix": mat4.create(),
		"invViewMatrix": mat4.create(),
	};

	//Initialize simulation info
	context["simInfo"] = {
		"name": "",
		"frameCount": 0
	};

	//Initialize shape list
	context["shapeList"] = [];

	//Initialize render settings
	context["renderSettings"] = {
		"depthPeeling": {
			"enabled": true,
			"layerCount": 3,
			"depthCompareBias": 0.000001,
		},
		"showOutlines": true,
		"flatShading": true,
		"signalVolumeEnabled": true,
		"signalVolumeDensity": 1.0,
	};

	//Initialize timeline slider 
	const timelineSlider = document.getElementById("frame-timeline");
	timelineSlider.oninput = function() { processTimelineChange(this.value, context); };
	timelineSlider.min = 1;
	timelineSlider.max = 1;
	timelineSlider.step = 1;
	timelineSlider.value = 0;

	context["timelineSlider"] = timelineSlider;

	const snapToLastCheckbox = document.getElementById("snap-to-last");
	snapToLastCheckbox.onchange = function(event) { context["alwaysUseLatestStep"] = this.checked; };

	context["alwaysUseLatestStep"] = snapToLastCheckbox.checked;

	//Init camera matrices
	updateCameraView(context);
	updateProjMatrix(context);

	//Setup viewer buttons
	const uuid = param__simulationUUID;

	let tempButton = null;
	if (tempButton = document.getElementById("source-btn")) tempButton.onclick = (e) => { window.open(`/edit/${uuid}/`, "_blank"); };
	if (tempButton = document.getElementById("download-btn")) tempButton.onclick = (e) => { toggleDownloadOptions(context); };
	if (tempButton = document.getElementById("settings-btn")) tempButton.onclick = (e) => { toggleSettings(); };	
	if (tempButton = document.getElementById("reload-btn")) tempButton.onclick = (e) => { reloadSimulation(context); };
	if (tempButton = document.getElementById("start-btn")) tempButton.onclick = (e) => { startSimulation(context); };
	if (tempButton = document.getElementById("pause-btn")) tempButton.onclick = (e) => { pauseSimulation(context); };
	if (tempButton = document.getElementById("stop-btn")) tempButton.onclick = (e) => { stopSimulation(context); };
	
	if (tempButton = document.getElementById("download-options-confirm")) tempButton.onclick = (e) => { confirmDownload(context); };
	if (tempButton = document.getElementById("download-options-cancel")) tempButton.onclick = (e) => { closeDownloadOptions(context); };
	
	//Setup settings inputs
	const currentVersion = 1;
	const renderSettings = context["renderSettings"];
	
	function parseBool(x) {
		return x === "true";
	}

	function settingsUpdated() {
		//IMPORTANT: Remember to change the version number (i.e. the "vX;" at the start) whenever you change the stored settings
		let cookieValue = `v${currentVersion};`
			+ encodeURIComponent(renderSettings["flatShading"]) + ";"
			+ encodeURIComponent(renderSettings["showOutlines"]) + ";"
			+ encodeURIComponent(renderSettings["signalVolumeEnabled"]) + ";"
			+ encodeURIComponent(renderSettings["signalVolumeDensity"]) + ";"
			+ encodeURIComponent(renderSettings["depthPeeling"]["enabled"]) + ";"
			+ encodeURIComponent(renderSettings["depthPeeling"]["layerCount"]) + ";";

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
		renderSettings["flatShading"] = parseBool(decodeURIComponent(comps[1]));
		renderSettings["showOutlines"] = parseBool(decodeURIComponent(comps[2]));
		renderSettings["signalVolumeEnabled"] = parseBool(decodeURIComponent(comps[3]));
		renderSettings["signalVolumeDensity"] = parseInt(decodeURIComponent(comps[4]));
		renderSettings["depthPeeling"]["enabled"] = parseBool(decodeURIComponent(comps[5]));
		renderSettings["depthPeeling"]["layerCount"] = parseInt(decodeURIComponent(comps[6]));
	}

	document.getElementById("use-flat-shading").checked = renderSettings["flatShading"];
	document.getElementById("show-cell-outlines").checked = renderSettings["showOutlines"];
	document.getElementById("signal-density-input").value = renderSettings["signalVolumeDensity"];
	document.getElementById("signals-enabled-input").checked = renderSettings["signalVolumeEnabled"];
	document.getElementById("depth-peel-layers-input").value = renderSettings["depthPeeling"]["layerCount"];
	document.getElementById("transparency-enabled-input").checked = renderSettings["depthPeeling"]["enabled"];

	document.getElementById("use-flat-shading").onchange = function(e) { renderSettings["flatShading"] = this.checked; settingsUpdated(); };
	document.getElementById("show-cell-outlines").onchange = function(e) { renderSettings["showOutlines"] = this.checked; settingsUpdated(); };
	document.getElementById("signal-density-input").onchange = function(e) { renderSettings["signalVolumeDensity"] = this.value; settingsUpdated(); };
	document.getElementById("signals-enabled-input").onchange = function(e) { renderSettings["signalVolumeEnabled"] = this.checked; settingsUpdated(); };
	document.getElementById("depth-peel-layers-input").onchange = function(e) { renderSettings["depthPeeling"]["layerCount"] = this.value; settingsUpdated(); };
	document.getElementById("transparency-enabled-input").onchange = function(e) { renderSettings["depthPeeling"]["enabled"] = this.checked; settingsUpdated(); };

	//Initialize the renderer
	await initializeRenderer(gl, context);
	await connectToSimulation(context, uuid);
}

function computeCameraRay(x, y, width, height, invProjMatrix, invViewMatrix) {
	const ndcX = 2.0 * (x / width) - 1.0;
	const ndcY = 1.0 - 2.0 * (y / height);
	const clipCoords = vec4.fromValues(ndcX, ndcY, -1.0, 1.0);

	const eyeCoords = vec4.transformMat4(vec4.create(), clipCoords, invProjMatrix);
	const viewCoords = vec4.fromValues(eyeCoords[0], eyeCoords[1], -1.0, 0.0);
	const worldDir = vec4.transformMat4(vec4.create(), viewCoords, invViewMatrix);

	return vec3.normalize(vec3.create(), vec3.fromValues(worldDir[0], worldDir[1], worldDir[2]));
}

function doMousePick(context, mouseX, mouseY, viewportWidth, viewportHeight) {
	// https://iquilezles.org/articles/intersectors/
	function capIntersect(ro, rd, pa, pb, ra) {
		const ba = vec3.sub(vec3.create(), pb, pa);
		const oa = vec3.sub(vec3.create(), ro, pa);
		const baba = vec3.dot(ba, ba);
		const bard = vec3.dot(ba, rd);
		const baoa = vec3.dot(ba, oa);
		const rdoa = vec3.dot(rd, oa);
		const oaoa = vec3.dot(oa, oa);
		let a = baba - bard * bard;
		let b = baba * rdoa - baoa * bard;
		let c = baba * oaoa - baoa * baoa - ra * ra * baba;
		let h = b * b - a * c;

		if (h >= 0.0) {
			const t = (-b - Math.sqrt(h)) / a;
			const y = baoa + t * bard;

			// body
			if (y > 0.0 && y < baba) return t;

			// caps
			const oc = (y <= 0.0) ? oa : vec3.sub(vec3.create(), ro, pb);
			b = vec3.dot(rd, oc);
			c = vec3.dot(oc, oc) - ra * ra;
			h = b * b - c;

			if (h > 0.0) return -b - Math.sqrt(h);
		}

		return -1.0;
	}

//	const t0 = performance.now();

	const currentFrame = context["currentFrame"];
	
	const camera = context["camera"];
	const cameraPos = camera["position"];
	const cameraRay = computeCameraRay(mouseX, mouseY, viewportWidth, viewportHeight, camera["invProjMatrix"], camera["invViewMatrix"]);

	const dataBuffer = currentFrame["cellData"];
	if (!dataBuffer) return;

	const cellCount = currentFrame["cellCount"];
	const dataView = new DataView(dataBuffer);

	let minIndex = -1;
	let minDist = Number.MAX_VALUE;

	for (let i = 0; i < cellCount; i++) {
		const baseOffset = render.calcCellVertexOffset(i);

		const cellPos = vec3.fromValues(
			dataView.getFloat32(baseOffset + 0, true),
			dataView.getFloat32(baseOffset + 4, true),
			dataView.getFloat32(baseOffset + 8, true),
		);

		const cellDir = vec3.fromValues(
			dataView.getFloat32(baseOffset + 12, true),
			dataView.getFloat32(baseOffset + 16, true),
			dataView.getFloat32(baseOffset + 20, true),
		);

		const length = dataView.getFloat32(baseOffset + 24, true);
		const radius = dataView.getFloat32(baseOffset + 28, true);

		const yaw = Math.atan2(cellDir[0], cellDir[2]);
		const pitch = Math.acos(cellDir[1]);

		const rotVector = vec3.fromValues(
			radius * Math.sin(yaw) * Math.sin(pitch),
			0.5 * Math.cos(pitch),
			radius * Math.cos(yaw) * Math.sin(pitch)
		);
		
		const cellEnd0 = vec3.scaleAndAdd(vec3.create(), cellPos, rotVector, length);
		const cellEnd1 = vec3.scaleAndAdd(vec3.create(), cellPos, rotVector, -length);

		const intersectDist = capIntersect(cameraPos, cameraRay, cellEnd0, cellEnd1, radius);

		if (intersectDist >= 0 && intersectDist < minDist) {
			minDist = intersectDist;
			minIndex = i;
		}
	}

//	const t1 = performance.now();
//	console.log(`Performance: ${t1 - t0}ms (${minIndex}, ${minDist})`);

	context["selectedCellIndex"] = minIndex;
	context["selectedCellIdentifier"] = minIndex !== -1 ? render.lookupCellIdentifier(dataBuffer, minIndex, cellCount) : undefined;

	updateCellInfo(context);
}

function updateProjMatrix(context) {
	const camera = context["camera"];
	const aspectRatio = context["graphics"]["targetWidth"] / context["graphics"]["targetHeight"];

	camera["projMatrix"] = mat4.perspective(mat4.create(), glMatrix.toRadian(camera["fovAngle"]), aspectRatio, camera["nearZ"], camera["farZ"]);
	camera["invProjMatrix"] = mat4.invert(mat4.create(), camera["projMatrix"]);
}

function updateCameraView(context) {
	const camera = context["camera"];

	//Update the camera position
	const orbitCenter = camera["orbitCenter"];
	const orbitRadius = camera["orbitRadius"];
	const orientVector = vec3.transformQuat(vec3.create(), vec3.fromValues(0, 0, -1), camera["rotation"]);

	camera["position"] = vec3.scaleAndAdd(vec3.create(), orbitCenter, orientVector, -orbitRadius);

	//Update the view matrix
	const viewMatrix = mat4.create();
	mat4.transpose(viewMatrix, mat4.fromQuat(mat4.create(), camera["rotation"]));
	mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), camera["position"]));

	camera["viewMatrix"] = viewMatrix;
	camera["invViewMatrix"] = mat4.invert(mat4.create(), camera["viewMatrix"]);
}

function resizeCanvas(gl, context, canvas) {
	canvas.width = context["graphics"]["currentWidth"];
	canvas.height = context["graphics"]["currentHeight"];

	render.resize(gl, context, canvas);
}

function processKeyButton(event, context, isdown) {
	//Do nothing
}

function processMouseMove(event, context) {
	/*
	 Structure of `event.buttons`:
	     Bit 0: Primary button (usually the left button)
	     Bit 1: Secondary button (usually the right button)
	     Bit 2: Auxiliary button (usually the mouse wheel button or middle button)
	     Bit 3: 4th button (typically the "Browser Back" button)
	     Bit 4: 5th button (typically the "Browser Forward" button)
	*/
	const orbitButtonPressed = (event.buttons & (1 << 0)) && !event.shiftKey;
	const panButtonPressed = event.buttons & (1 << 1);
	
	const graphics = context["graphics"];
	const viewportWidth = graphics["targetWidth"];
	const viewportHeight = graphics["targetHeight"];

	const mouseXScale = viewportWidth / graphics["canvas"].clientWidth;
	const mouseYScale = viewportHeight / graphics["canvas"].clientHeight;

	const lastX = (event.offsetX - event.movementX) * mouseXScale;
	const lastY = (event.offsetY - event.movementY) * mouseYScale;

	const nextX = event.offsetX * mouseXScale;
	const nextY = event.offsetY * mouseYScale;

	//Move orbit
	const planeNormal = vec3.fromValues(0, 1, 0);

	const camera = context["camera"];
	const cameraPos = camera["position"];
	
	if (panButtonPressed) {
		const cameraRayLast = computeCameraRay(lastX, lastY, viewportWidth, viewportHeight, camera["invProjMatrix"], camera["invViewMatrix"]);
		const cameraRayNext = computeCameraRay(nextX, nextY, viewportWidth, viewportHeight, camera["invProjMatrix"], camera["invViewMatrix"]);

		const rayDistLast = -vec3.dot(cameraPos, planeNormal) / vec3.dot(cameraRayLast, planeNormal);
		const rayDistNext = -vec3.dot(cameraPos, planeNormal) / vec3.dot(cameraRayNext, planeNormal);
		
		if (rayDistLast < 0 || rayDistNext < 0)
			return;

		const planePosLast = vec3.scaleAndAdd(vec3.create(), cameraPos, cameraRayLast, rayDistLast);
		const planePosNext = vec3.scaleAndAdd(vec3.create(), cameraPos, cameraRayNext, rayDistNext);

		const planePosDiff = vec3.sub(vec3.create(), planePosLast, planePosNext);
		const planePosDiffLength = vec3.length(planePosDiff);

		let orbitPosOffset = planePosDiff;

		if (planePosDiffLength != 0) {
			//When the camera is looking at the ground plane from a shallow angle, the magnitude of the movement vector
			//can become very large and make controlling the camera very difficult. To alleviate this, we'll cap the magintude.
			orbitPosOffset = vec3.scale(vec3.create(), planePosDiff, Math.min(planePosDiffLength, 40) / planePosDiffLength);
		}

		camera["orbitCenter"] = vec3.add(vec3.create(), camera["orbitCenter"], orbitPosOffset);

		updateCameraView(context);
	} else if (orbitButtonPressed) {
		const sensitivity = 0.2;

		camera["yaw"] = (camera["yaw"] - sensitivity * event.movementX) % 360.0;
		camera["pitch"] = (camera["pitch"] - sensitivity * event.movementY) % 360.0;

		camera["rotation"] = quat.fromEuler(quat.create(), camera["pitch"], camera["yaw"], 0);

		updateCameraView(context);
	}
}

function processMouseButton(event, context, isdown) {
	event.stopPropagation();
	event.preventDefault();

	if (event.button == 0 && isdown && event.shiftKey) {
		const graphics = context["graphics"];

		const viewportWidth = graphics["targetWidth"];
		const viewportHeight = graphics["targetHeight"];

		const mouseX = event.offsetX * (viewportWidth / graphics["canvas"].clientWidth);
		const mouseY = event.offsetY * (viewportHeight / graphics["canvas"].clientHeight);

		doMousePick(context, mouseX, mouseY, viewportWidth, viewportHeight);
	}

	if (isdown) {
		context["graphics"]["canvas"].focus();
	}
}

function processMouseWheel(event, context) {
	event.stopPropagation();
	event.preventDefault();

	var camera = context["camera"];

	var radius = camera["orbitRadius"];
	radius += camera["orbitRadiusSensitivity"] * event.deltaY;
	radius = Math.max(radius, camera["orbitMinRadius"]);

	camera["orbitRadius"] = radius;

	updateCameraView(context);
}

function attachResizeBehavior(context, canvas) {
	//Define resize callback
	function onCanvasResize(entries) {
		//Look at: https://webgl2fundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html
		const entry = entries[0];

		let width = 0, height = 0, dpr = 1;
		if (entry.devicePixelContentBoxSize) {
			//This is the only path that gives a correct answer, all the
			//other ones are inaccurate
			width = entry.devicePixelContentBoxSize[0].inlineSize;
			height = entry.devicePixelContentBoxSize[0].blockSize;
		} else if (entry.contentBoxSize) {
			if (entry.contentBoxSize[0]) {
				width = entry.contentBoxSize[0].inlineSize;
				height = entry.contentBoxSize[0].blockSize;
			} else {
				width = entry.contentBoxSize.inlineSize;
				height = entry.contentBoxSize.blockSize;
			}

			dpr = window.devicePixelRatio;
		} else {
			width = entry.contentRect.width;
			height = entry.contentRect.height;
			dpr = window.devicePixelRatio;
		}

		context["graphics"]["targetWidth"] = Math.round(width * dpr);
		context["graphics"]["targetHeight"] = Math.round(height * dpr);

		updateProjMatrix(context);
	}

	//Observe resize behavior
	const resizeObserver = new ResizeObserver(onCanvasResize);

	try {
		resizeObserver.observe(canvas, {box: "device-pixel-content-box"});
	} catch (ex) {
		resizeObserver.observe(canvas, {box: "content-box"});
	}
}

async function main() {
	//Create canvas
	const canvas = document.getElementById("renderTargetCanvas");
	const gl = canvas.getContext("webgl2", { antialias: false });
	
	if (gl === null) {
		alert("Unable to initialize WebGL");
		return;
	}

	canvas.focus();

	let context = {
		"graphics": {
			"canvas": canvas,
			"gl": gl,

			"currentWidth": canvas.clientWidth,
			"currentHeight": canvas.clientHeight,
			"targetWidth": canvas.clientWidth,
			"targetHeight": canvas.clientHeight,
		},
	};

	await initFrame(gl, context);
	resizeCanvas(gl, context, canvas);
	
	attachResizeBehavior(context, canvas);

	canvas.addEventListener("mousemove", e => processMouseMove(e, context));
	canvas.addEventListener("mousedown", e => processMouseButton(e, context, true));
	canvas.addEventListener("mouseup", e => processMouseButton(e, context, false));
	canvas.addEventListener("keydown", e => processKeyButton(e, context, true));
	canvas.addEventListener("keyup", e => processKeyButton(e, context, false));
	canvas.addEventListener("wheel", e => processMouseWheel(e, context));
	canvas.addEventListener("contextmenu", e => { e.preventDefault() });

	//Initialize render loop
	var lastTime = 0;

	function renderFrame(now) {
		//Check if a resize is needed
		const graphics = context["graphics"];

		if (graphics["currentWidth"] !== graphics["targetWidth"] ||
			graphics["currentHeight"] !== graphics["targetHeight"])
		{
			graphics["currentWidth"] = graphics["targetWidth"];
			graphics["currentHeight"] = graphics["targetHeight"];

			resizeCanvas(gl, context, canvas);
		}

		//Update frame
		const delta = (now - lastTime) * 0.001;
		lastTime = now;

		render.drawFrame(gl, context, delta);

		window.requestAnimationFrame(renderFrame);
	}
	
	window.requestAnimationFrame(renderFrame);
}

window.onload = main;