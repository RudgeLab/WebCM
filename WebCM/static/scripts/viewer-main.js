import * as render from './viewer-render.js'

function setSimName(name) {
	document.getElementById("sim-name").innerHTML = `Name: ${name}`;
	document.title = `${name} - CellModeller Simulation`;
}

function setSimFrame(index, frameCount) {
	document.getElementById("sim-frame").innerHTML = `Frame: ${index} / ${frameCount}`;
}

function setStatusMessage(message) {
	document.getElementById("status-label").innerHTML = `Status: ${message}`;
}

function setButtonContainerDisplay(display) {
	document.getElementById("button-container").style.display = display;
}

function showSettings(context) {
	document.getElementById("settings-container").style.display = "inline";

	context["isSettingsWindowOpen"] = true;
}

function closeSettings(context) {
	document.getElementById("settings-container").style.display = "none";

	context["isSettingsWindowOpen"] = false;
}

function toggleSettings(context) {
	if (context["isSettingsWindowOpen"]) closeSettings(context);
	else showSettings(context);
}

/****** Init log ******/
function openInitLogWindow(context, title) {
	document.getElementById("message-log-title").innerText = title;
	document.getElementById("message-log-container").style.display = "inline";

	context["isMessageLogOpen"] = true;
}

function closeInitLogWindow(context, clear) {
	document.getElementById("message-log-container").style.display = "none";

	if (clear) {
		document.getElementById("message-log-text").value = "";
	}

	context["isMessageLogOpen"] = false;
}

function writeInitLogMessage(message) {
	var textArea = document.getElementById("message-log-text");

	/*if (textArea.value.length > 0) {
		textArea.value += "\n";
	}*/

	textArea.value = message;
	textArea.scrollTop = textArea.scrollHeight;
}

async function requestShapes(context, uuid) {
	const data = await fetch(`/api/shapelist?uuid=${uuid}`);
	if (!data.ok) {
		console.error(`Error when shape list ${data.status} - ${data.statusText}`);
		return;
	}

	const buffer = await data.json();

	context["renderSettings"]["shapeList"] = buffer;
}

async function requestFrame(context, uuid, index) {
	context["currentFrameIndex"] = index;

	const frameRequestIndex = context["frameRequestIndex_Latest"]++;
	
	const frameData = await fetch(`/api/vizdata?index=${index}&uuid=${uuid}`);
	if (!frameData.ok) {
		console.error(`Error when requesting frame ${index}: ${frameData.status} - ${frameData.statusText}`);
		return;
	}

	const frameBuffer = await frameData.arrayBuffer();

	if (frameRequestIndex < context["frameRequestIndex_Received"]) {
		//Skip this frame
		return;
	}

	context["frameRequestIndex_Received"] = frameRequestIndex;
	context["simInfo"].frameIndex = index;

	setSimFrame(index + 1, context["simInfo"].frameCount);

	//Update UI
	const [ cellCount ] = render.pushFrameData(context["graphics"]["gl"], context, frameBuffer)

	//Update the cell index based on the identifier
	if (context["selectedCellIndex"] >= 0) {
		context["selectedCellIndex"] = -1;

		const identifier = context["selectedCellIdentifier"];

		for (let i = 0; i < cellCount; i++) {
			if (render.lookupCellIdentifier(context, i) === identifier) {
				context["selectedCellIndex"] = i;
				break;
			}
		}
	}

	document.getElementById("simdets-cellcount").innerText = cellCount;

	await updateCellInfo(context);
}

async function downloadAllFrames(context) {
	if (context["isDownloadingFrames"]) {
		return;
	}

	context["isDownloadingFrames"] = true;

	const uuid = context["simUUID"];
	const frameCount = context["simInfo"].frameCount;
	const simName = context["simInfo"].name;

	const finalBlobContainer = new zip.BlobWriter();
	const zipWriter = new zip.ZipWriter(finalBlobContainer);

	const downloadBtn = document.getElementById("download-btn");
	downloadBtn.textContent = `0 / ${frameCount} `;	
	downloadBtn.style.pointerEvents = "none";

	let failed = false;

	for (let i = 0; i < frameCount; i++) {
		const filename = `step-${i + 1}.cm5_step`
		
		const response = await fetch(`/api/cellstates?uuid=${uuid}&index=${i}`);
		if (!response.ok) {
			failed = true;
			break;
		}
		
		const cellData = await response.blob();
		const cellDataReader = new zip.BlobReader(cellData);
		await zipWriter.add(filename, cellDataReader);

		downloadBtn.textContent = `${i + 1} / ${frameCount} `;	
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
	connectToServer(context)
		.then((socket) => { socket.send(JSON.stringify({ "action": "connectto", "data": `${uuid}` })); });
}

function connectToServer(context) {
	return new Promise((resolve, reject) => {
		setStatusMessage("Connecting");

		let commsSocket = new WebSocket(`ws://${window.location.host}/ws/usercomms/`);
		
		commsSocket.onopen = function(e) {
			setStatusMessage("Connected");
			resolve(commsSocket);
		};

		commsSocket.onerror = function(err) {
			reject(err);
		};
		
		commsSocket.onmessage = async function(e) {
			const message = JSON.parse(e.data);

			const action = message["action"];
			const data = message["data"];

			if (action === "simheader") {
				context["simUUID"] = data["uuid"];

				context["simInfo"] = {};
				context["simInfo"].name = data.name;
				context["simInfo"].frameIndex = 0;
				context["simInfo"].frameCount = data.frameCount;
				context["simInfo"].isOnline = data.isOnline;

				context["timelineSlider"].max = data.frameCount;

				setSimFrame(0, data.frameCount);
				setStatusMessage("Offline");
				setSimName(data.name);

				await requestShapes(context, context["simUUID"]);

				if (data.frameCount > 0) {
					await requestFrame(context, context["simUUID"], context["simInfo"].frameIndex);
				}

				if (data.isOnline) {
					setButtonContainerDisplay("block");
					setStatusMessage("Running");
				}

				if (data.crashMessage) {
					openInitLogWindow(context, "Crash error");
					writeInitLogMessage(data.crashMessage);
				}
			} else if (action === "newframe") {
				const frameCount = data["frameCount"];

				context["simInfo"].frameCount = frameCount;
				context["timelineSlider"].max = frameCount;

				if (context["alwaysUseLatestStep"] && frameCount > 0) {
					requestFrame(context, context["simUUID"], frameCount - 1);

					context["timelineSlider"].value = frameCount;
				} else {
					setSimFrame(context["simInfo"].frameIndex, context["simInfo"].frameCount);
				}
			} else if (action === "newshape") {
				await requestShapes(context, context["simUUID"]);
			} else if (action === "infolog") {
				openInitLogWindow(context, "Initialization Log");
				writeInitLogMessage(data);
			} else if (action === "error_message") {
				openInitLogWindow(context, "Error Log");
				writeInitLogMessage(data);

				setStatusMessage("Fatal Error");
			} else if (action === "closeinfolog") {
				closeInitLogWindow(context, true);
			} else if (action === "simstopped") {
				setStatusMessage("Terminated");
			} else if (action === "reloaddone") {
				commsSocket.send(JSON.stringify({ "action": "connectto", "data": `${data["uuid"]}` }));
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
		setStatusMessage("Reloading");
		closeInitLogWindow(context, true);

		context["commsSocket"].send(JSON.stringify({ "action": "reload", "data": "" }));
	}
}

function stopSimulation(context) {
	fetch(`/api/stopsimulation?uuid=${context["simUUID"]}`);
}

function processTimelineChange(value, context) {
	//NOTE: When someone re-opens a closed tab, the web browser may send an oninput
	//event. This might happen before "simUUID" has been set, so we end sending "undefined" as the UUID
	if (context["simUUID"] != undefined) {
		requestFrame(context, context["simUUID"], value - 1);
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
		const frameIndex = context["currentFrameIndex"];
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

			cellDetailsHeader.style.display = "table-row-group";
			cellDetailsSection.style.display = "table-row-group";

			cellDetailsSection.innerHTML = cellText;
		} else {
			console.error(`Error when cell info: ${cellData.status} - ${cellData.statusText}`);

			cellDetailsHeader.style.display = "table-row-group";
			cellDetailsSection.style.display = "table-row-group";

			cellDetailsSection.innerHTML = `<td colspan="2" style="text-align: center;">Failed to fetch cell data</td>`;
		}
	}
}

function doMousePick(context) {
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

	//const t0 = performance.now();

	const camera = context["camera"];
	const viewportWidth = camera["width"];
	const viewportHeight = camera["height"];

	const mouseX = context["input"]["lastMouseX"];
	const mouseY = context["input"]["lastMouseY"];

	const ndcX = 2.0 * (mouseX / viewportWidth) - 1.0;
	const ndcY = 1.0 - 2.0 * (mouseY / viewportHeight);
	const clipCoords = vec4.fromValues(ndcX, ndcY, -1.0, 1.0);

	const projectionMatrix = camera["projectionMatrix"];
	const invProjectionMatrix = mat4.invert(mat4.create(), projectionMatrix)
	const eyeCoords = vec4.transformMat4(vec4.create(), clipCoords, invProjectionMatrix);
	const viewCoords = vec4.fromValues(eyeCoords[0], eyeCoords[1], -1.0, 0.0);

	const viewMatrix = camera["viewMatrix"];
	const invViewMatrix = mat4.invert(mat4.create(), viewMatrix);
	const worldDir = vec4.transformMat4(vec4.create(), viewCoords, invViewMatrix);
	const rayDir = vec4.normalize(vec4.create(), worldDir);

	const cameraPos = camera["position"];

	const dataBuffer = context["cellData"];
	if (!dataBuffer) return;

	const cellCount = context["cellCount"];
	const dataView = new DataView(dataBuffer);

	let minIndex = -1;
	let minDist = Number.MAX_VALUE;

	for (let i = 0; i < cellCount; i++) {
		const baseOffset = render.calcCellVertexOffset(context, i);

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

		const intersectDist = capIntersect(cameraPos, rayDir, cellEnd0, cellEnd1, radius);

		if (intersectDist >= 0 && intersectDist < minDist) {
			minDist = intersectDist;
			minIndex = i;
		}
	}

	//const t1 = performance.now();
	//console.log(`Performance: ${t1 - t0}ms (${minIndex}, ${minDist})`);

	context["selectedCellIndex"] = minIndex;
	context["selectedCellIdentifier"] = minIndex !== -1 ? render.lookupCellIdentifier(context, minIndex) : undefined;

	updateCellInfo(context);
}

async function initFrame(gl, context) {
	setStatusMessage("Initializing");

	context["selectedCellIndex"] = -1;
	context["currentFrameIndex"] = 0;
	context["frameRequestIndex_Received"] = 0;
	context["frameRequestIndex_Latest"] = 0;
	context["isMessageLogOpen"] = false;
	context["isSettingsWindowOpen"] = false;
	
	context["isDownloadingFrames"] = false;

	//Initialize camera details
	context["camera"] = {
		"orbitCenter": vec3.fromValues(0, 0.0, 0.0),
		"orbitRadius": 50.0,
		"orbitMinRadius": 2.0,

		"orbitLookSensitivity": 0.4,
		"orbitRadiusSensitivity": 0.02,

		"fovAngle": 60.0,
		"nearZ": 0.1,
		"farZ": 2000.0,
		"position": vec3.fromValues(0, 3.0, 10.0),
		"rotation": quat.create(),
		"pitch": -90.0,
		"yaw": 0.0,

		"projectionMatrix": mat4.create(),
		"viewMatrix": mat4.create(),

		"width": 0,
		"height": 0,
	};

	//Initialize input details
	context["input"] = {
		"orbitButtonPressed": false,
		"panButtonPressed": false,

		"lastMouseX": 0,
		"lastMouseY": 0
	};

	//Initialize simulation info
	context["simInfo"] = {
		"name": "",
		"frameIndex": 0,
		"frameCount": 0
	};

	//Initialize render settings
	context["renderSettings"] = {
		"shapeList": [],
		"depthPeeling": {
			"enabled": true,
			"layerCount": 5,
			"depthCompareBias": 0.000001,
		},
		"thinOutlines": false,
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

	//Setup buttons
	const uuid = param__simulationUUID;

	let tempButton = null;
	document.getElementById("source-btn").onclick = (e) => { window.open(`/edit/${uuid}/`, "_blank"); };
	if (tempButton = document.getElementById("download-btn")) tempButton.onclick = (e) => { downloadAllFrames(context); };
	if (tempButton = document.getElementById("settings-btn")) tempButton.onclick = (e) => { toggleSettings(context); };
	if (tempButton = document.getElementById("reload-btn")) tempButton.onclick = (e) => { reloadSimulation(context); };
	if (tempButton = document.getElementById("stop-btn")) tempButton.onclick = (e) => { stopSimulation(context); };
	
	document.getElementById("no-cell-outlines").onchange = function(event) { context["renderSettings"]["thinOutlines"] = this.checked; };
	document.getElementById("signal-density-input").onchange = function(event) { context["renderSettings"]["signalVolumeDensity"] = this.value; };
	document.getElementById("depth-peel-layers-input").onchange = function(event) { context["renderSettings"]["depthPeeling"]["layerCount"] = Math.max(Math.min(this.value, 64), 1); };
	document.getElementById("signals-enabled-input").onchange = function(event) { context["renderSettings"]["signalVolumeEnabled"] = this.checked; };
	document.getElementById("transparency-enabled-input").onchange = function(event) { context["renderSettings"]["depthPeeling"]["enabled"] = this.checked; };
	
	context["renderSettings"]["signalVolumeDensity"] = document.getElementById("signal-density-input").value;
	context["renderSettings"]["depthPeeling"]["layerCount"] = document.getElementById("depth-peel-layers-input").value;
	context["renderSettings"]["signalVolumeEnabled"] = document.getElementById("signals-enabled-input").checked;
	context["renderSettings"]["depthPeeling"]["enabled"] = document.getElementById("transparency-enabled-input").checked;

	//Initialize the renderer
	await render.init(gl, context);
	await connectToSimulation(context, uuid);
}

function drawScene(gl, context, delta) {
	let camera = context["camera"];
	let cameraPosition = camera["position"];
	let cameraRotation = camera["rotation"];

	quat.fromEuler(cameraRotation, camera["pitch"], camera["yaw"], 0);

	let forward = vec3.fromValues(0, 0, 1);
	vec3.transformQuat(forward, forward, cameraRotation);
	vec3.scaleAndAdd(cameraPosition, camera["orbitCenter"], forward, camera["orbitRadius"]);

	const aspectRatio = gl.canvas.width / gl.canvas.height;
	const projectionMatrix = mat4.perspective(mat4.create(), glMatrix.toRadian(camera["fovAngle"]), aspectRatio, camera["nearZ"], camera["farZ"]);

	const viewMatrix = mat4.create();
	mat4.transpose(viewMatrix, mat4.fromQuat(mat4.create(), cameraRotation));
	mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), cameraPosition));

	camera["position"] = cameraPosition;
	camera["rotation"] = cameraRotation;
	camera["projectionMatrix"] = projectionMatrix;
	camera["viewMatrix"] = viewMatrix;

	render.drawFrame(gl, context, delta);
}

function resizeCanvas(gl, context, canvas) {
	const canvasWidth = context["graphics"]["currentWidth"];
	const canvasHeight = context["graphics"]["currentHeight"];

	canvas.width = canvasWidth;
	canvas.height = canvasHeight;

	context["camera"]["width"] = canvasWidth;
	context["camera"]["height"] = canvasHeight;

	render.resize(gl, context, canvas);
}

function processKeyButton(event, context, isdown) {
	//Do nothing
}

function processMouseMove(event, context) {
	var input = context["input"];

	//offsetX and offsetY are in CSS pixels (I think). This means that if you zoom in
	//the offsets will be scaled down, even if you are cliking on the same pixel. So,
	//we need to scale them back up
	const canvas = context["graphics"]["canvas"];
	const mouseX = event.offsetX * (context["graphics"]["targetWidth"] / canvas.clientWidth);
	const mouseY = event.offsetY * (context["graphics"]["targetHeight"] / canvas.clientHeight);

	const deltaX = mouseX - input["lastMouseX"];
	const deltaY = mouseY - input["lastMouseY"];

	input["lastMouseX"] = mouseX;
	input["lastMouseY"] = mouseY;

	//Do not process input if the log window is open
	if (context["isMessageLogOpen"]) return;

	//Move orbit
	const camera = context["camera"];

	if (input["orbitButtonPressed"]) {
		const sensitivity = camera["orbitLookSensitivity"];

		camera["yaw"] = (camera["yaw"] - sensitivity * deltaX) % 360.0;
		camera["pitch"] = (camera["pitch"] - sensitivity * deltaY) % 360.0;
	} else if (input["panButtonPressed"]) {
		const cameraRotation = camera["rotation"];

		const sensitivity = 0.08;
		
		//Update up direction
		const sensY = sensitivity * deltaY;

		const up = vec3.fromValues(0, 1, 0);
		vec3.transformQuat(up, up, cameraRotation);
		vec3.multiply(up, up, vec3.fromValues(sensY, sensY, sensY));
		
		vec3.add(camera["orbitCenter"], up, camera["orbitCenter"]);

		//Update right direction
		const sensX = -sensitivity * deltaX;

		const right = vec3.fromValues(1, 0, 0);
		vec3.transformQuat(right, right, cameraRotation);
		vec3.multiply(right, right, vec3.fromValues(sensX, sensX, sensX));

		vec3.add(camera["orbitCenter"], right, camera["orbitCenter"]);
	}
}

function processMouseButton(event, context, isdown) {
	event.stopPropagation();
	event.preventDefault();

	switch (event.button) {
	case 0:
		if (isdown) doMousePick(context);
		break;
	case 1:
		context["input"]["panButtonPressed"] = isdown;
		break;
	case 2:
		context["input"]["orbitButtonPressed"] = isdown;
		break;
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

	//Initialize elements
	document.getElementById("message-log-close").onclick = () => closeInitLogWindow(context, false);
	document.getElementById("settings-close").onclick = () => closeSettings(context);

	//Initialize render loop
	var lastTime = 0;

	function render(now) {
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

		drawScene(gl, context, delta);

		window.requestAnimationFrame(render);
	}
	
	window.requestAnimationFrame(render);
}

window.onload = main;