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
	
	var uniformLocations = {};

	for (const uniform of uniforms) {
		uniformLocations[uniform] = gl.getUniformLocation(shaderProgram, uniform);
	}

	var shader = {
		program: shaderProgram,
		vertex: vertexShader,
		fragment: fragmentShader,
		uniforms: uniformLocations
	};
	
	return shader;
}

async function loadBacteriumModel(gltf, gl, context) {
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
	var bufferData = new Array(gltf.buffers.length);

	for (var i = 0; i < bufferData.length; ++i) {
		const data = await fetch(gltf.buffers[i].uri);

		bufferData[i] = await data.arrayBuffer();
	}

	//Create buffer views
	var bufferHandles = new Array(gltf.bufferViews.length);

	for (var i = 0; i < gltf.bufferViews.length; ++i) {
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
	const mesh = {
		"vao": vao,
		"bufferHandles": bufferHandles,
		"indexCount": indexAccessor.count,
		"indexType": componentTypes[indexAccessor.componentType],
		"instanceBuffer": instanceBuffer
	};

	return mesh;
}

function generateGrid(gl, context) {
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

	for (var x = 0; x < gridLineCountX; ++x) {
		const xPos = gridWidth * (x / (gridLineCountX - 1.0) - 0.5);
		const xStart = xPos - lineSize * 0.5;
		const xEnd = xPos + lineSize * 0.5;

		const zStart = gridHeight / 2.0;
		const zEnd = -gridHeight / 2.0;

		const baseIndex = bytesPerLine * x;

		writeLineSegment(baseIndex, xStart, xEnd, zStart, zEnd);
	}

	for (var z = 0; z < gridLineCountZ; ++z) {
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

	context["grid"] = {
		"buffer": gridBuffer,
		"vao": gridVAO,
		"vertexCount": gridVertexCount,
		"color": vec3.fromValues(0.95, 0.95, 0.95)
	};
}

export function pushFrameData(gl, context, dataBuffer) {
	const dataView = new DataView(dataBuffer);
	const cellCount = dataView.getInt32(0, true);

	context["cellData"] = dataBuffer;
	context["cellCount"] = cellCount;
	
	gl.bindBuffer(gl.ARRAY_BUFFER, context["bacteriumMesh"]["instanceBuffer"]);
	gl.bufferData(gl.ARRAY_BUFFER, dataView, gl.DYNAMIC_DRAW, 4, dataBuffer.byteLength - 4);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);

	const baseSignalsOffset = calcCellIdOffset(context, cellCount);
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

		createColorVolume(gl, context, correctOrigin, gridCellCount, gridCellSize, colorVolumeView);
	}

	return [ cellCount ];
}

export function calcCellVertexOffset(context, index) {
	return 4 + 36 * index;
}

export function calcCellIdOffset(context, index) {
	return calcCellVertexOffset(context, context["cellCount"]) + 8 * index;
}

export function lookupCellIdentifier(context, index) {
	const baseOffset = calcCellIdOffset(context, index);
	const dataView = new DataView(context["cellData"]);

	return dataView.getBigUint64(baseOffset, true);
}

async function fetchOrThrow(resource, options=null) {
	const response = options !== null ? (await fetch(resource, options)) : (await fetch(resource));

	if (!response.ok) throw `Reqeuset to ${resource} failed with status ${response.status}`;
	else return response
}

function createColorVolume(gl, context, origin, cellCount, cellSize, volumeData) {
	if (context["colorVolume"] != null) {
		gl.deleteTexture(context["colorVolume"]["texture"]);
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
	
		context["colorVolume"] = {
			"enabled": true,
			"texture": texture,
	
			"origin": vec3.fromValues(origin[0], origin[1], origin[2]),
			"cellCount": vec3.fromValues(cellCount[0], cellCount[1], cellCount[2]),
			"cellSize": vec3.fromValues(cellSize[0], cellSize[1], cellSize[2]),
		};
	} else {
		if (context["colorVolume"] == null) context["colorVolume"] = {};

		context["colorVolume"]["enabled"] = false;
	}
}

export async function init(gl, context) {
	//Load cell shader
	const fetchCellShader = async () => {
		const cellVertexData = await fetchOrThrow("/static/shaders/cell_shader.vert");
		const cellVertexSource = await cellVertexData.text();
	
		const cellFragmentData = await fetchOrThrow("/static/shaders/cell_shader.frag");
		const cellFragmentSource = await cellFragmentData.text();
	
		context["cellShader"] = createShader(gl, cellVertexSource, cellFragmentSource, [
			"u_ProjectionMatrix", "u_ViewMatrix", "u_SelectedIndex", "u_ThinOutlines"
		]);
	};

	//Load grid shader
	const fetchGridShader = async () => {
		const gridVertexData = await fetchOrThrow("/static/shaders/grid_shader.vert");
		const gridVertexSource = await gridVertexData.text();

		const gridFragmentData = await fetchOrThrow("/static/shaders/grid_shader.frag");
		const gridFragmentSource = await gridFragmentData.text();

		context["gridShader"] = createShader(gl, gridVertexSource, gridFragmentSource, [
			"u_ProjectionMatrix", "u_ViewMatrix", "u_Color"
		]);
	};
	
	//Load shape shader
	const fetchShapeShader = async () => {
		const shapeVertexData = await fetchOrThrow("/static/shaders/shape_shader.vert");
		const shapeVertexSource = await shapeVertexData.text();

		const shapeFragmentData = await fetchOrThrow("/static/shaders/shape_shader.frag");
		const shapeFragmentSource = await shapeFragmentData.text();

		context["shapeShader"] = createShader(gl, shapeVertexSource, shapeFragmentSource, [
			"u_ProjectionMatrix", "u_ViewMatrix", "u_ModelMatrix",
			"u_Color", "u_ClosestDepth", "u_TreatAsOpaque", "u_DepthCompareBias"
		]);
	};

	//Load compose shader
	const fetchComposeShader = async () => {
		const composeVertexData = await fetchOrThrow("/static/shaders/dp_composite_shader.vert");
		const composeVertexSource = await composeVertexData.text();
	
		const composeFragmentData = await fetchOrThrow("/static/shaders/dp_composite_shader.frag");
		const composeFragmentSource = await composeFragmentData.text();
	
		context["composeShader"] = createShader(gl, composeVertexSource, composeFragmentSource, [
			"u_Texture"
		]);

		context["composeVolumetricShader"] = createShader(gl, composeVertexSource, composeFragmentSource, [
			"u_ProjectionMatrix", "u_ViewMatrix", 
			"u_ColorTexture", "u_FurtherDepth", "u_CloserDepth", "u_DepthCompareBias",
			"u_VolumeOrigin", "u_VolumeCellSize", "u_VolumeCellCount", "u_VolumeTexture",
			"u_ScreenSize"
		], [ "COMPOSE_WITH_VOLUMETRICS" ]);
	};

	//Load the bacterium
	const fetchBacteriumModel = async () => {
		const bacteriumData = await fetchOrThrow("/static/bacterium.gltf");
		const bacteriumGLTF = await bacteriumData.json();
		const bacteriumModel = await loadBacteriumModel(bacteriumGLTF, gl, context);
	
		context["bacteriumMesh"] = bacteriumModel;
	};

	//Load the sphere
	const fetchSphereModel = async () => {
		const sphereData = await fetchOrThrow("/static/sphere.gltf");
		const sphereGLTF = await sphereData.json();
		const sphereModel = await loadBacteriumModel(sphereGLTF, gl, context);

		context["sphereMesh"] = sphereModel;
	};

	//Load the plane
	const fetchPlaneModel = async () => {
		const planeData = await fetchOrThrow("/static/plane.gltf");
		const planeGLTF = await planeData.json();
		const planeModel = await loadBacteriumModel(planeGLTF, gl, context);

		context["planeMesh"] = planeModel;
	};

	//Generate grid
	generateGrid(gl, context);

	//Create color volume
	createColorVolume(gl, context, [ -30, -30, -30 ], [ 10, 10, 10 ], [ 6, 6, 6 ], null);

	context["cellCount"] = 0;
	context["cellData"] = null;

	await Promise.all([
		fetchCellShader(),
		fetchGridShader(),
		fetchShapeShader(),
		fetchComposeShader(),
		fetchBacteriumModel(),
		fetchSphereModel(),
		fetchPlaneModel(),
	]);
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

function recreateOpaqueFBO(gl, context) {
	if (context["opaque"] != null) {
		gl.deleteTexture(context["opaque"]["opaqueColor"]);
		gl.deleteTexture(context["opaque"]["opaqueDepth"]);
		gl.deleteFramebuffer(context["opaque"]["fbo"]);
	}

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
	
	context["opaque"] = {
		"colorTexture": colorTexture,
		"depthTexture": depthTexture,
		"fbo": framebuffer
	};
}

function recreateTransparentFBO(gl, context) {
	if (context["transparent"] != null) {
		gl.deleteTexture(context["transparent"]["colorTexture"]);
		gl.deleteTexture(context["transparent"]["depthTexture0"]);
		gl.deleteTexture(context["transparent"]["depthTexture1"]);
		gl.deleteFramebuffer(context["transparent"]["fbo"]);
	}

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
	
	context["transparent"] = {
		"colorTexture": colorTexture,
		"depthTexture0": depthTexture0,
		"depthTexture1": depthTexture1,
		"fbo": framebuffer
	};
}

function recreatePeelFBO(gl, context) {
	if (context["peel"] != null) {
		gl.deleteTexture(context["peel"]["colorTexture"]);
		gl.deleteTexture(context["peel"]["depthTexture"]);
		gl.deleteFramebuffer(context["peel"]["fbo"]);
	}

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
	
	context["peel"] = {
		"colorTexture": colorTexture,
		"depthTexture": depthTexture,
		"fbo": framebuffer
	};
}

export function resize(gl, context, canvas) {
	recreateOpaqueFBO(gl, context);
	recreateTransparentFBO(gl, context);
	recreatePeelFBO(gl, context);
}

function drawScene(gl, context) {
	const camera = context["camera"];
	const projMatrix = camera["projectionMatrix"];
	const viewMatrix = camera["viewMatrix"];
	const cameraPos = camera["position"];

	//Draw grid
	const gridShader = context["gridShader"];
	const gridMesh = context["grid"];
	const color = gridMesh["color"];

	gl.disable(gl.CULL_FACE);

	gl.useProgram(gridShader["program"]);
	gl.uniformMatrix4fv(gridShader["uniforms"]["u_ProjectionMatrix"], false, projMatrix);
	gl.uniformMatrix4fv(gridShader["uniforms"]["u_ViewMatrix"], false, viewMatrix);
	gl.uniform3f(gridShader["uniforms"]["u_Color"], color[0], color[1], color[2]);

	gl.bindVertexArray(gridMesh.vao);
	gl.drawArrays(gl.TRIANGLES, 0, gridMesh.vertexCount);
	gl.bindVertexArray(null);

	gl.enable(gl.CULL_FACE);

	//Draw cells
	const cellShader = context["cellShader"];
	const bacteriumMesh = context["bacteriumMesh"];
	const withThinOutline = context["useThinOutlines"] ? 1 : 0;

	gl.useProgram(cellShader["program"]);
	gl.uniformMatrix4fv(cellShader["uniforms"]["u_ProjectionMatrix"], false, projMatrix);
	gl.uniformMatrix4fv(cellShader["uniforms"]["u_ViewMatrix"], false, viewMatrix);
	
	gl.uniform1i(cellShader["uniforms"]["u_SelectedIndex"], context["selectedCellIndex"]);
	gl.uniform1i(cellShader["uniforms"]["u_ThinOutlines"], withThinOutline);

	gl.bindVertexArray(bacteriumMesh.vao);
	gl.drawElementsInstanced(gl.TRIANGLES, bacteriumMesh.indexCount, bacteriumMesh.indexType, 0, context["cellCount"]);
	gl.bindVertexArray(null);
}

function drawShapes(gl, context, shader) {
	const sphereMesh = context["sphereMesh"];
	const shapeList = context["shapeList"];

	for (let i = 0; i < shapeList.length; i++) {
		const shape = shapeList[i];
		const isSphere = shape["type"] == "sphere";

		let shapeColor = vec4.fromValues(0.8, 0.8, 0.8, 0.8);
		let shapePos = vec3.fromValues(0, 0, 0);
		let shapeRot = quat.create();
		let shapeScale = vec3.fromValues(1, 1, 1);
	
		if (isSphere) {
			const pos = shape["pos"];
			const radius = shape["radius"];
			const color = shape["color"];

			shapePos = vec3.fromValues(pos[0], pos[1], pos[2]);
			shapeScale = vec3.fromValues(radius, radius, radius);
			if (color) shapeColor = vec4.fromValues(color[0], color[1], color[2], color[3]);
		}

		const shapeModelMatrix = mat4.fromRotationTranslationScale(mat4.create(), shapeRot, shapePos, shapeScale);
	
		gl.uniformMatrix4fv(shader["uniforms"]["u_ModelMatrix"], false, shapeModelMatrix);
		gl.uniform4f(shader["uniforms"]["u_Color"], shapeColor[0], shapeColor[1], shapeColor[2], shapeColor[3]);
	
		if (isSphere) {
			gl.bindVertexArray(sphereMesh.vao);
			gl.drawElements(gl.TRIANGLES, sphereMesh.indexCount, sphereMesh.indexType, 0);
			gl.bindVertexArray(null);
		}
	}
}

function drawFullscreenQuad(gl, context, ignoreDepth=true, blending=true) {
	const planeMesh = context["planeMesh"];

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

function blitFBO(gl, read, draw, width, height, clearFlags) {
	gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
	gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);

	gl.blitFramebuffer(0, 0, width, height,
					   0, 0, width, height,
					   clearFlags, gl.NEAREST);
}

export function drawFrame(gl, context, delta) {
	const viewWidth = gl.canvas.width;
	const viewHeight = gl.canvas.height;

	const transparentFBO = context["transparent"]["fbo"];
	const opaqueFBO = context["opaque"]["fbo"];
	const peelFBO = context["peel"]["fbo"];
	
	const shapeShader = context["shapeShader"];
	const composeShader = context["composeShader"];
	const composeVolumeShader = context["composeVolumetricShader"];
	
	const layerCount = Math.max(1, context["depthPeeling"]["layerCount"]);
	
	const camera = context["camera"];
	const projMatrix = camera["projectionMatrix"];
	const viewMatrix = camera["viewMatrix"];

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

	drawScene(gl, context);

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
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, context["transparent"]["depthTexture0"], 0);
	gl.clear(gl.DEPTH_BUFFER_BIT);

	//Clear depth texture 1
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, context["transparent"]["depthTexture1"], 0);
	gl.clear(gl.DEPTH_BUFFER_BIT);

	gl.clearDepth(1.0);

	//These are the parameters for "under" blending (requires pre-multiplied alpha).
	gl.blendEquation(gl.FUNC_ADD);
	gl.blendFuncSeparate(gl.DST_ALPHA, gl.ONE, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);

	/* Draw depth layers */
	gl.useProgram(shapeShader["program"]);
	gl.uniformMatrix4fv(shapeShader["uniforms"]["u_ProjectionMatrix"], false, projMatrix);
	gl.uniformMatrix4fv(shapeShader["uniforms"]["u_ViewMatrix"], false, viewMatrix);
	gl.uniform1f(shapeShader["uniforms"]["u_DepthCompareBias"], context["depthPeeling"]["depthCompareBias"]);

	for (let i = 0; i < layerCount; i++) {
		const currentTransparentDepth = (i & 1) ? context["transparent"]["depthTexture1"] : context["transparent"]["depthTexture0"];
		const previousTransparentDepth = (i & 1) ? context["transparent"]["depthTexture0"] : context["transparent"]["depthTexture1"];

		gl.useProgram(shapeShader["program"]);
		gl.uniform1i(shapeShader["uniforms"]["u_TreatAsOpaque"], i == (layerCount - 1));

		//Bind the 'closest depth' texture
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, previousTransparentDepth);
		gl.uniform1i(shapeShader["uniforms"]["u_ClosestDepth"], 1);

		//Copy the depth from the opaque layer to the "peel" FBO. This is done so that
		//transparent objects that are further than opaque ones don't get rendered
		blitFBO(gl, opaqueFBO, peelFBO, viewWidth, viewHeight, gl.DEPTH_BUFFER_BIT);
		
		/* Draw transparent objects */
		gl.bindFramebuffer(gl.FRAMEBUFFER, peelFBO);

		gl.clearColor(0.0, 0.0, 0.0, 0.0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		drawShapes(gl, context, shapeShader);

		/* Composite current layer under the rest */
		gl.bindFramebuffer(gl.FRAMEBUFFER, transparentFBO);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, currentTransparentDepth, 0);

		if (context["colorVolume"]["enabled"]) {
			const shaderUniforms = composeVolumeShader["uniforms"];

			const volOrigin = context["colorVolume"]["origin"];
			const volCellCount = context["colorVolume"]["cellCount"];
			const volCellSize = context["colorVolume"]["cellSize"];
			const volTexture = context["colorVolume"]["texture"];

			gl.useProgram(composeVolumeShader["program"]);

			gl.uniformMatrix4fv(shaderUniforms["u_ProjectionMatrix"], false, projMatrix);
			gl.uniformMatrix4fv(shaderUniforms["u_ViewMatrix"], false, viewMatrix);
			gl.uniform2i(shaderUniforms["u_ScreenSize"], viewWidth, viewHeight);
			gl.uniform1f(shaderUniforms["u_DepthCompareBias"], context["depthPeeling"]["depthCompareBias"]);

			gl.uniform3f(shaderUniforms["u_VolumeOrigin"], volOrigin[0], volOrigin[1], volOrigin[2]);
			gl.uniform3f(shaderUniforms["u_VolumeCellSize"], volCellSize[0], volCellSize[1], volCellSize[2]);
			gl.uniform3i(shaderUniforms["u_VolumeCellCount"], volCellCount[0], volCellCount[1], volCellCount[2]);

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, context["peel"]["colorTexture"]);
			gl.uniform1i(shaderUniforms["u_ColorTexture"], 0);

			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, context["peel"]["depthTexture"]);
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
			gl.bindTexture(gl.TEXTURE_2D, context["peel"]["colorTexture"]);
			gl.uniform1i(composeShader["uniforms"]["u_Texture"], 0);
		}

		drawFullscreenQuad(gl, context);

		//Copy the depth from the "peel" FBO to the "transparent" FBO.
		blitFBO(gl, peelFBO, transparentFBO, viewWidth, viewHeight, gl.DEPTH_BUFFER_BIT);

		//We don't HAVE to unbind the texture, but the WebGL debug layers get confused and think we are 
		//reading from the texture while also drawing to it and print a warning message.
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	/* Composite the opaque layer under the transparent layer */
	gl.bindFramebuffer(gl.FRAMEBUFFER, transparentFBO);

	gl.useProgram(composeShader["program"]);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, context["opaque"]["colorTexture"]);
	gl.uniform1i(composeShader["uniforms"]["u_Texture"], 0);

	drawFullscreenQuad(gl, context, "opaque");

	/////////////////////////////////////////////////
	// Copy the final result to the screen
	/////////////////////////////////////////////////
	gl.bindFramebuffer(gl.READ_FRAMEBUFFER, transparentFBO);
	gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
	
	gl.blitFramebuffer(0, 0, viewWidth, viewHeight,
					   0, 0, viewWidth, viewHeight,
					   gl.COLOR_BUFFER_BIT, gl.NEAREST);
}