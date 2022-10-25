#version 300 es

#pragma vscode_glsllint_stage : vert

layout(location = 0) in vec2 a_Position;

uniform mat4 u_MvpMatrix;

void main() {
	gl_Position = u_MvpMatrix * vec4(a_Position.x, 0.0, a_Position.y, 1.0);
}