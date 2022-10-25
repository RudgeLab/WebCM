function createShader(gl, vsSource, fsSource, uniforms) {
	const vertexShader = gl.createShader(gl.VERTEX_SHADER);
	gl.shaderSource(vertexShader, vsSource);
	gl.compileShader(vertexShader);
	
	const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fragmentShader, fsSource);
	gl.compileShader(fragmentShader);
	
	if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
		alert("Vertex shader error: " + gl.getShaderInfoLog(vertexShader));

		gl.deleteShader(vertexShader);
		
		return null;
	}
	
	if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
		alert("Fragment shader error: " + gl.getShaderInfoLog(fragmentShader));

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
	const gridLineCountX = 61;
	const gridLineCountZ = 61;

	const gridWidth = 600;
	const gridHeight = 600;

	const lineSize = 0.2;

	const verticesPerLine = 6;
	const bytesPerVertex = 4 * 2;
	const bytesPerLine = verticesPerLine * bytesPerVertex;
	const gridVertexCount = (gridLineCountX + gridLineCountZ) * verticesPerLine;

	var gridData = new ArrayBuffer(bytesPerVertex * gridVertexCount);
	var gridDataView = new DataView(gridData);

	var writeLineSegment = (baseIndex, xStart, xEnd, zStart, zEnd) => {
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

	return [ cellCount ];
}

export function calcCellVertexOffset(context, index) {
	return 4 + 36 * index;
}

export function lookupCellIdentifier(context, index) {
	const baseOffset = 4 + 36 * context["cellCount"] + 8 * index;
	const dataView = new DataView(context["cellData"]);

	return dataView.getBigUint64(baseOffset, true);
}

export async function init(gl, context) {
	//Load cell shader
	const cellVertexData = await fetch("/static/shaders/cell_shader.vert");
	const cellVertexSource = await cellVertexData.text();

	const cellFragmentData = await fetch("/static/shaders/cell_shader.frag");
	const cellFragmentSource = await cellFragmentData.text();

	context["cellShader"] = createShader(gl, cellVertexSource, cellFragmentSource, [
		"u_MvpMatrix", "u_CameraPos", "u_SelectedIndex", "u_ThinOutlines"
	]);

	//Load grid shader
	const gridVertexData = await fetch("/static/shaders/grid_shader.vert");
	const gridVertexSource = await gridVertexData.text();

	const gridFragmentData = await fetch("/static/shaders/grid_shader.frag");
	const gridFragmentSource = await gridFragmentData.text();

	context["gridShader"] = createShader(gl, gridVertexSource, gridFragmentSource, [
		"u_MvpMatrix", "u_Color"
	]);

	//Generate grid
	generateGrid(gl, context);

	context["cellCount"] = 0;
	context["cellData"] = null;

	//Load the bacterium
	const bacteriumData = await fetch("/static/bacterium.gltf");
	const bacteriumGLTF = await bacteriumData.json();
	const bacteriumModel = await loadBacteriumModel(bacteriumGLTF, gl, context);

	context["bacteriumMesh"] = bacteriumModel;
}

function prepassScene(gl, context, delta) {

}

function renderScene(gl, context, delta) {
	const camera = context["camera"];
	const mvpMatrix = mat4.multiply(mat4.create(), camera["projectionMatrix"], camera["viewMatrix"]);

	const cameraPos = context["camera"]["position"];

	/* Draw grid */
	const gridShader = context["gridShader"];
	const gridMesh = context["grid"];

	if (gridShader != null && gridMesh != null) {
		var color = gridMesh["color"];

		gl.disable(gl.CULL_FACE);

		gl.useProgram(gridShader["program"]);
		gl.uniformMatrix4fv(gridShader["uniforms"]["u_MvpMatrix"], false, mvpMatrix);
		gl.uniform3f(gridShader["uniforms"]["u_Color"], color[0], color[1], color[2]);

		gl.bindVertexArray(gridMesh.vao);
		gl.drawArrays(gl.TRIANGLES, 0, gridMesh.vertexCount);
		gl.bindVertexArray(null);

		gl.enable(gl.CULL_FACE);
	}

	/* Draw cells */
	const cellShader = context["cellShader"];
	const mesh = context["bacteriumMesh"];

	if (mesh == null || cellShader == null) {
		return;
	}

	const withThinOutline = context["useThinOutlines"] ? 1 : 0;

	gl.useProgram(cellShader["program"]);
	gl.uniformMatrix4fv(cellShader["uniforms"]["u_MvpMatrix"], false, mvpMatrix);
	gl.uniform3f(cellShader["uniforms"]["u_CameraPos"], cameraPos[0], cameraPos[1], cameraPos[2]);
	
	gl.uniform1i(cellShader["uniforms"]["u_SelectedIndex"], context["selectedCellIndex"]);
	gl.uniform1i(cellShader["uniforms"]["u_ThinOutlines"], withThinOutline);

	gl.bindVertexArray(mesh.vao);
	gl.drawElementsInstanced(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0, context["cellCount"]);
	gl.bindVertexArray(null);
}

export function resize(gl, context, canvas) {
	//We want to have anit-aliasing, but WebGL does not allow you to support MSAA 
	//when rendering directly to the canvas. To solve this, we can create a second
	//framebuffer with MSAA enabled, render the scene to it, resolve the MSAA samples,
	//and then copy that to the canvas surface.
	if (context["msaa"] != null) {
		//Delete previous framebuffer
		gl.deleteRenderbuffer(context["msaa"]["renderBuffer"]);
		gl.deleteRenderbuffer(context["msaa"]["depthBuffer"]);
		gl.deleteFramebuffer(context["msaa"]["renderTargetFBO"]);
	}

	//Create framebuffer
	const sampleCount = Math.min(gl.getParameter(gl.MAX_SAMPLES), 8);

	const renderBuffer = gl.createRenderbuffer();
	const depthBuffer = gl.createRenderbuffer();

	gl.bindRenderbuffer(gl.RENDERBUFFER, renderBuffer);
	gl.renderbufferStorageMultisample(gl.RENDERBUFFER, sampleCount, gl.RGBA8, gl.canvas.width, gl.canvas.height);

	gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
	gl.renderbufferStorageMultisample(gl.RENDERBUFFER, sampleCount, gl.DEPTH24_STENCIL8, gl.canvas.width, gl.canvas.height);

	const renderTargetFBO = gl.createFramebuffer();

	gl.bindFramebuffer(gl.FRAMEBUFFER, renderTargetFBO);
	gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, renderBuffer);
	gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
	
	gl.bindRenderbuffer(gl.RENDERBUFFER, null);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	context["msaa"] = {
		"depthBuffer": depthBuffer,
		"renderBuffer": renderBuffer,
		"renderTargetFBO": renderTargetFBO
	};
}

export function drawFrame(gl, context, delta) {
	/**** Prepass scene ****/
	//Because the MSAA framebuffer is bound when calling `renderScene`, `renderScene` cannot perform any
	//operations that would require rendering to another framebuffer. If a rendering operation needs to
	//render to a custom framebuffer, then it can be put into `prepassScene`.
	prepassScene(gl, context, delta);

	/**** Bind MSAA framebuffer ****/
	const renderTargetFBO = context["msaa"]["renderTargetFBO"];

	gl.enable(gl.DEPTH_TEST);
	gl.enable(gl.CULL_FACE);
	gl.cullFace(gl.BACK);
	
	gl.bindFramebuffer(gl.FRAMEBUFFER, renderTargetFBO);

	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	
	gl.clearColor(0.7, 0.7, 0.7, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	
	/**** Render scene ****/
	renderScene(gl, context, delta);

	/**** Resolve MSAA framebuffer ****/
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	
	gl.bindFramebuffer(gl.READ_FRAMEBUFFER, renderTargetFBO);
	gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

	gl.blitFramebuffer(0, 0, gl.canvas.width, gl.canvas.height,
					   0, 0, gl.canvas.width, gl.canvas.height,
					   gl.COLOR_BUFFER_BIT, gl.NEAREST);
}