#pragma vscode_glsllint_stage : frag
precision highp float;

uniform mat4 u_ViewMatrix;
uniform mat4 u_InvViewMatrix;
uniform mat4 u_ProjectionMatrix;

uniform int u_ShowOutline;
uniform int u_FlatShading;

in vec3 v_WorldPos;
in float v_Radius;
in vec3 v_CellEnd0;
in vec3 v_CellEnd1;

in vec3 v_Color;
flat in int v_IsSelected;

out vec4 outColor;

/*
 Taken from:
	https://iquilezles.org/articles/intersectors/
*/
float capIntersect(in vec3 rayOrigin, in vec3 rayDir, in vec3 capA, in vec3 capB, in float radius)  {
	vec3 ba = capB - capA;
	vec3 oa = rayOrigin - capA;

	float baba = dot(ba, ba);
	float bard = dot(ba, rayDir);
	float baoa = dot(ba, oa);
	float rdoa = dot(rayDir, oa);
	float oaoa = dot(oa, oa);

	float a = baba - bard * bard;
	float b = baba * rdoa - baoa * bard;
	float c = baba * oaoa - baoa * baoa - radius * radius * baba;
	float h = b * b - a * c;

	if (h >= 0.0) {
		float t = (-b - sqrt(h)) / a;
		float y = baoa + t * bard;

		// body
		if (y > 0.0 && y < baba) return t;

		// caps
		vec3 oc = (y <= 0.0) ? oa : rayOrigin - capB;
		b = dot(rayDir,oc);
		c = dot(oc,oc) - radius * radius;
		h = b * b - c;

		if (h > 0.0) return -b - sqrt(h);
	}

	return -1.0;
}

/*
 Based on:
	https://stackoverflow.com/questions/2824478/shortest-distance-between-two-line-segments
*/
float lineSegmentDistance(vec3 a0, vec3 a1, vec3 b0, vec3 b1) {
	vec3 A = a1 - a0;
	vec3 B = b1 - b0;
	
	vec3 t = b0 - a0;
	
	float magA = length(A);
	float magB = length(B);
	
	if (magB < 0.001) {
		return distance(t, (dot(A, t) / dot(A, A)) * A);
	}

	vec3 _A = A / magA;
	vec3 _B = B / magB;
	
	vec3 crs = cross(_A, _B);
	float denom = dot(crs, crs);
	
	float detA = determinant(mat3(t, _B, crs));
	float detB = determinant(mat3(t, _A, crs));
	
	float t0 = detA / denom;
	float t1 = detB / denom;
	
	vec3 pA = a0 + (_A * t0);
	vec3 pB = b0 + (_B * t1);
	
	if (t1 < 0.0) pB = b0;
	else if (t1 > magB) pB = b1;

	if ((t1 < 0.0) || (t1 > magB)) {
		pA = a0 + _A * dot(_A, (pB - a0));
	}
	
	return distance(pA, pB);
}

/*
 Look at:
	https://bgolus.medium.com/rendering-a-sphere-on-a-quad-13c92025570c
*/
void main() {
	vec3 cameraPos = vec3(u_InvViewMatrix * vec4(0, 0, 0, 1)).xyz;
	vec3 lightPos  = vec3(u_InvViewMatrix * vec4(-2, 2, 0, 1)).xyz;
	vec3 rayDir = normalize(v_WorldPos - cameraPos);

	float rayDepth = capIntersect(cameraPos, rayDir, v_CellEnd0, v_CellEnd1, v_Radius);
	if (rayDepth < 0.0) {
		discard;
	}
	
	vec3 intersectPos = cameraPos + rayDir * rayDepth;

	//Compute the base color of the cell
	bool selected = v_IsSelected != 0;
	
	float outlineWidth = selected ? 0.13 : 0.08;
	vec3  outlineColor = selected ? vec3(0.0) : vec3(1.0);
	vec3  fillColor    = selected ? vec3(1.0, 1.0, 0.0) : v_Color;

	vec3 color = fillColor;

	if (u_ShowOutline != 0 || selected) {
		float dist  = lineSegmentDistance(cameraPos, v_WorldPos, v_CellEnd0, v_CellEnd1);
		float blend = smoothstep(v_Radius - outlineWidth - 0.03, v_Radius - outlineWidth, dist);

		color = mix(fillColor, outlineColor, blend);
	}

	//Compute the lighting of the cell
	vec3 light = color;

	if (u_FlatShading == 0 && !selected)  {
		vec3 a = v_CellEnd1 - v_CellEnd0;
		vec3 b = intersectPos - v_CellEnd0;
		vec3 c = clamp(dot(a, b) / dot(a, a), 0.0, 1.0) * a + v_CellEnd0;

		vec3 normal = normalize(intersectPos - c);
		vec3 lightDir = normalize(lightPos - intersectPos);

		float diffuseFactor = pow(max(dot(normal, lightDir), 0.0), 4.0);
		float specularFactor = pow(max(dot(normal, lightDir), 0.0), 32.0);

		float ambient = 0.4;
		float diffuse = 0.5 * diffuseFactor;
		float specular = 0.5 * specularFactor;

		light = color * (ambient + diffuse) + vec3(specular);
	}

	//Compute new capsule depth
	// (There's probably a much more efficient way of doing this)
	vec4 clipPos = u_ProjectionMatrix * u_ViewMatrix * vec4(intersectPos, 1.0);
	float clipDepth = clipPos.z / clipPos.w;
	gl_FragDepth = 0.5 * clipDepth + 0.5;

	outColor = vec4(light, 1);
}