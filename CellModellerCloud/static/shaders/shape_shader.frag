#pragma vscode_glsllint_stage : frag
precision highp float;

uniform sampler2D u_ClosestDepth;

uniform vec4 u_Color;
uniform int u_TreatAsOpaque;
uniform float u_DepthCompareBias;

out vec4 outColor;

void main() {
	float fragDepth = gl_FragCoord.z;

	//Check if the fragment is closer than any of the previous layers
	float minDepth = texelFetch(u_ClosestDepth, ivec2(gl_FragCoord.xy), 0).r;

	if (fragDepth <= minDepth + u_DepthCompareBias) {
		discard;
	}

	outColor = (u_TreatAsOpaque == 0) ? u_Color : vec4(u_Color.rgb, 1.0);
}