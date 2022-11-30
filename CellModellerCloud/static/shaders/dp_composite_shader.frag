#pragma vscode_glsllint_stage : frag
precision highp float;

#ifdef COMPOSE_WITH_VOLUMETRICS
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

uniform sampler2D u_ColorTexture;
uniform sampler2D u_FurtherDepth;
uniform sampler2D u_CloserDepth;
uniform float u_DepthCompareBias;

uniform vec3 u_VolumeOrigin;
uniform vec3 u_VolumeCellSize;
uniform vec3 u_VolumeCellCount;

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

vec4 traceVolume(vec3 rayOrigin, vec3 rayDir, float tMin, float tMax) {
	vec3 invCellSize = 1.0 / u_VolumeCellSize;
	vec3 invCellCount = 1.0 / u_VolumeCellCount;
	vec3 invRayDir = 1.0 / rayDir;

	const float rayTBias = 0.0001;

	vec4 accumulatedColor = vec4(0, 0, 0, 0);

	int safety = 0;

	for (float curTMin = tMin + rayTBias; curTMin < tMax;) {
		vec3 cellRayStart = rayOrigin + rayDir * curTMin;
		vec3 cellLocation = (cellRayStart - u_VolumeOrigin) * invCellSize;

		vec3 cellIndex = floor(cellLocation);
		vec3 cellOffset = fract(cellLocation);

		vec3 cellMin = cellIndex * u_VolumeCellSize + u_VolumeOrigin;
		vec3 cellMax = cellMin + u_VolumeCellSize;

#if 0
		vec2 cellT = intersectAABB(rayOrigin, invRayDir, cellMin, cellMax);

		//This isn't needed, but I'll keep it here as a kind of "visual" assert
		if (cellT.x >= cellT.y) return vec4(1, 0, 1, 1);
		
		vec4 cellColor = vec4(cellIndex * invCellCount, 0.2);
		accumulatedColor = blendUnder(accumulatedColor, cellColor);

		curTMin = cellT.y + rayTBias;
#else
		vec4 cellColor = vec4(cellIndex * invCellCount, 0.01);
		accumulatedColor = blendOver(accumulatedColor, cellColor);

		curTMin += 0.1;
#endif

		if (++safety >= 1000) return vec4(1, 1, 0, 1);
	}

	return accumulatedColor;
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

		vec2 volumeTRange = intersectAABB(rayOrigin, 1.0 / rayDir, u_VolumeOrigin, u_VolumeOrigin + u_VolumeCellSize * u_VolumeCellCount);

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