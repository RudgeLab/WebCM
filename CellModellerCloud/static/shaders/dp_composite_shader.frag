#pragma vscode_glsllint_stage : frag
precision highp float;
precision mediump sampler3D;

#ifdef COMPOSE_WITH_VOLUMETRICS
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

uniform sampler2D u_ColorTexture;
uniform sampler2D u_FurtherDepth;
uniform sampler2D u_CloserDepth;
uniform float u_DepthCompareBias;

uniform vec3 u_VolumeOrigin;
uniform vec3 u_VolumeCellSize;
uniform ivec3 u_VolumeCellCount;
uniform sampler3D u_VolumeTexture;

uniform float u_VolumeOpacityMultiplier;

uniform ivec2 u_ScreenSize;
#else
uniform sampler2D u_Texture;
#endif

out vec4 out_Color;

#ifdef COMPOSE_WITH_VOLUMETRICS

vec2 intersectAABB(vec3 rayOrigin, vec3 invRayDir, vec3 boxMin, vec3 boxMax) {
	vec3 tMin = (boxMin - rayOrigin) * invRayDir;
	vec3 tMax = (boxMax - rayOrigin) * invRayDir;
	vec3 t1 = min(tMin, tMax);
	vec3 t2 = max(tMin, tMax);
	float tNear = max(max(t1.x, t1.y), t1.z);
	float tFar = min(min(t2.x, t2.y), t2.z);
	return vec2(tNear, tFar);
}

//Mix two colors using UNDER blending
vec4 blendOver(vec4 over, vec4 under) {
	float alpha = over.a + under.a * (1.0 - over.a);
	vec3 color = mix(under.rgb * under.a, over.rgb, over.a) / alpha;
	return vec4(color, alpha);
}

vec3 divideSafe(vec3 num, vec3 denum) {
	const float INFINITY = intBitsToFloat(0x7f800000);

	return vec3(
		denum.x != 0.0 ? (num.x / denum.x) : INFINITY,
		denum.y != 0.0 ? (num.y / denum.y) : INFINITY,
		denum.z != 0.0 ? (num.z / denum.z) : INFINITY
	);
}

vec4 traceVolume(vec3 rayOrigin, vec3 rayDir, float rayTMin, float rayTMax) {
	vec3 voxelSize = u_VolumeCellSize;
	ivec3 voxelCount = u_VolumeCellCount;

	vec3 rayGridEntry = rayOrigin + rayDir * (rayTMin + 0.0001) - u_VolumeOrigin;
	float localTMax = rayTMax - rayTMin;

	/* Initialize the ray traversal algorithm */
	ivec3 gridStep = ivec3(1);
	if (rayDir.x < 0.0) gridStep.x = -1;
	if (rayDir.y < 0.0) gridStep.y = -1;
	if (rayDir.z < 0.0) gridStep.z = -1;

	ivec3 curVoxel = ivec3(floor(rayGridEntry / voxelSize));
	vec3 nextVoxelBoundary = vec3(curVoxel + gridStep) * voxelSize;

	vec3 tMax = divideSafe(nextVoxelBoundary - rayGridEntry, rayDir);
	vec3 tDelta = divideSafe(voxelSize * vec3(gridStep), rayDir);

	if (rayDir.x < 0.0) tMax.x -= tDelta.x;
	if (rayDir.y < 0.0) tMax.y -= tDelta.y;
	if (rayDir.z < 0.0) tMax.z -= tDelta.z;

	/* Traverse the grid and compute the color of the current ray */
	float lastT = 0.0;
	vec4 absorbedColor = vec4(0, 0, 0, 1);

	int safety = 0;

	while (true) {
		float t = min(tMax.x, min(tMax.y, tMax.z));

		/* Core loop body */
		vec4 voxelColor = texture(u_VolumeTexture, (vec3(curVoxel) + 0.5) / vec3(voxelCount));
		voxelColor.a *= u_VolumeOpacityMultiplier;

		absorbedColor.xyz += voxelColor.xyz * voxelColor.a * absorbedColor.a;
		absorbedColor.a *= (1.0 - voxelColor.a);

		if (t >= localTMax) break;
		if (++safety >= 4000) return vec4(1, 1, 0, 1);

		lastT = t;

		/* Move to next cell */
		if (tMax.x < tMax.y && tMax.x < tMax.z) {
			tMax.x += tDelta.x;
			curVoxel.x += gridStep.x;

			if (curVoxel.x < 0 || curVoxel.x > voxelCount.x) break;
		} else if (tMax.y < tMax.z) {
			tMax.y += tDelta.y;
			curVoxel.y += gridStep.y;

			if (curVoxel.y < 0 || curVoxel.y > voxelCount.y) break;
		} else {
			tMax.z += tDelta.z;
			curVoxel.z += gridStep.z;

			if (curVoxel.z < 0 || curVoxel.z > voxelCount.z) break;
		}
	}

	return vec4(absorbedColor.rgb, 1.0 - absorbedColor.a);
}

void main() {
	vec4 layerColor = texelFetch(u_ColorTexture, ivec2(gl_FragCoord.xy), 0);

	//Fetch depth values
	float closerDepth = texelFetch(u_CloserDepth, ivec2(gl_FragCoord.xy), 0).r;
	float furtherDepth = texelFetch(u_FurtherDepth, ivec2(gl_FragCoord.xy), 0).r;

	if (closerDepth + u_DepthCompareBias < furtherDepth) {
		//Compute the start and end of the current ray (well, line segment since it has a start and an end)
		mat4 invViewProj = inverse(u_ViewMatrix) * inverse(u_ProjectionMatrix);

		vec2 uv = gl_FragCoord.xy / vec2(u_ScreenSize);
		vec4 rayStart = invViewProj * vec4(2.0 * vec3(uv, closerDepth) - 1.0, 1.0);
		vec4 rayEnd = invViewProj * vec4(2.0 * vec3(uv, furtherDepth) - 1.0, 1.0);

		rayStart.xyz /= rayStart.w;
		rayEnd.xyz /= rayEnd.w;

		//Calculate the segment of the current ray that is inside the color volume
		float rayLength = distance(rayEnd.xyz, rayStart.xyz);

		vec3 rayOrigin = rayStart.xyz;
		vec3 rayDir = (rayEnd.xyz - rayStart.xyz) / rayLength;

		vec2 volumeTRange = intersectAABB(rayOrigin, 1.0 / rayDir, u_VolumeOrigin, u_VolumeOrigin + u_VolumeCellSize * vec3(u_VolumeCellCount));

		float rayStartT = max(volumeTRange.x, 0.0);
		float rayEndT = min(volumeTRange.y, rayLength);

		//Calculate the amount 
		if (rayStartT < rayEndT) {
			vec4 volumeColor = traceVolume(rayOrigin, rayDir, rayStartT, rayEndT);

			//Mix the layer color with the volume color (layer color UNDER volume color).
			layerColor = blendOver(volumeColor, layerColor);
		}
	}

	out_Color = vec4(layerColor.xyz * layerColor.a, layerColor.a);
}

#else

void main() {
#if 0
	float depth = texelFetch(u_Texture, ivec2(gl_FragCoord.xy), 0).r;

	float zNear = 0.1;
	float zFar = 100.0;
	float depthNorm = 2.0 * depth - 1.0;
	float z = 2.0 * zNear * zFar / (zFar + zNear - depthNorm * (zFar - zNear));

	out_Color = vec4(vec3(z / zFar), 1.0);
#endif

	vec4 finalColor = texelFetch(u_Texture, ivec2(gl_FragCoord.xy), 0);
	out_Color = vec4(finalColor.xyz * finalColor.a, finalColor.a);
}

#endif