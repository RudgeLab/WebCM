#version 300 es

#pragma vscode_glsllint_stage : vert
#define MATH_PI (3.14159265359)

layout(location = 0) in vec3 a_Position;
layout(location = 1) in vec3 a_Normal;
layout(location = 2) in vec2 a_TexCoords;

layout(location = 3) in vec3 a_CellPos;
layout(location = 4) in vec3 a_CellDir;
layout(location = 5) in float a_Length;
layout(location = 6) in float a_Radius;
layout(location = 7) in vec4 a_Color;

uniform mat4 u_MvpMatrix;

uniform int u_SelectedIndex;
uniform int u_ThinOutlines;

out vec3 v_WorldPos;
out float v_Radius;
out vec3 v_CellEnd0;
out vec3 v_CellEnd1;

out vec3 v_Color;
flat out int v_IsSelected;
flat out int v_ThinOutline;

void main() {
	//Calculate rotation matrix
	float yaw = atan(a_CellDir.x, a_CellDir.z);
	float pitch = acos(a_CellDir.y);

	float cy = cos(yaw);
	float sy = sin(yaw);
	float cp = cos(pitch);
	float sp = sin(pitch);

	//Transform vertex position to world space
	mat4 modelMatrix = mat4(
		a_Radius * cy,      0.5 * 0.0,   a_Radius * -sy,     0.0,
		a_Radius * sy * sp, 0.5 * cp,    a_Radius * cy * sp, 0.0,
		a_Radius * sy * cp, 0.5 * -sp,   a_Radius * cy * cp, 0.0,
		a_CellPos.x,        a_CellPos.y, a_CellPos.z,        1.0
	);

	float totalLength = a_Length + 2.0 * a_Radius;

	vec3 position = a_Position;
	position.y += mix(-1.0, 1.0, a_TexCoords.x) * (totalLength - 1.0);

	vec4 worldPos = modelMatrix * vec4(position, 1.0);
	
	//Write varyings
	gl_Position = u_MvpMatrix * worldPos;

	/*
	The following can also be compacted to:

		vec3 t = vec3(a_Radius * sy * sp, 0.5 * cp, a_Radius * cy * sp);
		v_CellEnd0 = a_Length * t + a_CellPos;
		v_CellEnd1 = -a_Length * t + a_CellPos;

	I'm not going to use the compact version here since we already have the model matrix,
	but it will come in handy when performing ray-cell intersection tests
	*/
	v_CellEnd0 = vec3(modelMatrix * vec4(0.0,  a_Length, 0.0, 1.0));
	v_CellEnd1 = vec3(modelMatrix * vec4(0.0, -a_Length, 0.0, 1.0));

	v_WorldPos = worldPos.xyz;
	v_Color = a_Color.xyz;
	v_Radius = a_Radius;
	v_IsSelected = int(gl_InstanceID == u_SelectedIndex);
	v_ThinOutline = u_ThinOutlines;
}