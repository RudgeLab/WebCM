#version 300 es

#pragma vscode_glsllint_stage : frag
precision highp float;

uniform vec4 u_Color;

out vec4 outColor;

void main() {
	outColor = u_Color;
}