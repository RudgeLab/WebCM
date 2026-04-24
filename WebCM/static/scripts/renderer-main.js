import {
	CELL_SHADER_VERT,
	CELL_SHADER_FRAG,
	DP_COMPOSITE_SHADER_VERT,
	DP_COMPOSITE_SHADER_FRAG,
	GRID_SHADER_VERT,
	GRID_SHADER_FRAG,
	SHAPE_SHADER_VERT,
	SHAPE_SHADER_FRAG,

	BACTERIUM_GLTF,
	SPHERE_GLTF,
	PLANE_GLTF,
} from './renderer-resources.js'

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

class RenderState {
	static Grid = class {
		buffer = 0;
		vao = 0;
		vertexCount = 0;
		gridColor = vec3.create();
	};

	static ColorVolume = class {
		enabled = false;
		texture = 0;
		origin = vec3.create();
		cellCount = vec3.create();
		cellSize = vec3.create();
	};

	static Mesh = class {
		vao = 0;
		bufferHandles = new Array();
		indexCount = 0;
		indexType = 0;
		instanceBuffer = 0;
	};

	static Shader = class {
		program = 0;
		vertex = 0;
		fragment = 0;
		uniforms = 0;
	};

	static Opaque = class {
		colorTexture = 0;
		depthTexture = 0;
		fbo = 0;
	};

	static Transparent = class {
		colorTexture = 0;
		depthTexture0 = 0;
		depthTexture1 = 0;
		fbo = 0;
	};

	static Peel = class {
		colorTexture = 0;
		depthTexture = 0;
		fbo = 0;
	};

	static Camera = class {
		orbitCenter = vec3.fromValues(0, 0, 0);
		orbitRadius = 60.0;
		orbitMinRadius = 2.0;
		orbitRadiusSensitivity = 0.02;

		position = vec3.fromValues(0, 0, 0);
		rotation = quat.fromEuler(quat.create(), 0, 0, 0);

		yaw = 0;
		pitch = -45;

		fovAngle = 60.0;
		nearZ = 0.1;
		farZ = 2000.0;

		projMatrix = mat4.create();
		viewMatrix = mat4.create();
		invProjMatrix = mat4.create();
		invViewMatrix = mat4.create();
	};

	static DepthPeeling = class {
		enabled = true;
		layerCount = 3;
		depthCompareBias = 0.000001;
	};

	static RenderSettings = class {
		depthPeeling = new RenderState.DepthPeeling();
		showOutlines = true;
		flatShading = true;
		signalVolumeEnabled = true;
		signalVolumeDensity = 1.0;
	};

	static FrameRequestHandler = class {
		isRunning = false;
		nextIndex = 0;
	};
	
	canvas = null;
	gl = null;

	onFrameChangedCallback = null;
	onSelectedChangedCallback = null;
	sendVizDataRequestCallback = null;

	currentWidth = 0;
	currentHeight = 0;
	targetWidth = 0;
	targetHeight = 0;
	
	camera = new RenderState.Camera();
	renderSettings = new RenderState.RenderSettings();
	
	cellData = null;
	cellCount = 0;
	selectedCellIndex = -1;
	selectedCellIdentifier = -1;
	previousCellIdentifier = -1;
	currentFrameIndex = -1;
	frameRequestHandler = new RenderState.FrameRequestHandler();

	colorVolume = new RenderState.ColorVolume();
	shapeList = [];

	grid = new RenderState.Grid();
	bacteriumMesh = new RenderState.Mesh();
	sphereMesh = new RenderState.Mesh();
	planeMesh = new RenderState.Mesh();

	cellShader = new RenderState.Shader();
	gridShader = new RenderState.Shader();
	shapeShader = new RenderState.Shader();
	composeShader = new RenderState.Shader();
	composeVolumetricShader = new RenderState.Shader();

	opaque = new RenderState.Opaque();
	transparent = new RenderState.Transparent();
	peel = new RenderState.Peel();
}

async function fetchOrThrow(resource, options=null) {
	const response = options !== null ? (await fetch(resource, options)) : (await fetch(resource));

	if (!response.ok) throw `Reqeuset to ${resource} failed with status ${response.status}`;
	else return response;
}

function prepareShaderSource(source, defines) {
	let finalSource = "#version 300 es\n";

	for (let i = 0; i < defines.length; i++) {
		finalSource = finalSource.concat(`#define ${defines[i]}\n`);
	}

	return finalSource.concat(source);
}

function createShader(gl, vsSource, fsSource, uniforms, defines=[]) {
	const vsFinalSource = prepareShaderSource(vsSource, defines);
	const fsFinalSource = prepareShaderSource(fsSource, defines);

	const vertexShader = gl.createShader(gl.VERTEX_SHADER);
	gl.shaderSource(vertexShader, vsFinalSource);
	gl.compileShader(vertexShader);
	
	const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fragmentShader, fsFinalSource);
	gl.compileShader(fragmentShader);
	
	if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
		const errorMessage = "Vertex shader error: " + gl.getShaderInfoLog(vertexShader);

		console.log(vsFinalSource);
		console.log(errorMessage);

		alert(errorMessage);

		gl.deleteShader(vertexShader);
		
		return null;
	}
	
	if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
		const errorMessage = "Fragment shader error: " + gl.getShaderInfoLog(fragmentShader);

		console.log(fsFinalSource);
		console.log(errorMessage);

		alert(errorMessage);

		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		
		return null;
	}
	
	const shaderProgram = gl.createProgram();
	gl.attachShader(shaderProgram, vertexShader);
	gl.attachShader(shaderProgram, fragmentShader);
	gl.linkProgram(shaderProgram);
	
	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		alert("Shader linking error: " + gl.getProgramInfoLog(shaderProgram));

		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		gl.deleteProgram(shaderProgram);

		return null;
	}
	
	let uniformLocations = {};

	for (const uniform of uniforms) {
		uniformLocations[uniform] = gl.getUniformLocation(shaderProgram, uniform);
	}

	let shader = new RenderState.Shader();
	shader.program = shaderProgram;
	shader.vertex = vertexShader;
	shader.fragment = fragmentShader;
	shader.uniforms = uniformLocations;
	
	return shader;
}

function createTextureAttachment(gl, width, height, internalFormat, format, type) {
	const texture = gl.createTexture();
	
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
	gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);

	gl.bindTexture(gl.TEXTURE_2D, null);

	return texture;
}

async function loadBacteriumModel(gltf, gl) {
	/*
	 The full GLTF spec can be foudn here:
	  https://github.com/KhronosGroup/glTF

	 This is NOT meant to be a proper, spec-compliant GLTF loader.
	 It is only meant to load the specfic model files used by this tool.
	*/

	//Since there is only one mesh in the scene, we only care
	//about the mesh itself, not the scene structure
	const primitives = gltf.meshes[0].primitives[0];

	const positionAccessor = gltf.accessors[primitives.attributes["POSITION"]];
	const normalAccessor = gltf.accessors[primitives.attributes["NORMAL"]];
	const texCoordsAccessor = gltf.accessors[primitives.attributes["TEXCOORD_0"]];
	const indexAccessor = gltf.accessors[primitives.indices];

	console.assert(positionAccessor.type == "VEC3", "Vertex positions must be Vec3");
	console.assert(normalAccessor.type == "VEC3", "Vertex normals must be Vec3");
	console.assert(texCoordsAccessor.type == "VEC2", "Vertex UVs must be Vec2");
	console.assert(indexAccessor.type == "SCALAR", "Mesh indices must be scalars");

	//Load buffers
	let bufferData = new Array(gltf.buffers.length);

	for (let i = 0; i < bufferData.length; ++i) {
		const data = await fetch(gltf.buffers[i].uri);

		bufferData[i] = await data.arrayBuffer();
	}

	//Create buffer views
	let bufferHandles = new Array(gltf.bufferViews.length);

	for (let i = 0; i < gltf.bufferViews.length; ++i) {
		const bufferView = gltf.bufferViews[i];
		const bufferType = indexAccessor.bufferView == i ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
		const dataView = new DataView(bufferData[bufferView.buffer]);

		bufferHandles[i] = gl.createBuffer();

		gl.bindBuffer(bufferType, bufferHandles[i]);
		gl.bufferData(bufferType, dataView, gl.STATIC_DRAW, bufferView.byteOffset, bufferView.byteLength);
		gl.bindBuffer(bufferType, null);
	}

	//Create vertex array
	const componentSizes = {
		5120: 1 /*signed byte*/,
		5121: 1 /*unsigned byte*/,
		5122: 2 /*signed short*/,
		5123: 2 /*unsigned short*/,
		5125: 4 /*unsigned int*/,
		5126: 4 /*float*/
	};

	const componentTypes = {
		5120: gl.BYTE,
		5121: gl.UNSIGNED_BYTE,
		5122: gl.SHORT,
		5123: gl.UNSIGNED_SHORT,
		5125: gl.UNSIGNED_INT ,
		5126: gl.FLOAT
	};

	const componentCounts = {
		"SCALAR": 1,
		"VEC2": 2,
		"VEC3": 3,
		"VEC4": 4,
		"MAT2": 4,
		"MAT3": 9,
		"MAT4": 16
	};

	const createVertexAttribute = (gl, bufferSlot, vertexIndex, accessor) => {
		const bufferView = gltf.bufferViews[accessor.bufferView];
		const componentCount = componentCounts[accessor.type];
		const componentType = componentTypes[accessor.componentType];
		const componentSize = componentSizes[accessor.componentType];

		const elementStride = bufferView.byteStride ? bufferView.byteStride : componentSize * componentCount;

		gl.bindBuffer(bufferSlot, bufferHandles[accessor.bufferView]);
		gl.vertexAttribPointer(vertexIndex, componentCount, componentType, false, elementStride, accessor.byteOffset);
		gl.enableVertexAttribArray(vertexIndex);
	};

	const instanceBuffer = gl.createBuffer();

	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	//Vertex attributes
	createVertexAttribute(gl, gl.ARRAY_BUFFER, 0, positionAccessor);
	createVertexAttribute(gl, gl.ARRAY_BUFFER, 1, normalAccessor);
	createVertexAttribute(gl, gl.ARRAY_BUFFER, 2, texCoordsAccessor);

	//Instance attributes
	const instanceStride = 9 * 4;

	gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
	
	gl.vertexAttribPointer(3, 3, gl.FLOAT, false, instanceStride, 0);
	gl.vertexAttribPointer(4, 3, gl.FLOAT, false, instanceStride, 12);
	gl.vertexAttribPointer(5, 1, gl.FLOAT, false, instanceStride, 24);
	gl.vertexAttribPointer(6, 1, gl.FLOAT, false, instanceStride, 28);
	gl.vertexAttribPointer(7, 4, gl.UNSIGNED_BYTE, true, instanceStride, 32);

	gl.vertexAttribDivisor(3, 1);
	gl.vertexAttribDivisor(4, 1);
	gl.vertexAttribDivisor(5, 1);
	gl.vertexAttribDivisor(6, 1);
	gl.vertexAttribDivisor(7, 1);

	gl.enableVertexAttribArray(3);
	gl.enableVertexAttribArray(4);
	gl.enableVertexAttribArray(5);
	gl.enableVertexAttribArray(6);
	gl.enableVertexAttribArray(7);

	//Indices
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufferHandles[indexAccessor.bufferView]);

	gl.bindVertexArray(null);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);

	//Create the mesh object
	let mesh = new RenderState.Mesh();
	mesh.vao = vao;
	mesh.bufferHandles = bufferHandles;
	mesh.indexCount = indexAccessor.count;
	mesh.indexType = componentTypes[indexAccessor.componentType];
	mesh.instanceBuffer = instanceBuffer;

	return mesh;
}

function generateGrid(gl, state) {
	const gridLineCountX = 201;
	const gridLineCountZ = 201;

	const gridWidth = 2000;
	const gridHeight = 2000;

	const lineSize = 0.2;

	const verticesPerLine = 6;
	const bytesPerVertex = 4 * 2;
	const bytesPerLine = verticesPerLine * bytesPerVertex;
	const gridVertexCount = (gridLineCountX + gridLineCountZ) * verticesPerLine;

	let gridData = new ArrayBuffer(bytesPerVertex * gridVertexCount);
	let gridDataView = new DataView(gridData);

	let writeLineSegment = (baseIndex, xStart, xEnd, zStart, zEnd) => {
		gridDataView.setFloat32(baseIndex + 0, xStart, true);
		gridDataView.setFloat32(baseIndex + 4, zStart, true);

		gridDataView.setFloat32(baseIndex + 8, xEnd, true);
		gridDataView.setFloat32(baseIndex + 12, zStart, true);

		gridDataView.setFloat32(baseIndex + 16, xEnd, true);
		gridDataView.setFloat32(baseIndex + 20, zEnd, true);


		gridDataView.setFloat32(baseIndex + 24, xStart, true);
		gridDataView.setFloat32(baseIndex + 28, zStart, true);

		gridDataView.setFloat32(baseIndex + 32, xStart, true);
		gridDataView.setFloat32(baseIndex + 36, zEnd, true);

		gridDataView.setFloat32(baseIndex + 40, xEnd, true);
		gridDataView.setFloat32(baseIndex + 44, zEnd, true);
	};

	for (let x = 0; x < gridLineCountX; ++x) {
		const xPos = gridWidth * (x / (gridLineCountX - 1.0) - 0.5);
		const xStart = xPos - lineSize * 0.5;
		const xEnd = xPos + lineSize * 0.5;

		const zStart = gridHeight / 2.0;
		const zEnd = -gridHeight / 2.0;

		const baseIndex = bytesPerLine * x;

		writeLineSegment(baseIndex, xStart, xEnd, zStart, zEnd);
	}

	for (let z = 0; z < gridLineCountZ; ++z) {
		const xStart = gridWidth / 2.0;
		const xEnd = -gridWidth / 2.0;
		
		const zPos = gridHeight * (z / (gridLineCountZ - 1.0) - 0.5);
		const zStart = zPos - lineSize * 0.5;
		const zEnd = zPos + lineSize * 0.5;

		const baseIndex = bytesPerLine * (z + gridLineCountX);

		writeLineSegment(baseIndex, xStart, xEnd, zStart, zEnd);
	}

	const gridBuffer = gl.createBuffer();
	const gridVAO = gl.createVertexArray();

	gl.bindVertexArray(gridVAO);

	gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, gridDataView, gl.STATIC_DRAW, 0, gridDataView.byteLength);

	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * 4, 0);
	gl.enableVertexAttribArray(0);

	gl.bindVertexArray(null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);

	state.grid.buffer = gridBuffer;
	state.grid.vao = gridVAO;
	state.grid.vertexCount = gridVertexCount;
	state.grid.color = vec3.fromValues(0.95, 0.95, 0.95);
}

function createColorVolume(gl, state, origin, cellCount, cellSize, volumeData) {
	if (state.colorVolume.texture != 0) {
		gl.deleteTexture(state.colorVolume.texture);
	}

	if (volumeData != null) {
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_3D, texture);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
		gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, cellCount[0], cellCount[1], cellCount[2], 0, gl.RGBA, gl.UNSIGNED_BYTE, volumeData);
		gl.bindTexture(gl.TEXTURE_3D, null);
	
		state.colorVolume.enabled = true;
		state.colorVolume.texture = texture;
		state.colorVolume.origin = vec3.fromValues(origin[0], origin[1], origin[2]);
		state.colorVolume.cellCount = vec3.fromValues(cellCount[0], cellCount[1], cellCount[2]);
		state.colorVolume.cellSize = vec3.fromValues(cellSize[0], cellSize[1], cellSize[2]);
	} else {
		state.colorVolume.enabled = false;
	}
}

function clearFrameData(state) {
	state.colorVolume.enabled = false;
	state.cellCount = 0;
}

function updateFrameData(gl, state, dataBuffer) {
	const dataView = new DataView(dataBuffer);
	const cellCount = dataView.getInt32(0, true);
	
	gl.bindBuffer(gl.ARRAY_BUFFER, state.bacteriumMesh.instanceBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, dataView, gl.DYNAMIC_DRAW, 4, dataBuffer.byteLength - 4);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);

	const baseSignalsOffset = calcCellIdOffset(cellCount, cellCount);
	const hasSignals = dataView.getInt8(baseSignalsOffset);

	if (hasSignals != 0) {
		const boundsOffset = baseSignalsOffset + 1;

		const gridOrigin = vec3.fromValues(
			dataView.getFloat32(boundsOffset + 0, true),
			dataView.getFloat32(boundsOffset + 4, true),
			dataView.getFloat32(boundsOffset + 8, true)
		);

		const gridCellSize = vec3.fromValues(
			dataView.getFloat32(boundsOffset + 12, true),
			dataView.getFloat32(boundsOffset + 16, true),
			dataView.getFloat32(boundsOffset + 20, true)
		);

		const gridCellCount = vec3.fromValues(
			dataView.getInt32(boundsOffset + 24, true),
			dataView.getInt32(boundsOffset + 28, true),
			dataView.getInt32(boundsOffset + 32, true)
		);

		const correctOrigin = vec3.scaleAndAdd(vec3.create(), gridOrigin, gridCellSize, -0.5);

		const colorVolumeOffset = boundsOffset + 36;
		const colorVolumeSize = 4 * (gridCellCount[0] * gridCellCount[1] * gridCellCount[2]);
		const colorVolumeView = new Uint8Array(dataBuffer, colorVolumeOffset, colorVolumeSize);

		createColorVolume(gl, state, correctOrigin, gridCellCount, gridCellSize, colorVolumeView);
	} else {
		state.colorVolume.enabled = false;
	}

	state.cellData = dataBuffer;
	state.cellCount = cellCount;
}

/*
  Viz frame format (there are listed in the order they come in in the format):
    1. Array of per-instance attributes (pos, dir, length, radius, color)
	2. Array of cell IDs
	3. 'Has signal grid?' flag
	4. If flag true, signal grid metadata (origin, grid cell size, grid cell count)
	5. If flag true, 3D array of grid cell colors
*/

function calcCellVertexOffset(index) {
	return 4 + 36 * index;
}

function calcCellIdOffset(index, cellCount) {
	return calcCellVertexOffset(cellCount) + 8 * index;
}

function lookupCellIdentifier(data, index, cellCount) {
	const baseOffset = calcCellIdOffset(index, cellCount);
	const dataView = new DataView(data);

	return dataView.getBigUint64(baseOffset, true);
}

async function initRenderer(gl, state) {
	//Load shaders
	state.cellShader = createShader(gl, CELL_SHADER_VERT, CELL_SHADER_FRAG, [
		"u_ProjectionMatrix", "u_ViewMatrix", "u_InvViewMatrix", "u_SelectedIndex", "u_ShowOutline", "u_FlatShading"
	]);

	state.gridShader = createShader(gl, GRID_SHADER_VERT, GRID_SHADER_FRAG, [
		"u_ProjectionMatrix", "u_ViewMatrix", "u_Color"
	]);

	state.shapeShader = createShader(gl, SHAPE_SHADER_VERT, SHAPE_SHADER_FRAG, [
		"u_ProjectionMatrix", "u_ViewMatrix", "u_ModelMatrix",
		"u_Color", "u_ClosestDepth", "u_TreatAsOpaque", "u_DepthCompareBias"
	]);

	state.composeShader = createShader(gl, DP_COMPOSITE_SHADER_VERT, DP_COMPOSITE_SHADER_FRAG, [
		"u_Texture", "u_FixAlphaToOne"
	]);

	state.composeVolumetricShader = createShader(gl, DP_COMPOSITE_SHADER_VERT, DP_COMPOSITE_SHADER_FRAG, [
		"u_ProjectionMatrix", "u_ViewMatrix", 
		"u_ColorTexture", "u_FurtherDepth", "u_CloserDepth", "u_DepthCompareBias",
		"u_VolumeOrigin", "u_VolumeCellSize", "u_VolumeCellCount", "u_VolumeTexture", "u_VolumeOpacityMultiplier",
		"u_ScreenSize"
	], [ "COMPOSE_WITH_VOLUMETRICS" ]);

	//Load GLFW models
	state.bacteriumMesh = await loadBacteriumModel(JSON.parse(BACTERIUM_GLTF), gl);
	state.sphereMesh = await loadBacteriumModel(JSON.parse(SPHERE_GLTF), gl);
	state.planeMesh = await loadBacteriumModel(JSON.parse(PLANE_GLTF), gl);

	//Generate grid
	generateGrid(gl, state);

	//Create color volume
	createColorVolume(gl, state, [ -30, -30, -30 ], [ 10, 10, 10 ], [ 6, 6, 6 ], null);

	//Create the framebuffers
	recreateAllFBOs(gl, state);
	
	//Init camera matrices
	state.camera.rotation = quat.fromEuler(quat.create(), state.camera.pitch, state.camera.yaw, 0);

	updateCameraView(state);
	updateProjMatrix(state);
}

function updateProjMatrix(state) {
	const camera = state.camera;
	const aspectRatio = state.targetWidth / state.targetHeight;

	camera.projMatrix = mat4.perspective(mat4.create(), glMatrix.toRadian(camera.fovAngle), aspectRatio, camera.nearZ, camera.farZ);
	camera.invProjMatrix = mat4.invert(mat4.create(), camera.projMatrix);
}

function updateCameraView(state) {
	const camera = state.camera;

	//Update the camera position
	const orbitCenter = camera.orbitCenter;
	const orbitRadius = camera.orbitRadius;
	const orientVector = vec3.transformQuat(vec3.create(), vec3.fromValues(0, 0, -1), camera.rotation);

	camera.position = vec3.scaleAndAdd(vec3.create(), orbitCenter, orientVector, -orbitRadius);

	//Update the view matrix
	const viewMatrix = mat4.create();
	mat4.transpose(viewMatrix, mat4.fromQuat(mat4.create(), camera.rotation));
	mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), camera.position));

	camera.viewMatrix = viewMatrix;
	camera.invViewMatrix = mat4.invert(mat4.create(), camera.viewMatrix);
}

function recreateAllFBOs(gl, state) {
	recreateOpaqueFBO(gl, state);
	recreateTransparentFBO(gl, state);
	recreatePeelFBO(gl, state);
}

function recreateOpaqueFBO(gl, state) {
	if (state.opaque.colorTexture != 0) gl.deleteTexture(state.opaque.colorTexture);
	if (state.opaque.depthTexture != 0) gl.deleteTexture(state.opaque.depthTexture);
	if (state.opaque.fbo != 0) gl.deleteFramebuffer(state.opaque.fbo);
	
	const width = gl.canvas.width;
	const height = gl.canvas.height;

	const colorTexture = createTextureAttachment(gl, width, height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
	const depthTexture = createTextureAttachment(gl, width, height, gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT);

	const renderTargetFBO = gl.createFramebuffer();

	gl.bindFramebuffer(gl.FRAMEBUFFER, renderTargetFBO);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);

	gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
	
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	state.opaque.colorTexture = colorTexture;
	state.opaque.depthTexture = depthTexture;
	state.opaque.fbo = renderTargetFBO;
}

function recreateTransparentFBO(gl, state) {
	if (state.transparent.colorTexture  != 0) gl.deleteTexture(state.transparent.colorTexture);
	if (state.transparent.depthTexture0 != 0) gl.deleteTexture(state.transparent.depthTexture0);
	if (state.transparent.depthTexture1 != 0) gl.deleteTexture(state.transparent.depthTexture1);
	if (state.transparent.fbo != 0) gl.deleteFramebuffer(state.transparent.fbo);

	const width = gl.canvas.width;
	const height = gl.canvas.height;

	const colorTexture = createTextureAttachment(gl, width, height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
	const depthTexture0 = createTextureAttachment(gl, width, height, gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT);
	const depthTexture1 = createTextureAttachment(gl, width, height, gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT);

	const framebuffer = gl.createFramebuffer();

	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture0, 0);
	
	gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
	
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	
	state.transparent.colorTexture = colorTexture;
	state.transparent.depthTexture0 = depthTexture0;
	state.transparent.depthTexture1 = depthTexture1;
	state.transparent.fbo = framebuffer;
}

function recreatePeelFBO(gl, state) {
	if (state.peel.colorTexture != 0) gl.deleteTexture(state.peel.colorTexture);
	if (state.peel.depthTexture != 0) gl.deleteTexture(state.peel.depthTexture);
	if (state.peel.fbo != 0) gl.deleteFramebuffer(state.peel.fbo);

	const width = gl.canvas.width;
	const height = gl.canvas.height;

	const colorTexture = createTextureAttachment(gl, width, height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
	const depthTexture = createTextureAttachment(gl, width, height, gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT);

	const framebuffer = gl.createFramebuffer();

	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
	
	gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
	
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	
	state.peel.colorTexture = colorTexture;
	state.peel.depthTexture = depthTexture;
	state.peel.fbo = framebuffer;
}

function blitFBO(gl, read, draw, width, height, clearFlags, filter=gl.NEAREST) {
	gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
	gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);

	gl.blitFramebuffer(0, 0, width, height,
					   0, 0, width, height,
					   clearFlags, filter);
}

function drawScene(gl, state) {
	const camera = state.camera;
	const projMatrix = camera.projMatrix;
	const viewMatrix = camera.viewMatrix;
	const invViewMatrix = camera.invViewMatrix;

	//Draw grid
	const gridShader = state.gridShader;
	const gridMesh = state.grid;

	gl.disable(gl.CULL_FACE);

	gl.useProgram(gridShader.program);
	gl.uniformMatrix4fv(gridShader.uniforms["u_ProjectionMatrix"], false, projMatrix);
	gl.uniformMatrix4fv(gridShader.uniforms["u_ViewMatrix"], false, viewMatrix);
	gl.uniform3f(gridShader.uniforms["u_Color"], gridMesh.color[0], gridMesh.color[1], gridMesh.color[2]);

	gl.bindVertexArray(gridMesh.vao);
	gl.drawArrays(gl.TRIANGLES, 0, gridMesh.vertexCount);
	gl.bindVertexArray(null);

	gl.enable(gl.CULL_FACE);

	//Draw cells
	const cellShader = state.cellShader;
	const bacteriumMesh = state.bacteriumMesh;
	const showOutline = state.renderSettings.showOutlines ? 1 : 0;
	const flatShading = state.renderSettings.flatShading ? 1 : 0;

	gl.useProgram(cellShader.program);
	gl.uniformMatrix4fv(cellShader.uniforms["u_ProjectionMatrix"], false, projMatrix);
	gl.uniformMatrix4fv(cellShader.uniforms["u_ViewMatrix"], false, viewMatrix);
	gl.uniformMatrix4fv(cellShader.uniforms["u_InvViewMatrix"], false, invViewMatrix);
	
	gl.uniform1i(cellShader.uniforms["u_SelectedIndex"], state.selectedCellIndex);
	gl.uniform1i(cellShader.uniforms["u_ShowOutline"], showOutline);
	gl.uniform1i(cellShader.uniforms["u_FlatShading"], flatShading);

	gl.bindVertexArray(bacteriumMesh.vao);
	gl.drawElementsInstanced(gl.TRIANGLES, bacteriumMesh.indexCount, bacteriumMesh.indexType, 0, state.cellCount);
	gl.bindVertexArray(null);
}

function drawShapes(gl, state, shader) {
	const sphereMesh = state.sphereMesh;
	const shapeList = state.shapeList;

	for (let i = 0; i < shapeList.length; i++) {
		const shape = shapeList[i];
		const isSphere = shape.type == "sphere";

		let shapeColor = vec4.fromValues(0.8, 0.8, 0.8, 0.8);
		let shapePos = vec3.fromValues(0, 0, 0);
		let shapeRot = quat.create();
		let shapeScale = vec3.fromValues(1, 1, 1);
	
		if (isSphere) {
			const pos = shape.pos;
			const radius = shape.radius;
			const color = shape.color;

			shapePos = vec3.fromValues(pos[0], pos[1], pos[2]);
			shapeScale = vec3.fromValues(radius, radius, radius);
			if (color) shapeColor = vec4.fromValues(color[0], color[1], color[2], color[3]);
		}

		const shapeModelMatrix = mat4.fromRotationTranslationScale(mat4.create(), shapeRot, shapePos, shapeScale);
	
		gl.uniformMatrix4fv(shader.uniforms["u_ModelMatrix"], false, shapeModelMatrix);
		gl.uniform4f(shader.uniforms["u_Color"], shapeColor[0], shapeColor[1], shapeColor[2], shapeColor[3]);
	
		if (isSphere) {
			gl.bindVertexArray(sphereMesh.vao);
			gl.drawElements(gl.TRIANGLES, sphereMesh.indexCount, sphereMesh.indexType, 0);
			gl.bindVertexArray(null);
		}
	}
}

function drawFullscreenQuad(gl, state, ignoreDepth=true, blending=true) {
	const planeMesh = state.planeMesh;

	if (blending) gl.enable(gl.BLEND);
	if (ignoreDepth) gl.disable(gl.DEPTH_TEST);

	gl.disable(gl.CULL_FACE);

	gl.bindVertexArray(planeMesh.vao);
	gl.drawElements(gl.TRIANGLES, planeMesh.indexCount, planeMesh.indexType, 0);
	gl.bindVertexArray(null);

	gl.enable(gl.CULL_FACE);

	if (ignoreDepth) gl.enable(gl.DEPTH_TEST);
	if (blending) gl.disable(gl.BLEND);
}

function drawFrame(gl, state) {
	const viewWidth = gl.canvas.width;
	const viewHeight = gl.canvas.height;

	const transparentFBO = state.transparent.fbo;
	const opaqueFBO = state.opaque.fbo;
	const peelFBO = state.peel.fbo;
	
	const shapeShader = state.shapeShader;
	const composeShader = state.composeShader;
	const composeVolumeShader = state.composeVolumetricShader;
	const depthPeelingSettings = state.renderSettings.depthPeeling;

	const signalsVolumeEnabled = state.renderSettings.signalVolumeEnabled;

	const hasDepthPeeling = depthPeelingSettings.enabled && state.shapeList.length > 0;
	const layerCount = hasDepthPeeling ? Math.max(1, depthPeelingSettings.layerCount) : 1;
	const volumeDensityMultiplier = Math.max(0, 0.18 * state.renderSettings.signalVolumeDensity);
	
	const camera = state.camera;
	const projMatrix = camera.projMatrix;
	const viewMatrix = camera.viewMatrix;

	//Setup scene
	gl.enable(gl.DEPTH_TEST);
	gl.enable(gl.CULL_FACE);
	gl.cullFace(gl.BACK);

	/////////////////////////////////////////////////
	// Render opaque objects
	/////////////////////////////////////////////////
	gl.bindFramebuffer(gl.FRAMEBUFFER, opaqueFBO);

	gl.viewport(0, 0, viewWidth, viewHeight);

	gl.clearDepth(1.0);
	gl.clearColor(0.7, 0.7, 0.7, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	drawScene(gl, state);
	
	/////////////////////////////////////////////////
	// Render transparent objects
	/////////////////////////////////////////////////
	gl.bindFramebuffer(gl.FRAMEBUFFER, transparentFBO);

	gl.viewport(0, 0, viewWidth, viewHeight);

	//The color buffer needs to be cleared with an alhpa of ONE in order for
	//the alpha blending to work properly
	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clearDepth(0.0);

	gl.clear(gl.COLOR_BUFFER_BIT);

	//Clear depth texture 0
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, state.transparent.depthTexture0, 0);
	gl.clear(gl.DEPTH_BUFFER_BIT);

	//Clear depth texture 1
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, state.transparent.depthTexture1, 0);
	gl.clear(gl.DEPTH_BUFFER_BIT);

	gl.clearDepth(1.0);

	//These are the parameters for "under" blending (requires pre-multiplied alpha).
	gl.blendEquation(gl.FUNC_ADD);
	gl.blendFuncSeparate(gl.DST_ALPHA, gl.ONE, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);

	/* Draw depth layers */
	gl.useProgram(shapeShader.program);
	gl.uniformMatrix4fv(shapeShader.uniforms["u_ProjectionMatrix"], false, projMatrix);
	gl.uniformMatrix4fv(shapeShader.uniforms["u_ViewMatrix"], false, viewMatrix);
	gl.uniform1f(shapeShader.uniforms["u_DepthCompareBias"], depthPeelingSettings["depthCompareBias"]);

	for (let i = 0; i < layerCount; i++) {
		const currentTransparentDepth = (i & 1) ? state.transparent.depthTexture1 : state.transparent.depthTexture0;
		const previousTransparentDepth = (i & 1) ? state.transparent.depthTexture0 : state.transparent.depthTexture1;

		gl.useProgram(shapeShader.program);
		gl.uniform1i(shapeShader.uniforms["u_TreatAsOpaque"], i == (layerCount - 1));

		//Bind the 'closest depth' texture
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, previousTransparentDepth);
		gl.uniform1i(shapeShader.uniforms["u_ClosestDepth"], 1);

		//Copy the depth from the opaque layer to the "peel" FBO. This is done so that
		//transparent objects that are further than opaque ones don't get rendered
		blitFBO(gl, opaqueFBO, peelFBO, viewWidth, viewHeight, gl.DEPTH_BUFFER_BIT);
		
		/* Draw transparent objects */
		gl.bindFramebuffer(gl.FRAMEBUFFER, peelFBO);

		gl.clearColor(1.0, 1.0, 0.0, 0.0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		drawShapes(gl, state, shapeShader);

		/* Composite current layer under the rest */
		gl.bindFramebuffer(gl.FRAMEBUFFER, transparentFBO);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, currentTransparentDepth, 0);

		if (state.colorVolume.enabled && signalsVolumeEnabled) {
			const shaderUniforms = composeVolumeShader.uniforms;

			const volOrigin = state.colorVolume.origin;
			const volCellCount = state.colorVolume.cellCount;
			const volCellSize = state.colorVolume.cellSize;
			const volTexture = state.colorVolume.texture;

			gl.useProgram(composeVolumeShader.program);

			gl.uniformMatrix4fv(shaderUniforms["u_ProjectionMatrix"], false, projMatrix);
			gl.uniformMatrix4fv(shaderUniforms["u_ViewMatrix"], false, viewMatrix);
			gl.uniform2i(shaderUniforms["u_ScreenSize"], viewWidth, viewHeight);
			gl.uniform1f(shaderUniforms["u_DepthCompareBias"], depthPeelingSettings["depthCompareBias"]);

			gl.uniform3f(shaderUniforms["u_VolumeOrigin"], volOrigin[0], volOrigin[1], volOrigin[2]);
			gl.uniform3f(shaderUniforms["u_VolumeCellSize"], volCellSize[0], volCellSize[1], volCellSize[2]);
			gl.uniform3i(shaderUniforms["u_VolumeCellCount"], volCellCount[0], volCellCount[1], volCellCount[2]);
			gl.uniform1f(shaderUniforms["u_VolumeOpacityMultiplier"], volumeDensityMultiplier);

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, state.peel.colorTexture);
			gl.uniform1i(shaderUniforms["u_ColorTexture"], 0);

			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, state.peel.depthTexture);
			gl.uniform1i(shaderUniforms["u_FurtherDepth"], 1);

			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, previousTransparentDepth);
			gl.uniform1i(shaderUniforms["u_CloserDepth"], 2);
			
			gl.activeTexture(gl.TEXTURE3);
			gl.bindTexture(gl.TEXTURE_3D, volTexture);
			gl.uniform1i(shaderUniforms["u_VolumeTexture"], 3);
		} else {
			gl.useProgram(composeShader["program"]);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, state.peel.colorTexture);
			gl.uniform1i(composeShader["uniforms"]["u_Texture"], 0);
			gl.uniform1i(composeShader["uniforms"]["u_FixAlphaToOne"], 0);
		}

		drawFullscreenQuad(gl, state);

		//Copy the depth from the "peel" FBO to the "transparent" FBO.
		blitFBO(gl, peelFBO, transparentFBO, viewWidth, viewHeight, gl.DEPTH_BUFFER_BIT);

		//We don't HAVE to unbind the texture, but the WebGL debug layers gets confused and thinks we are 
		//reading from the texture while also drawing to it and prints a warning message.
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	//Because oqaue FBO is multisampled, we need to resolve it first before sampling it in the final
	//composite. Peel FBO is the only FBO that won't be used later, so we can use that
	blitFBO(gl, opaqueFBO, peelFBO, viewWidth, viewHeight, gl.COLOR_BUFFER_BIT, gl.LINEAR);
	
	/* Composite the opaque layer under the transparent layer */
	gl.bindFramebuffer(gl.FRAMEBUFFER, transparentFBO);
	
	gl.useProgram(composeShader["program"]);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, state.peel.colorTexture);
	gl.uniform1i(composeShader["uniforms"]["u_Texture"], 0);
	gl.uniform1i(composeShader["uniforms"]["u_FixAlphaToOne"], 0);

	drawFullscreenQuad(gl, state);

	/////////////////////////////////////////////////
	// Copy the final result to the screen
	/////////////////////////////////////////////////
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.clearDepth(1.0);
	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	
	gl.useProgram(composeShader["program"]);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, state.transparent.colorTexture);
	gl.uniform1i(composeShader["uniforms"]["u_Texture"], 0);
	gl.uniform1i(composeShader["uniforms"]["u_FixAlphaToOne"], 1);

	//We don't want to do any blending on the shader's side because we are just
	//"copying" the image to the screen, not compositing it
	drawFullscreenQuad(gl, state, true, false);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function initAll(canvas, state) {
	canvas.focus();

	//Create WebGL context
	let gl = canvas.getContext("webgl2", { antialias: false });
	if (gl === null) throw new Error("Unable to initialize WebGL");

	state.canvas = canvas;
	state.gl = gl;
	state.currentWidth = canvas.clientWidth;
	state.currentHeight = canvas.clientHeight;
	state.targetWidth = canvas.clientWidth;
	state.targetHeight = canvas.clientHeight;

	state.canvas.width = state.currentWidth;
	state.canvas.height = state.currentHeight;

	//Attach resize behavior
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

		state.targetWidth = Math.round(width * dpr);
		state.targetHeight = Math.round(height * dpr);

		updateProjMatrix(state);
	}

	const resizeObserver = new ResizeObserver(onCanvasResize);

	try {
		resizeObserver.observe(canvas, {box: "device-pixel-content-box"});
	} catch (ex) {
		resizeObserver.observe(canvas, {box: "content-box"});
	}

	//Attach input handlers
	canvas.addEventListener("mousemove", e => processMouseMove(e, state));
	canvas.addEventListener("mousedown", e => processMouseButton(e, state, true));
	canvas.addEventListener("mouseup", e => processMouseButton(e, state, false));
	canvas.addEventListener("keydown", e => processKeyButton(e, state, true));
	canvas.addEventListener("keyup", e => processKeyButton(e, state, false));
	canvas.addEventListener("wheel", e => processMouseWheel(e, state));
	canvas.addEventListener("contextmenu", e => { e.preventDefault() });

	//Initialize the renderer
	await initRenderer(gl, state);

	//Initialize render loop
	function renderFrame(now) {
		//Check if a resize is needed
		if (state.currentWidth !== state.targetWidth ||
			state.currentHeight !== state.targetHeight)
		{
			state.currentWidth = state.targetWidth;
			state.currentHeight = state.targetHeight;

			state.canvas.width = state.currentWidth;
			state.canvas.height = state.currentHeight;
			
			recreateAllFBOs(gl, state);
		}

		//Update frame
		drawFrame(gl, state);

		window.requestAnimationFrame(renderFrame);
	}
	
	window.requestAnimationFrame(renderFrame);
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
async function requestFrame(state, index) {
	let handler = state.frameRequestHandler;

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
			let currentResponse = await state.sendVizDataRequestCallback(index);
	
			while (true) {
				if (handler.nextIndex != null) {
					//Take the next index and reset it
					let reqIndex = handler.nextIndex;
					handler.nextIndex = null;
	
					//We use 'Promise.allSettled' here instead of 'Promise.all' because 'allSettled' waits for all promises
					//to finish even if one of them rejects (i.e. fails)
					let responses = await Promise.allSettled([
						state.sendVizDataRequestCallback(reqIndex),
						onFrameReceived(state, currentIndex, currentResponse),
					]);
	
					currentIndex = reqIndex;
					currentResponse = responses[0].status == "fulfilled" ? responses[0].value : null;
				} else {
					if (currentResponse != null)
						await onFrameReceived(state, currentIndex, currentResponse);
	
					if (handler.nextIndex == null)
						break;
				}
			}
		} finally {
			handler.isRunning = false;

			//Under normal conditions, this shouldn't be needed. However, if one of the requests in the try...catch throws an exception,
			//its possible that we will exit the loop before the next index is handled.
			if (handler.nextIndex != null)
				return requestFrame(state, handler.nextIndex);
		}
	}
}

async function onFrameReceived(state, index, frameBuffer) {
	state.currentFrameIndex = index;

	//Update the user interface
	updateFrameData(state.gl, state, frameBuffer)

	//Update the cell index based on the identifier
	const cellCount = state.cellCount;
	const cellIdent = state.selectedCellIdentifier >= 0 ? state.selectedCellIdentifier : state.previousCellIdentifier;

	if (cellIdent >= 0) {
		state.selectedCellIndex = -1;
		state.selectedCellIdentifier = -1;

		for (let i = 0; i < cellCount; i++) {
			let thisId = lookupCellIdentifier(frameBuffer, i, cellCount);

			if (thisId === cellIdent) {
				state.selectedCellIndex = i;
				state.selectedCellIdentifier = thisId;
				break;
			}
		}
	}

	await state.onFrameChangedCallback();
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

function doMousePick(state, mouseX, mouseY, viewportWidth, viewportHeight) {
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

	const camera = state.camera;
	const cameraPos = camera.position;
	const cameraRay = computeCameraRay(mouseX, mouseY, viewportWidth, viewportHeight, camera.invProjMatrix, camera.invViewMatrix);

	const dataBuffer = state.cellData;
	if (!dataBuffer) return;

	const cellCount = state.cellCount;
	const dataView = new DataView(dataBuffer);

	let minIndex = -1;
	let minDist = Number.MAX_VALUE;

	for (let i = 0; i < cellCount; i++) {
		const baseOffset = calcCellVertexOffset(i);

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

	state.selectedCellIndex = minIndex;
	state.selectedCellIdentifier = minIndex !== -1 ? lookupCellIdentifier(dataBuffer, minIndex, cellCount) : -1;
	state.previousCellIdentifier = state.selectedCellIdentifier;

	state.onSelectedChangedCallback()
}

function processKeyButton(event, state, isdown) {
	//Do nothing
}

function processMouseMove(event, state) {
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
	
	const viewportWidth = state.targetWidth;
	const viewportHeight = state.targetHeight;

	const mouseXScale = viewportWidth / state.canvas.clientWidth;
	const mouseYScale = viewportHeight / state.canvas.clientHeight;

	const lastX = (event.offsetX - event.movementX) * mouseXScale;
	const lastY = (event.offsetY - event.movementY) * mouseYScale;

	const nextX = event.offsetX * mouseXScale;
	const nextY = event.offsetY * mouseYScale;

	//Move orbit
	const planeNormal = vec3.fromValues(0, 1, 0);

	const camera = state.camera;
	const cameraPos = camera.position;
	
	if (panButtonPressed) {
		const cameraRayLast = computeCameraRay(lastX, lastY, viewportWidth, viewportHeight, camera.invProjMatrix, camera.invViewMatrix);
		const cameraRayNext = computeCameraRay(nextX, nextY, viewportWidth, viewportHeight, camera.invProjMatrix, camera.invViewMatrix);

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

		camera.orbitCenter = vec3.add(vec3.create(), camera.orbitCenter, orbitPosOffset);

		updateCameraView(state);
	} else if (orbitButtonPressed) {
		const sensitivity = 0.2;

		camera.yaw = (camera.yaw - sensitivity * event.movementX) % 360.0;
		camera.pitch = (camera.pitch - sensitivity * event.movementY) % 360.0;

		camera.rotation = quat.fromEuler(quat.create(), camera.pitch, camera.yaw, 0);

		updateCameraView(state);
	}
}

function processMouseButton(event, state, isdown) {
	event.stopPropagation();
	event.preventDefault();

	if (event.button == 0 && isdown && event.shiftKey) {
		const viewportWidth = state.targetWidth;
		const viewportHeight = state.targetHeight;

		const mouseX = event.offsetX * (viewportWidth / state.canvas.clientWidth);
		const mouseY = event.offsetY * (viewportHeight / state.canvas.clientHeight);

		doMousePick(state, mouseX, mouseY, viewportWidth, viewportHeight);
	}

	if (isdown) {
		state.canvas.focus();
	}
}

function processMouseWheel(event, state) {
	event.stopPropagation();
	event.preventDefault();

	let radius = state.camera.orbitRadius;
	radius += state.camera.orbitRadiusSensitivity * event.deltaY;
	radius = Math.max(radius, state.camera.orbitMinRadius);

	state.camera.orbitRadius = radius;

	updateCameraView(state);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export class ViewerRenderer {
	state = new RenderState();

	constructor() {}

	async start(canvas,
		onFrameChangedCallback,
		onSelectedChangedCallback,
		sendVizDataRequestCallback
	) {
		this.state.onFrameChangedCallback = onFrameChangedCallback;
		this.state.onSelectedChangedCallback = onSelectedChangedCallback;
		this.state.sendVizDataRequestCallback = sendVizDataRequestCallback;

		await initAll(canvas, this.state);
	}

	async requestFrameAndDisplay(index) {
		await requestFrame(this.state, index)
	}

	clearFrame() {
		clearFrameData(this.state)
	}

	updateShapeList(shapes) {
		this.state.shapeList = spaces;
	}

	updateCamera() {
		updateCameraView(this.state);
		updateProjMatrix(this.state);
	}
}