const VERTEX_SHADER = `#version 300 es

layout(location = 0) in vec2 a_Position;
layout(location = 1) in vec2 a_TexCoords;

out vec2 v_TexCoords;

void main() {
	gl_Position = vec4(a_Position.x, a_Position.y, 0.0, 1.0);
	v_TexCoords = a_TexCoords;
}`;

const FRAGMENT_SHADER = `#version 300 es

precision highp float;

in vec2 v_TexCoords;

out vec4 outColor;

uniform float u_Time;
uniform vec2 u_Resolution;

float random(vec2 seed) {
    return fract(sin(dot(seed, vec2(12.9898,78.233))) * 43758.5453123);
}

vec2 random2D(vec2 seed) {
    vec2 val = vec2(dot(seed, vec2(127.1,311.7)), dot(seed, vec2(269.5,183.3)));
    return fract(sin(val) * 43758.5453123);
}

vec2 calcCellFocus(vec2 point) {
    point = random2D(point);
    return 0.5 + 0.35 * sin(6.2821 * point + 0.8 * u_Time);
}

void main() {
    vec2 uv = v_TexCoords * u_Resolution / 135.0;
    
    vec2 cellPos = floor(uv);
    vec2 localPos = fract(uv);
    
    float minFocusDist = 10.0;
    float minEdgeDist = 10.0;
    vec2 edgePos = vec2(0.0);
    
    vec2 minFocusIPos = vec2(10.0);
    vec2 minFocusFPos = vec2(10.0);
    
    for (int cY = -1; cY <= 1; cY++) {
        for (int cX = -1; cX <= 1; cX++) {
            vec2 neighbor = vec2(cX, cY);
            vec2 neighborPos = neighbor + cellPos;
            
            vec2 point = calcCellFocus(neighborPos);
            
            float focusDist = distance(neighborPos + point, uv);
            
            if (focusDist < minFocusDist) {
                minFocusDist = focusDist;
                minFocusIPos = neighbor;
                minFocusFPos = point;
            }
        }
    }
    
    for (int cY = -2; cY <= 2; cY++) {
        for (int cX = -2; cX <= 2; cX++) {
            vec2 neighbor = vec2(cX, cY);
            vec2 neighborPos = neighbor + cellPos;
            
            vec2 a = calcCellFocus(neighborPos) + neighborPos;
            vec2 b = cellPos + minFocusFPos + minFocusIPos;
            
            if (dot(a-b, a-b) > 0.001) {
                float dist = dot(uv - 0.5 * (a + b), normalize(b - a));
                
                if (dist < minEdgeDist) {
                    minEdgeDist = dist;
                    edgePos = 0.5 * (a + b);
                }
            }
        }
    }
    
    const vec3 COLOR_CELL   = vec3(138.0, 186.0, 25.0) / 255.0 + 0.1;
    const vec3 COLOR_BORDER = vec3(28.0, 87.0, 7.0) / 255.0 + 0.1;
    const vec3 COLOR_FADE   = vec3(222.0, 255.0, 68.0) / 255.0;
    
    float borderPrecent = smoothstep(0.03, 0.01, minEdgeDist);
    float fadePercent = 0.8 * pow(1.0 - minEdgeDist, 6.0);
    
    vec3 color = vec3(0.0);
    color += COLOR_BORDER * borderPrecent;
    color += mix(COLOR_CELL, COLOR_FADE, fadePercent) * (1.0 - borderPrecent);
    
    outColor = vec4(vec3(color), 1.0);
}`;

function attachWallToCanvas(canvas) {
	var gl = canvas.getContext("webgl2");

	if (gl === null) {
		alert("Unable to initialize WebGL");
		return;
	}

	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	const vertexShader = gl.createShader(gl.VERTEX_SHADER);
	gl.shaderSource(vertexShader, VERTEX_SHADER);
	gl.compileShader(vertexShader);

	const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fragmentShader, FRAGMENT_SHADER);
	gl.compileShader(fragmentShader);

	if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
		alert("Vertex shader error: " + gl.getShaderInfoLog(vertexShader));
		gl.deleteShader(vertexShader);
		
		return;
	}

	if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
		alert("Fragment shader error: " + gl.getShaderInfoLog(fragmentShader));
		gl.deleteShader(fragmentShader);
		
		return null;
	}

	const shaderProgram = gl.createProgram();
	gl.attachShader(shaderProgram, vertexShader);
	gl.attachShader(shaderProgram, fragmentShader);
	gl.linkProgram(shaderProgram);

	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		alert("Shader linking error: " + gl.getProgramInfoLog(shaderProgram));
		return null;
	}

	let vertices = new Float32Array([
		-1,  1, 0, 0,
		 1,  1, 1, 0,
		-1, -1, 0, 1,
		 1, -1, 1, 1,
	]);

	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	const vertexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 4 * 4, 0);
	gl.enableVertexAttribArray(0);

	gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 4 * 4, 2 * 4);
	gl.enableVertexAttribArray(1);

	var location0 = gl.getUniformLocation(shaderProgram, "u_Time");
	var location1 = gl.getUniformLocation(shaderProgram, "u_Resolution");

	//'now' is of type DOMHighResTimeStamp and store the time in milliseconds
	function render(now) {
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;

		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	
		gl.clearColor(1.0, 0.0, 1.0, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		gl.disable(gl.CULL_FACE);

		gl.useProgram(shaderProgram);
		gl.uniform1f(location0, now / 1000.0);
		gl.uniform2f(location1, canvas.clientWidth, canvas.clientHeight);

		gl.bindVertexArray(vao);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		window.requestAnimationFrame(render);
	}
	
	window.requestAnimationFrame(render);
}

window.addEventListener("load", function(e) {
	attachWallToCanvas(document.getElementById("bgcanvas"));
});