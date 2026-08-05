import * as THREE from "three";

/**
 * Los sombreadores del agua de los chunks de playa.
 *
 * Vivían dentro de `sea.ts` como plantillas de texto: 173 de sus 777 líneas
 * eran GLSL sin resaltado de sintaxis, justo donde más falta hace. Aquí no hay
 * lógica de escena, solo el código que corre en la GPU y los parches sobre los
 * chunks de Three.js.
 *
 * La escala es expresiva, no métrica: longitud, altura y anchura de espuma van
 * exageradas para que el oleaje se lea desde la cámara isométrica y en móvil.
 * Véase `docs/art-direction.md`.
 */

/** Parcha el material de la superficie con el oleaje volumétrico y la espuma. */
export function patchSeaSurfaceShader(
  shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> },
  uniforms: Record<string, THREE.IUniform>
): void {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
      attribute float coastMask;
      attribute float shoreDistance;
      varying float vCoastMask;
      varying float vShoreDistance;
      varying vec2 vSeaCoordinates;
      varying float vWaveCrest;
      uniform float waveTime;
      uniform float waveAmplitude;
      uniform float waveLength;
      uniform float waveSpeed;
      uniform float crestHeight;
      uniform float waterMode;
      uniform float illustratedStyle;
      uniform vec2 waveDirection;
      uniform float directionalWaves;
      uniform vec2 structureTip;
      uniform float structureShelter;
      float breakwaterShelter(vec2 point, vec2 flow, vec2 tip) {
        vec2 relative = point - tip;
        float downstream = dot(relative, flow);
        float crossFlow = abs(dot(relative, vec2(-flow.y, flow.x)));
        float wakeWidth = 14.0 + max(0.0, downstream) * .42;
        float lateral = 1.0 - smoothstep(wakeWidth * .38, wakeWidth, crossFlow);
        float begins = smoothstep(2.0, 24.0, downstream);
        float fades = 1.0 - smoothstep(190.0, 330.0, downstream);
        return structureShelter * lateral * begins * fades;
      }`
    )
    .replace(
      "#include <beginnormal_vertex>",
      `float normalSurfZone = smoothstep(7.0, 24.0, shoreDistance)
        * (1.0 - smoothstep(105.0, 175.0, shoreDistance));
      float normalPhase = shoreDistance * 6.2831853 / max(18.0, waveLength)
        + waveTime * waveSpeed * .13
        + sin(position.y * .026) * .58;
      float normalDirectionalCoordinate = dot(position.xy, waveDirection);
      float directionalNormalPhase = normalDirectionalCoordinate * 6.2831853 / max(18.0, waveLength)
        - waveTime * waveSpeed * .13;
      normalPhase = mix(normalPhase, directionalNormalPhase, directionalWaves);
      float normalShelter = breakwaterShelter(position.xy, waveDirection, structureTip);
      float waveSlope = cos(normalPhase) * normalSurfZone * crestHeight * .075 * waterMode * (1.0 - normalShelter * .68);
      vec2 slopeDirection = mix(vec2(1.0, 0.0), waveDirection, directionalWaves);
      vec3 objectNormal = normalize(vec3(-waveSlope * slopeDirection.x, -waveSlope * slopeDirection.y, 1.0));`
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vCoastMask = coastMask;
      vShoreDistance = shoreDistance;
      vSeaCoordinates = position.xy;
      vWaveCrest = 0.0;
      float wavePhase = waveTime * waveSpeed;
      float directionalCoordinate = dot(position.xy, waveDirection);
      float localShelter = breakwaterShelter(position.xy, waveDirection, structureTip);
      float localWaveStrength = 1.0 - localShelter * .68;
      float directionalSeaWave = sin((directionalCoordinate - wavePhase) * 6.2831853 / waveLength);
      directionalSeaWave += .34 * sin((dot(position.xy, vec2(-waveDirection.y, waveDirection.x)) * .5 - wavePhase * .71) * 6.2831853 / (waveLength * .62));
      float seaWave = sin((position.x + wavePhase) * 6.2831853 / waveLength);
      seaWave += 0.42 * sin((position.y * 0.72 - wavePhase * 0.63) * 6.2831853 / (waveLength * 0.57));
      seaWave = mix(seaWave, directionalSeaWave, directionalWaves);
      // La ola crece sobre el nivel del mar. Evita que una exageración
      // artística abra huecos y deje ver el DEM bajo la superficie.
      float shoreDamping = smoothstep(7.0, 52.0, vShoreDistance);
      float shorelineWave = mix(1.0, shoreDamping, illustratedStyle);
      float legacyHeight = (seaWave * 0.35 + 0.55) * waveAmplitude * shorelineWave;
      float surfZone = smoothstep(7.0, 24.0, vShoreDistance)
        * (1.0 - smoothstep(105.0, 175.0, vShoreDistance));
      float coastalPhase = vShoreDistance * 6.2831853 / max(18.0, waveLength)
        + waveTime * waveSpeed * .13
        + sin(position.y * .026) * .58;
      float directionalCoastalPhase = directionalCoordinate * 6.2831853 / max(18.0, waveLength)
        - waveTime * waveSpeed * .13;
      coastalPhase = mix(coastalPhase, directionalCoastalPhase, directionalWaves);
      float coastalWave = sin(coastalPhase);
      float crest = pow(max(0.0, coastalWave), 4.0);
      float openWaterPattern = (
        sin(position.x * .027 + waveTime * .31)
        * sin(position.y * .021 - waveTime * .23)
      );
      float openWater = (openWaterPattern * .45 + .55) * waveAmplitude * mix(1.0, .48, localShelter);
      // El volumen nunca baja del plano marino: el seno modifica el hombro
      // de la ola, mientras la cresta aporta toda la elevación principal.
      float breakingProfile = max(0.0, coastalWave * .13 + .14)
        + crest * .86;
      float volumeHeight = openWater + surfZone * breakingProfile * crestHeight * localWaveStrength;
      vWaveCrest = crest * surfZone * waterMode * localWaveStrength;
      vec2 crestAdvance = mix(vec2(-1.0, 0.0), waveDirection, directionalWaves);
      transformed.xy += crestAdvance * crest * surfZone * crestHeight * .22 * waterMode * localWaveStrength;
      transformed.z += mix(legacyHeight, volumeHeight, waterMode);`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
      varying float vCoastMask;
      varying float vShoreDistance;
      varying vec2 vSeaCoordinates;
      varying float vWaveCrest;
      uniform float waveTime;
      uniform float illustratedStyle;
      uniform vec3 sunVector;
      uniform float sunVisible;`
    )
    .replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
      if (vCoastMask < 0.5) discard;`
    )
    .replace(
      "#include <normal_fragment_maps>",
      `#ifdef USE_NORMALMAP_TANGENTSPACE
        vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
        vec2 detailUv = vNormalMapUv * 2.05 + vec2(waveTime * 0.003, -waveTime * 0.0045);
        vec3 detailN = texture2D(normalMap, detailUv).xyz * 2.0 - 1.0;
        mapN.xy = mapN.xy + detailN.xy * 0.42;
        mapN.xy *= normalScale;
        normal = normalize(tbn * normalize(mapN));
      #endif`
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float depthMix = smoothstep(8.0, 230.0, vShoreDistance);
      vec3 shoreColour = vec3(0.39, 0.82, 0.72);
      vec3 deepColour = vec3(0.055, 0.31, 0.40);
      vec3 illustratedColour = mix(shoreColour, deepColour, depthMix);
      diffuseColor.rgb = mix(diffuseColor.rgb, illustratedColour, illustratedStyle);
      // Variación de superficie no direccional: evita dibujar falsas
      // isóbatas paralelas a costa.
      float waterGrain = sin(vSeaCoordinates.x * .037 + waveTime * .19)
        * sin(vSeaCoordinates.y * .031 - waveTime * .14) * .012;
      diffuseColor.rgb += illustratedStyle * waterGrain * vec3(0.32, 0.58, 0.62);
      float foamNoise = .62 + .38
        * sin(vSeaCoordinates.x * .11 + sin(vSeaCoordinates.y * .07) * 1.8);
      float volumetricFoam = smoothstep(.32, .76, vWaveCrest * foamNoise);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.9, 1.0, .96), volumetricFoam);
      vec2 sunAxis = normalize(vec2(sunVector.x, -sunVector.z) + vec2(0.0001));
      float glintDistance = abs(dot(vSeaCoordinates, vec2(-sunAxis.y, sunAxis.x)));
      float glintBand = exp(-glintDistance / 62.0);
      float glintVariation = .78 + .22
        * sin(vSeaCoordinates.x * .018 + waveTime * .23)
        * sin(vSeaCoordinates.y * .021 - waveTime * .17);
      float glint = illustratedStyle * sunVisible * glintBand * .1 * glintVariation;
      diffuseColor.rgb += glint * vec3(1.0, .82, .52);`
    );
}

/** Cinta de espuma de la rompiente, sobre la línea de costa. */
export const SHORE_RIBBON_SHADER = {
  vertexShader: `
    attribute float foamAlpha;
    attribute vec2 foamCoordinate;
    varying float vFoamAlpha;
    varying vec2 vFoamCoordinate;
    void main() {
      vFoamAlpha = foamAlpha;
      vFoamCoordinate = foamCoordinate;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying float vFoamAlpha;
    varying vec2 vFoamCoordinate;
    void main() {
      float clumps = sin(vFoamCoordinate.x * .075)
        + .55 * sin(vFoamCoordinate.x * .19 + 1.7)
        + .28 * sin(vFoamCoordinate.x * .41 - 2.1);
      float brokenEdge = smoothstep(-.18, .48, clumps + vFoamCoordinate.y * .28);
      float alpha = vFoamAlpha * brokenEdge;
      if (alpha < 0.025) discard;
      vec3 foam = mix(vec3(.67, .91, .84), vec3(1.0, .97, .83), min(1.0, alpha * 1.35));
      gl_FragColor = vec4(foam, alpha);
    }
  `
};

/** Motas de espuma en la orilla, dibujadas como puntos. */
export const FOAM_POINTS_SHADER = {
  vertexShader: `
    attribute float foamStrength;
    varying float vStrength;
    uniform float pointSize;
    void main() {
      vStrength = foamStrength;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = pointSize * (900.0 / max(900.0, -mvPosition.z));
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying float vStrength;
    void main() {
      vec2 p = gl_PointCoord - .5;
      float radius = length(p);
      float angle = atan(p.y, p.x);
      float irregularRadius = .43 + .055 * sin(angle * 5.0) + .025 * sin(angle * 9.0 + 1.2);
      float froth = smoothstep(irregularRadius, irregularRadius - .16, radius);
      float alpha = froth * vStrength;
      if (alpha < .025) discard;
      gl_FragColor = vec4(.91, 1.0, .97, alpha);
    }
  `
};
