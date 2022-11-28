#pragma vscode_glsllint_stage : frag
precision highp float;

uniform sampler2D u_Texture;

out vec4 out_Color;

void main() {
#if 0
	float depth = texelFetch(u_Texture, ivec2(gl_FragCoord.xy), 0).r;

	float zNear = 0.1;
	float zFar = 100.0;
	float depthNorm = 2.0 * depth - 1.0;
	float z = 2.0 * zNear * zFar / (zFar + zNear - depthNorm * (zFar - zNear));

	out_Color = vec4(vec3(z / zFar), 1.0);
#endif

	out_Color = texelFetch(u_Texture, ivec2(gl_FragCoord.xy), 0);
}