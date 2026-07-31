import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";
import {
  coastlineEnvelope,
  coastXAt,
  isPointInPolygon,
  isSeaPoint,
  landPolygonFromCoastlines,
  seawardNormal,
  type CoastLine
} from "./coastalOrientation";
import type { Vector3Like } from "../solar/sunVector";
import { loadJson, loadTexture } from "./assets";

export const SEA_STATES = ["calm", "moderate", "rough"] as const;
export type SeaState = typeof SEA_STATES[number];
export type WaterMode = "legacy" | "volumetric";
export type SeaStateSource = "debug" | "official-flag" | "marine-data" | "fallback";
export type SeaConditions = {
  state: SeaState;
  source: SeaStateSource;
  waveHeightMeters?: number;
  periodSeconds?: number;
  directionDegrees?: number;
};

type SeaSettings = {
  amplitude: number;
  wavelength: number;
  speed: number;
  breakerCount: number;
  breakerSpacing: number;
  breakerWidth: number;
  crestHeight: number;
  breakerOpacity: number;
  shoreGap: number;
  textureStrength: number;
  textureSpeed: number;
};

const SETTINGS: Record<SeaState, SeaSettings> = {
  calm: { amplitude: .12, wavelength: 74, speed: 4, breakerCount: 1, breakerSpacing: 62, breakerWidth: 16, crestHeight: 2.2, breakerOpacity: .62, shoreGap: 11, textureStrength: .03, textureSpeed: .004 },
  moderate: { amplitude: .28, wavelength: 52, speed: 8, breakerCount: 1, breakerSpacing: 58, breakerWidth: 28, crestHeight: 5.2, breakerOpacity: .86, shoreGap: 15, textureStrength: .05, textureSpeed: .008 },
  rough: { amplitude: .55, wavelength: 38, speed: 12, breakerCount: 2, breakerSpacing: 52, breakerWidth: 38, crestHeight: 8.2, breakerOpacity: .92, shoreGap: 19, textureStrength: .08, textureSpeed: .012 }
};
const CLASSIC_SETTINGS: Record<SeaState, SeaSettings> = {
  calm: { amplitude: .55, wavelength: 74, speed: 4, breakerCount: 2, breakerSpacing: 48, breakerWidth: 2.5, crestHeight: 0, breakerOpacity: .3, shoreGap: 3, textureStrength: .46, textureSpeed: .004 },
  moderate: { amplitude: 1.8, wavelength: 52, speed: 8, breakerCount: 3, breakerSpacing: 40, breakerWidth: 4.5, crestHeight: 0, breakerOpacity: .48, shoreGap: 4.5, textureStrength: .82, textureSpeed: .008 },
  rough: { amplitude: 3.2, wavelength: 38, speed: 12, breakerCount: 4, breakerSpacing: 34, breakerWidth: 6.5, crestHeight: 0, breakerOpacity: .62, shoreGap: 5, textureStrength: 1.05, textureSpeed: .012 }
};

type GeoJSON = {
  features: Array<{
    properties?: { id_dera?: number };
    geometry: { type: string; coordinates: number[][] | number[][][] };
  }>;
};
type LocalCoastline = { featureId?: number; line: CoastLine };

export interface SeaController {
  group: THREE.Group;
  update(elapsedSeconds: number): void;
  setConditions(conditions: SeaConditions): void;
  setMode(mode: WaterMode): void;
  setSun(vector: Vector3Like, visible: boolean): void;
  dispose(): void;
}

export async function createSea(
  sizeX: number,
  sizeZ: number,
  config: BeachConfig
): Promise<SeaController> {
  const group = new THREE.Group();
  const settings = config.visualStyle === "mediterranean-illustrated"
    ? SETTINGS
    : CLASSIC_SETTINGS;
  const coastlineRecords = await loadLocalCoastlines(config);
  const coastlines = coastlineRecords.map(({ line }) => line);
  const structureIds = new Set(config.coastalStructures.map(({ featureId }) => featureId));
  const breakerCoastlines = structureIds.size
    ? coastlineRecords.filter(({ featureId }) => !featureId || !structureIds.has(featureId)).map(({ line }) => line)
    : [createBreakerCoastline(coastlines, config)];
  const isValidSeaPoint = createSeaPointPredicate(coastlines, config);
  const geometry = new THREE.PlaneGeometry(
    sizeX,
    sizeZ,
    structureIds.size ? config.terrain.width - 1 : 96,
    structureIds.size ? config.terrain.height - 1 : 180
  );
  geometry.setAttribute(
    "coastMask",
    new THREE.Float32BufferAttribute(createCoastMask(geometry, coastlines, config), 1)
  );
  geometry.setAttribute(
    "shoreDistance",
    new THREE.Float32BufferAttribute(
      config.visualStyle === "mediterranean-illustrated"
        ? createShoreDistance(geometry, coastlines)
        : new Float32Array(geometry.attributes.position.count),
      1
    )
  );
  const normalMap = await loadTexture(
    "/terrain/textures/mediterranean-waves-normal.webp"
  );
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  // Escala intencionadamente sobredimensionada: el agua se lee como parte
  // ilustrada de la maqueta, no como una reproducción métrica del oleaje.
  normalMap.repeat.set(1.15, 2.3);
  const uniforms = {
    waveTime: { value: 0 },
    waveAmplitude: { value: settings.moderate.amplitude },
    waveLength: { value: settings.moderate.wavelength },
    waveSpeed: { value: settings.moderate.speed },
    crestHeight: { value: settings.moderate.crestHeight },
    waterMode: { value: config.visualStyle === "mediterranean-illustrated" ? 1 : 0 },
    illustratedStyle: { value: config.visualStyle === "mediterranean-illustrated" ? 1 : 0 },
    sunVector: { value: new THREE.Vector3(0, 1, 0) },
    sunVisible: { value: 1 }
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: config.visualStyle === "mediterranean-illustrated" ? "#279b9c" : "#55a9aa",
    roughness: config.visualStyle === "mediterranean-illustrated" ? .68 : .4,
    metalness: 0,
    clearcoat: config.visualStyle === "mediterranean-illustrated" ? .08 : .24,
    clearcoatRoughness: config.visualStyle === "mediterranean-illustrated" ? .72 : .5,
    sheen: config.visualStyle === "mediterranean-illustrated" ? .18 : 0,
    sheenColor: new THREE.Color("#b9fff1"),
    transparent: true,
    opacity: .98,
    normalMap: config.visualStyle === "mediterranean-illustrated" ? null : normalMap,
    normalScale: new THREE.Vector2(.35, .35)
  });
  material.onBeforeCompile = (shader) => {
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
        uniform float illustratedStyle;`
      )
      .replace(
        "#include <beginnormal_vertex>",
        `float normalSurfZone = smoothstep(7.0, 24.0, shoreDistance)
          * (1.0 - smoothstep(105.0, 175.0, shoreDistance));
        float normalPhase = shoreDistance * 6.2831853 / max(18.0, waveLength)
          + waveTime * waveSpeed * .13
          + sin(position.y * .026) * .58;
        float waveSlope = cos(normalPhase) * normalSurfZone * crestHeight * .075 * waterMode;
        vec3 objectNormal = normalize(vec3(-waveSlope, 0.0, 1.0));`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vCoastMask = coastMask;
        vShoreDistance = shoreDistance;
        vSeaCoordinates = position.xy;
        vWaveCrest = 0.0;
        float wavePhase = waveTime * waveSpeed;
        float seaWave = sin((position.x + wavePhase) * 6.2831853 / waveLength);
        seaWave += 0.42 * sin((position.y * 0.72 - wavePhase * 0.63) * 6.2831853 / (waveLength * 0.57));
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
        float coastalWave = sin(coastalPhase);
        float crest = pow(max(0.0, coastalWave), 4.0);
        float openWaterPattern = (
          sin(position.x * .027 + waveTime * .31)
          * sin(position.y * .021 - waveTime * .23)
        );
        float openWater = (openWaterPattern * .45 + .55) * waveAmplitude;
        // El volumen nunca baja del plano marino: el seno modifica el hombro
        // de la ola, mientras la cresta aporta toda la elevación principal.
        float breakingProfile = max(0.0, coastalWave * .13 + .14)
          + crest * .86;
        float volumeHeight = openWater + surfZone * breakingProfile * crestHeight;
        vWaveCrest = crest * surfZone * waterMode;
        transformed.x -= crest * surfZone * crestHeight * .22 * waterMode;
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
  };
  const surface = new THREE.Mesh(geometry, material);
  surface.rotateX(-Math.PI / 2);
  surface.position.y = config.seaLevelMeters;
  surface.receiveShadow = true;
  group.add(surface);

  const breakers = Array.from({ length: SETTINGS.rough.breakerCount }, (_, index) =>
    createBreaker(breakerCoastlines, index, config, isValidSeaPoint)
  );
  for (const breaker of breakers) group.add(breaker.mesh, breaker.foam);

  let state: SeaState = "moderate";
  let lastElapsedSeconds = 0;
  let currentSettings: SeaSettings = { ...settings.moderate };
  let targetSettings: SeaSettings = { ...settings.moderate };
  let mode: WaterMode = config.visualStyle === "mediterranean-illustrated"
    ? "volumetric"
    : "legacy";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const setConditions = (conditions: SeaConditions) => {
    state = conditions.state;
    const setting = settings[conditions.state];
    targetSettings = conditions.source === "marine-data"
      ? settingsForMarineData(setting, conditions)
      : { ...setting };
    breakers.forEach((breaker, index) => {
      breaker.mesh.visible = config.visualStyle !== "mediterranean-illustrated"
        && index < setting.breakerCount;
      breaker.foam.visible = mode === "legacy" && index < setting.breakerCount;
    });
  };
  setConditions({ state, source: "fallback" });
  const setMode = (next: WaterMode) => {
    mode = next;
    uniforms.waterMode.value = next === "volumetric" ? 1 : 0;
    setConditions({ state, source: "debug" });
  };

  return {
    group,
    update(elapsedSeconds) {
      const time = reducedMotion ? 0 : elapsedSeconds;
      const delta = Math.max(0, Math.min(.1, elapsedSeconds - lastElapsedSeconds));
      lastElapsedSeconds = elapsedSeconds;
      const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * 3.2);
      interpolateSettings(currentSettings, targetSettings, blend);
      uniforms.waveAmplitude.value = currentSettings.amplitude;
      uniforms.waveLength.value = currentSettings.wavelength;
      uniforms.waveSpeed.value = currentSettings.speed;
      uniforms.crestHeight.value = currentSettings.crestHeight;
      material.normalScale.setScalar(currentSettings.textureStrength);
      uniforms.waveTime.value = time;
      const setting = currentSettings;
      normalMap.offset.set(time * setting.textureSpeed * .37, -time * setting.textureSpeed);
      breakers.forEach((breaker, index) => {
        if (!breaker.mesh.visible && !breaker.foam.visible) return;
        // 1 → 0: cada cresta nace mar adentro y rompe al alcanzar la costa.
        const progress = reducedMotion
          ? (index + 1) / (setting.breakerCount + 1)
          : 1 - ((time * setting.speed * .055 + index / setting.breakerCount) % 1);
        const approach = progress * progress;
        updateBreaker(
          breaker,
          setting.shoreGap + approach * setting.breakerSpacing,
          setting.breakerWidth * (1.12 - progress * .32),
          setting.crestHeight * (.3 + (1 - progress) * .7),
          setting.breakerOpacity * Math.sin(Math.PI * (.06 + progress * .88))
        );
        breaker.material.opacity = setting.breakerOpacity;
        breaker.foamMaterial.uniforms.pointSize.value = 20 + setting.breakerWidth * .65;
      });
    },
    setConditions,
    setMode,
    setSun(vector, visible) {
      uniforms.sunVector.value.set(vector.x, vector.y, vector.z);
      uniforms.sunVisible.value = visible ? 1 : 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      normalMap.dispose();
      breakers.forEach(({
        geometry: breakerGeometry,
        material: breakerMaterial,
        foamGeometry,
        foamMaterial
      }) => {
        breakerGeometry.dispose();
        breakerMaterial.dispose();
        foamGeometry.dispose();
        foamMaterial.dispose();
      });
    }
  };
}

function settingsForMarineData(base: SeaSettings, conditions: SeaConditions): SeaSettings {
  const height = conditions.waveHeightMeters ?? representativeHeight(conditions.state);
  const period = conditions.periodSeconds ?? 5;
  const heightScale = THREE.MathUtils.clamp(height / representativeHeight(conditions.state), .72, 1.38);
  const periodScale = THREE.MathUtils.clamp(period / 5, .72, 1.45);
  return {
    ...base,
    amplitude: base.amplitude * (.72 + heightScale * .28),
    crestHeight: base.crestHeight * (.68 + heightScale * .32),
    breakerWidth: base.breakerWidth * (.8 + heightScale * .2),
    wavelength: base.wavelength * periodScale,
    speed: base.speed / periodScale,
    textureStrength: base.textureStrength * (.8 + heightScale * .2),
    textureSpeed: base.textureSpeed / periodScale
  };
}

function representativeHeight(state: SeaState) {
  return state === "calm" ? .25 : state === "moderate" ? .65 : 1.2;
}

function interpolateSettings(current: SeaSettings, target: SeaSettings, amount: number) {
  for (const key of Object.keys(current) as Array<keyof SeaSettings>) {
    current[key] = THREE.MathUtils.lerp(current[key], target[key], amount);
  }
}

function createShoreDistance(
  geometry: THREE.PlaneGeometry,
  coastlines: CoastLine[]
): number[] {
  const segments = coastlines.flatMap((line) =>
    line.slice(1).map((point, index) => [line[index], point] as [CoastLine[number], CoastLine[number]])
  );
  const positions = geometry.attributes.position;
  const distances: number[] = [];
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = -positions.getY(index);
    let nearest = Number.POSITIVE_INFINITY;
    for (const [a, b] of segments) {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const lengthSquared = dx * dx + dz * dz || 1;
      const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared, 0, 1);
      nearest = Math.min(nearest, Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz)));
    }
    distances.push(nearest);
  }
  return distances;
}

function createBreakerCoastline(coastlines: CoastLine[], config: BeachConfig): CoastLine {
  const centerX = (config.projectedBounds.west + config.projectedBounds.east) / 2;
  const centerZ = (config.projectedBounds.south + config.projectedBounds.north) / 2;
  const start: [number, number] = [
    config.shoreline.start.x - centerX,
    config.shoreline.start.z - centerZ
  ];
  const end: [number, number] = [
    config.shoreline.end.x - centerX,
    config.shoreline.end.z - centerZ
  ];
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  const sampleCount = Math.max(12, Math.round(length / 12));
  const envelope = coastlineEnvelope(coastlines, config.seaSide);
  const coast = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const progress = index / sampleCount;
    const targetZ = start[1] + dz * progress;
    return [coastXAt(envelope, targetZ), targetZ] as [number, number];
  });
  if (coast.length < 3) {
    throw new Error(`La costa oficial de ${config.name} no contiene puntos suficientes para el oleaje`);
  }
  return coast;
}

function createCoastMask(
  geometry: THREE.PlaneGeometry,
  coastlines: CoastLine[],
  config: BeachConfig
): number[] {
  const coast = coastlineEnvelope(coastlines, config.seaSide);
  const landPolygon = config.coastalStructures.length
    ? landPolygonFromCoastlines(
      coastlines,
      config.seaSide,
      (config.projectedBounds.east - config.projectedBounds.west) / 2,
      (config.projectedBounds.north - config.projectedBounds.south) / 2
    )
    : undefined;
  const positions = geometry.attributes.position;
  const mask: number[] = [];
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    // PlaneGeometry se rota después -90°: su Y local positivo apunta al sur.
    const z = -positions.getY(index);
    // En la costa oriental de Mojácar, el mar queda al este (X UTM mayor).
    const isSea = landPolygon
      ? !isPointInPolygon([x, z], landPolygon)
      : isSeaPoint(coast, x, z, config.seaSide, 1.5);
    mask.push(isSea ? 1 : 0);
  }
  return mask;
}

function createSeaPointPredicate(coastlines: CoastLine[], config: BeachConfig) {
  const coast = coastlineEnvelope(coastlines, config.seaSide);
  const landPolygon = config.coastalStructures.length
    ? landPolygonFromCoastlines(
      coastlines,
      config.seaSide,
      (config.projectedBounds.east - config.projectedBounds.west) / 2,
      (config.projectedBounds.north - config.projectedBounds.south) / 2
    )
    : undefined;
  return (x: number, z: number) => landPolygon
    ? !isPointInPolygon([x, z], landPolygon)
    : isSeaPoint(coast, x, z, config.seaSide, 2);
}

type Breaker = {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  foam: THREE.Points;
  foamGeometry: THREE.BufferGeometry;
  foamMaterial: THREE.ShaderMaterial;
  coast: Array<{ x: number; z: number; nx: number; nz: number }>;
  halfWidth: number;
  halfDepth: number;
  seaLevel: number;
  isSeaPoint(x: number, z: number): boolean;
};

function createBreaker(
  coastlines: CoastLine[],
  index: number,
  config: BeachConfig,
  isValidSeaPoint: (x: number, z: number) => boolean
): Breaker {
  const coast = coastlines.flatMap((line) => withSeaNormals(line));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(coast.length * 4 * 3), 3));
  geometry.setAttribute("foamAlpha", new THREE.BufferAttribute(new Float32Array(coast.length * 4), 1));
  geometry.setAttribute("foamCoordinate", new THREE.BufferAttribute(new Float32Array(coast.length * 4 * 2), 2));
  const indices: number[] = [];
  let cursor = 0;
  for (const line of coastlines) {
    for (let point = 0; point < line.length - 1; point++) {
      const offset = cursor + point * 4;
      for (let band = 0; band < 3; band++) {
        indices.push(
          offset + band,
          offset + band + 1,
          offset + 4 + band,
          offset + band + 1,
          offset + 5 + band,
          offset + 4 + band
        );
      }
    }
    cursor += line.length * 4;
  }
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
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
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3;
  const foamGeometry = new THREE.BufferGeometry();
  foamGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(coast.length * 3), 3));
  foamGeometry.setAttribute("foamStrength", new THREE.BufferAttribute(new Float32Array(coast.length), 1));
  const foamMaterial = new THREE.ShaderMaterial({
    uniforms: { pointSize: { value: 24 } },
    transparent: true,
    depthWrite: false,
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
  });
  const foam = new THREE.Points(foamGeometry, foamMaterial);
  foam.renderOrder = 4;
  const breaker = {
    mesh,
    geometry,
    material,
    foam,
    foamGeometry,
    foamMaterial,
    coast,
    halfWidth: (config.projectedBounds.east - config.projectedBounds.west) / 2,
    halfDepth: (config.projectedBounds.north - config.projectedBounds.south) / 2,
    seaLevel: config.seaLevelMeters,
    isSeaPoint: isValidSeaPoint
  };
  updateBreaker(breaker, 20 + index * 15, 10, 2, .4);
  return breaker;

  function withSeaNormals(line: CoastLine) {
    return line.map(([x, z], point) => {
      const previous = line[Math.max(0, point - 1)];
      const next = line[Math.min(line.length - 1, point + 1)];
      const dx = next[0] - previous[0];
      const dz = next[1] - previous[1];
      const normal = seawardNormal(dx, dz, config.seaSide);
      return { x, z, nx: normal.x, nz: normal.z };
    });
  }
}

function updateBreaker(
  breaker: Breaker,
  offshoreDistance: number,
  width: number,
  crestHeight: number,
  opacity: number
) {
  const positions = breaker.geometry.attributes.position.array as Float32Array;
  const alphas = breaker.geometry.attributes.foamAlpha.array as Float32Array;
  const foamCoordinates = breaker.geometry.attributes.foamCoordinate.array as Float32Array;
  const foamPositions = breaker.foamGeometry.attributes.position.array as Float32Array;
  const foamStrengths = breaker.foamGeometry.attributes.foamStrength.array as Float32Array;
  let along = 0;
  breaker.coast.forEach((point, index) => {
    if (index > 0) {
      const previous = breaker.coast[index - 1];
      along += Math.hypot(point.x - previous.x, point.z - previous.z);
    }
    for (let band = 0; band < 4; band++) {
      // El frente tiene cuerpo: una cola difusa, una cresta elevada y espuma
      // que se extiende hacia tierra sin alcanzar nunca la línea litoral.
      const profile = [1, .58, .25, 0];
      const distance = offshoreDistance + (profile[band] - .25) * width;
      const x = point.x + point.nx * distance;
      const z = point.z + point.nz * distance;
      const offset = (index * 4 + band) * 3;
      positions[offset] = THREE.MathUtils.clamp(
        x,
        -breaker.halfWidth,
        breaker.halfWidth
      );
      const crestProfile = band === 2 ? 1 : band === 1 ? .34 : band === 3 ? .18 : .04;
      positions[offset + 1] = breaker.seaLevel + .35
        + crestHeight * crestProfile
        + Math.sin(along * .085 + offshoreDistance * .1) * crestHeight * .09;
      positions[offset + 2] = THREE.MathUtils.clamp(
        z,
        -breaker.halfDepth,
        breaker.halfDepth
      );
      // Una única masa de espuma con máximo en la cresta. Los extremos
      // transparentes evitan leer las subdivisiones como líneas paralelas.
      const bandAlpha = [0, .12, 1, 0][band];
      alphas[index * 4 + band] = breaker.isSeaPoint(x, z)
        ? opacity * bandAlpha
        : 0;
      foamCoordinates[(index * 4 + band) * 2] = along;
      foamCoordinates[(index * 4 + band) * 2 + 1] = band / 3;
    }
    // El radio visual de cada cúmulo necesita más margen que su centro:
    // la espuma se coloca mar adentro y se descarta en los bordes del chunk.
    const foamDistance = offshoreDistance + width * .2;
    const foamX = point.x + point.nx * foamDistance;
    const foamZ = point.z + point.nz * foamDistance;
    foamPositions[index * 3] = foamX;
    foamPositions[index * 3 + 1] = breaker.seaLevel + crestHeight * .92 + .8;
    foamPositions[index * 3 + 2] = foamZ;
    const clump = .35 + .65 * Math.max(0, Math.sin(along * .09) * Math.sin(along * .037 + 1.4));
    const boundsMargin = Math.max(10, width * .8);
    const insideBounds = Math.abs(foamX) < breaker.halfWidth - boundsMargin
      && Math.abs(foamZ) < breaker.halfDepth - boundsMargin;
    foamStrengths[index] = insideBounds && breaker.isSeaPoint(foamX, foamZ)
      ? Math.max(.58, opacity) * (.62 + .38 * clump)
      : 0;
  });
  breaker.geometry.attributes.position.needsUpdate = true;
  breaker.geometry.attributes.foamAlpha.needsUpdate = true;
  breaker.geometry.attributes.foamCoordinate.needsUpdate = true;
  breaker.foamGeometry.attributes.position.needsUpdate = true;
  breaker.foamGeometry.attributes.foamStrength.needsUpdate = true;
  breaker.foamGeometry.computeBoundingSphere();
  breaker.geometry.computeVertexNormals();
  breaker.geometry.computeBoundingSphere();
}

async function loadLocalCoastlines(config: BeachConfig): Promise<LocalCoastline[]> {
  const data = await loadJson<GeoJSON>(config.coastlineAsset);
  const centerX = (config.projectedBounds.west + config.projectedBounds.east) / 2;
  const centerZ = (config.projectedBounds.south + config.projectedBounds.north) / 2;
  return data.features.flatMap((feature) => {
    const lines = feature.geometry.type === "MultiLineString"
      ? feature.geometry.coordinates as number[][][]
      : [feature.geometry.coordinates as number[][]];
    return lines.map((line) => ({
      featureId: feature.properties?.id_dera,
      line: line.map(([x, z]) => [x - centerX, z - centerZ] as [number, number])
    }));
  });
}
