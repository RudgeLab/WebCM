#version 300 es

#pragma vscode_glsllint_stage : frag
precision highp float;

uniform vec3 u_Color;

out vec4 outColor;

void main() {
	outColor = vec4(u_Color, 1.0);
}