import * as render from './viewer-render.js'

function setSimName(name) {
	document.getElementById("sim-name").innerHTML = `Name: ${name}`;
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

/****** Init log ******/
function openInitLogWindow(title) {
	document.getElementById("message-log-title").innerText = title;
	document.getElementById("message-log-container").style.display = "inline";
}

function closeInitLogWindow(clear) {
	document.getElementById("message-log-container").style.display = "none";

	if (close) {
		document.getElementById("message-log-text").value = "";
	}
}

function appendInitLogMessage(message) {
	var textArea = document.getElementById("message-log-text");

	if (textArea.value.length > 0) {
		textArea.value += "\n";
	}

	textArea.value += message;
	textArea.scrollTop = textArea.scrollHeight;
}

async function requestFrame(context, uuid, index) {
	context["currentIndex"] = index;
	
	const frameData = await fetch(`/api/saveviewer/framedata?index=${index}&uuid=${uuid}`);
	const frameBuffer = await frameData.arrayBuffer();

	if (context["currentIndex"] != index) {
		//TODO:
		//console.log("Skipping frame");
		//return;
	}

	context["simInfo"].frameIndex = index;

	setSimFrame(index + 1, context["simInfo"].frameCount);

	//Update UI
	const [ cellCount ] = render.pushFrameData(context["gl"], context, frameBuffer)

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

function connectToSimulation(context, uuid) {
	connectToServer(context)
		.then((socket) => { socket.send(JSON.stringify({ "action": "connectto", "data": `${uuid}` })); });
}

function connectToServer(context) {
	return new Promise((resolve, reject) => {
		setStatusMessage("Connecting");

		var commsSocket = new WebSocket(`ws://${window.location.host}/ws/usercomms/`);
		
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
				
				if (data.frameCount > 0) {
					await requestFrame(context, context["simUUID"], 0);
				}

				if (data.isOnline) {
					setButtonContainerDisplay("block");
					setStatusMessage("Running");
				}
			} else if (action === "newframe") {
				const frameCount = data["frameCount"];

				context["simInfo"].frameCount = frameCount;
				context["timelineSlider"].max = frameCount;

				setSimFrame(context["simInfo"].frameIndex, frameCount);

				if (context["alwaysUseLatestStep"] && frameCount > 0) {
					requestFrame(context, context["simUUID"], frameCount - 1);

					context["timelineSlider"].value = frameCount;
				}
			} else if (action === "infolog") {
				openInitLogWindow("Initialization Log");
				appendInitLogMessage(data);
			} else if (action === "error_message") {
				openInitLogWindow("Error Log");
				appendInitLogMessage(data);

				setStatusMessage("Fatal Error");
			} else if (action === "closeinfolog") {
				closeInitLogWindow(true);
			} else if (action === "simstopped") {
				setStatusMessage("Terminated");
			} else if (action === "reloaddone") {
				commsSocket.send(JSON.stringify({ "action": "connectto", "data": `${data["uuid"]}` }));
			}
		};
		
		commsSocket.onclose = (e) => {
			setStatusMessage("Not connected");
		};

		context["commsSocket"] = commsSocket;
	});
}

function recompileDevSimulation(context) {
	if (context["commsSocket"] !== null) {
		context["commsSocket"].send(JSON.stringify({ "action": "devrecompile", "data": "" }));

		setStatusMessage("Recompiling");
	}
}

function reloadDevSimulation(context) {
	if (context["commsSocket"] !== null) {
		context["commsSocket"].send(JSON.stringify({ "action": "devreload", "data": "" }));

		setStatusMessage("Reloading");
	}
}

function stopSimulation(context) {
	fetch(`/api/simrunner/stopsimulation?uuid=${context["simUUID"]}`);
}

function processTimelineChange(value, context) {
	requestFrame(context, context["simUUID"], value - 1);
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
		const frameIndex = context["currentIndex"];
		const cellId = context["selectedCellIdentifier"];

		const cellData = await fetch(`/api/saveviewer/cellinfoindex?cellid=${cellId}&frameindex=${frameIndex}&uuid=${simUUID}`);
		const cellProps = await cellData.json();

		let cellText = "";

		for (const key in cellProps) {
			const value = cellProps[key];

			let text = value;
			if (typeof value == 'number') {
				const magnitude = Math.pow(10, 5);

				text = Math.floor(value * magnitude) / magnitude;;
			}

			cellText += `<tr><td>${key}</td><td>${text}</td></tr>`;
		}

		cellDetailsHeader.style.display = "table-row-group";
		cellDetailsSection.style.display = "table-row-group";

		cellDetailsSection.innerHTML = cellText;
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
	context["useThinOutlines"] = false;

	//Initialize camera details
	context["camera"] = {
		"orbitCenter": vec3.fromValues(0, 0.0, 0.0),
		"orbitRadius": 50.0,
		"orbitMinRadius": 2.0,

		"orbitLookSensitivity": 0.4,
		"orbitRadiusSensitivity": 0.02,

		"fovAngle": 70.0,
		"nearZ": 0.01,
		"farZ": 1000.0,
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
		"leftButtonPressed": false,
		"middleButtonPressed": false,
		"shiftPressed": false,

		"lastMouseX": 0,
		"lastMouseY": 0
	};

	//Initialize simulation info
	context["simInfo"] = {
		"name": "",
		"frameIndex": 0,
		"frameCount": 0
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

	//Setup reload buttons
	const recompileBtn = document.getElementById("recompile-btn");
	if (recompileBtn !== null) recompileBtn.onclick = function(event) { recompileDevSimulation(context); };

	const reloadBtn = document.getElementById("reload-btn");
	if (reloadBtn !== null) reloadBtn.onclick = function(event) { reloadDevSimulation(context); };

	//Setup buttons
	document.getElementById("stop-btn").onclick = function(event) { stopSimulation(context); };
	document.getElementById("thin-cell-outlines").onchange = function(event) { context["useThinOutlines"] = this.checked; };
	
	//Initialize the renderer
	const uuid = document.getElementById("uuid-field").value;

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
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	context["camera"]["width"] = canvas.clientWidth;
	context["camera"]["height"] = canvas.clientHeight;

	render.resize(gl, context, canvas);
}

function processKeyButon(event, context, isdown) {
	var input = context["input"];

	switch (event.code) {
	case "ShiftLeft":
	case "ShiftRight":
		input["shiftPressed"] = isdown;
		break;
	}
}

function processMouseMove(event, context) {
	var input = context["input"];

	const deltaX = event.offsetX - input["lastMouseX"];
	const deltaY = event.offsetY - input["lastMouseY"];

	input["lastMouseX"] = event.offsetX;
	input["lastMouseY"] = event.offsetY;

	//Move orbit
	if (input["middleButtonPressed"]) {
		var camera = context["camera"];

		if (input["shiftPressed"]) {
			var cameraRotation = camera["rotation"];

			const sensitivity = 0.08;
			
			//Update up direction
			const sensY = sensitivity * deltaY;

			var up = vec3.fromValues(0, 1, 0);
			vec3.transformQuat(up, up, cameraRotation);
			vec3.multiply(up, up, vec3.fromValues(sensY, sensY, sensY));
			
			vec3.add(camera["orbitCenter"], up, camera["orbitCenter"]);

			//Update right direction
			const sensX = -sensitivity * deltaX;

			var right = vec3.fromValues(1, 0, 0);
			vec3.transformQuat(right, right, cameraRotation);
			vec3.multiply(right, right, vec3.fromValues(sensX, sensX, sensX));

			vec3.add(camera["orbitCenter"], right, camera["orbitCenter"]);
		} else {
			const sensitivity = camera["orbitLookSensitivity"];
	
			camera["yaw"] = (camera["yaw"] - sensitivity * deltaX) % 360.0;
			camera["pitch"] = (camera["pitch"] - sensitivity * deltaY) % 360.0;
		}
	}
}

function processMouseButton(event, context, isdown) {
	event.stopPropagation();
	event.preventDefault();

	switch (event.button) {
	case 0:
		if (isdown) doMousePick(context);

		context["input"]["leftButtonPressed"] = isdown;
		break;
	case 1:
		context["input"]["middleButtonPressed"] = isdown;
		break;
	}

	if (isdown) {
		context["canvasElement"].focus();
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

async function main() {
	//Create canvas
	var canvas = document.getElementById("renderTargetCanvas");
	const gl = canvas.getContext("webgl2", {antialias: false});
	
	if (gl === null) {
		alert("Unable to initialize WebGL");
		return;
	}

	canvas.focus();
	
	var context = { "canvasElement": canvas, "gl": gl };
	await initFrame(gl, context);
	resizeCanvas(gl, context, canvas);

	canvas.addEventListener("mousemove", e => processMouseMove(e, context));
	canvas.addEventListener("mousedown", e => processMouseButton(e, context, true));
	canvas.addEventListener("mouseup", e => processMouseButton(e, context, false));
	canvas.addEventListener("keydown", e => processKeyButon(e, context, true));
	canvas.addEventListener("keyup", e => processKeyButon(e, context, false));
	canvas.addEventListener("wheel", e => processMouseWheel(e, context));
	canvas.addEventListener("contextmenu", e => { e.preventDefault() });

	//Initialize render loop
	var lastTime = 0;

	function render(now) {
		//Check if a resize is needed
		if (canvas.width  !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
			resizeCanvas(gl, context, canvas);
		}

		const delta = (now - lastTime) * 0.001;
		lastTime = now;

		drawScene(gl, context, delta);

		window.requestAnimationFrame(render);
	}
	
	window.requestAnimationFrame(render);
}

window.onload = main;