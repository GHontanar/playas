import * as THREE from "three";
import { FOAM_POINTS_SHADER, patchSeaSurfaceShader, SHORE_RIBBON_SHADER } from "./seaShader";
import type { BeachConfig } from "../beaches/types";
import {
  alongOf,
  coastAt,
  coastalFloodMask,
  coastlineEnvelope,
  crossOf,
  isPointInPolygon,
  isSeaPoint,
  landPolygonFromCoastlines,
  recompose,
  seawardNormal,
  seawardSign,
  type CoastLine
} from "./coastalOrientation";
import type { Vector3Like } from "../solar/sunVector";
import { loadJson, loadTexture } from "./assets";
import { waveTravelVector } from "../waves/waveDirection";

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
  config: BeachConfig,
  terrainHeights: Float32Array
): Promise<SeaController> {
  const group = new THREE.Group();
  const settings = config.visualStyle === "mediterranean-illustrated"
    ? SETTINGS
    : CLASSIC_SETTINGS;
  const coastlineRecords = await loadLocalCoastlines(config);
  const coastlines = coastlineRecords.map(({ line }) => line);
  const structureIds = new Set(config.coastalStructures.map(({ featureId }) => featureId));
  const structureTip = findSeawardStructureTip(coastlineRecords, structureIds, config.seaSide);
  const breakerCoastlines = structureIds.size
    ? coastlineRecords.filter(({ featureId }) => !featureId || !structureIds.has(featureId)).map(({ line }) => line)
    : [createBreakerCoastline(coastlines, config)];
  const isValidSeaPoint = createSeaPointPredicate(coastlines, config);
  const geometry = new THREE.PlaneGeometry(
    sizeX,
    sizeZ,
    structureIds.size || config.useFloodMask ? config.terrain.width - 1 : 96,
    structureIds.size || config.useFloodMask ? config.terrain.height - 1 : 180
  );
  geometry.setAttribute(
    "coastMask",
    new THREE.Float32BufferAttribute(createCoastMask(geometry, coastlines, config, terrainHeights), 1)
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
    sunVisible: { value: 1 },
    waveDirection: { value: new THREE.Vector2(-1, 0) },
    directionalWaves: { value: 1 },
    structureTip: { value: new THREE.Vector2(structureTip?.[0] ?? 0, -(structureTip?.[1] ?? 0)) },
    structureShelter: { value: structureTip ? 1 : 0 }
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
  material.onBeforeCompile = (shader) => patchSeaSurfaceShader(shader, uniforms);
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
  const currentWaveDirection = new THREE.Vector2(-1, 0);
  const targetWaveDirection = new THREE.Vector2(-1, 0);
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
    if (conditions.directionDegrees != null && Number.isFinite(conditions.directionDegrees)) {
      const direction = waveTravelVector(conditions.directionDegrees);
      // PlaneGeometry usa Y local hacia el sur; el segundo componente se
      // invierte antes de llegar al shader.
      targetWaveDirection.set(direction.x, -direction.z);
    }
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
      currentWaveDirection.lerp(targetWaveDirection, blend).normalize();
      uniforms.waveDirection.value.copy(currentWaveDirection);
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
  const side = config.seaSide;
  const start: [number, number] = [
    config.shoreline.start.x - centerX,
    config.shoreline.start.z - centerZ
  ];
  const end: [number, number] = [
    config.shoreline.end.x - centerX,
    config.shoreline.end.z - centerZ
  ];
  const alongStart = alongOf(side, start[0], start[1]);
  const alongEnd = alongOf(side, end[0], end[1]);
  const length = Math.abs(alongEnd - alongStart);
  const sampleCount = Math.max(12, Math.round(length / 12));
  const envelope = coastlineEnvelope(coastlines, side);
  const coast = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const progress = index / sampleCount;
    const along = alongStart + (alongEnd - alongStart) * progress;
    return recompose(side, along, coastAt(envelope, along, side));
  });
  if (coast.length < 3) {
    throw new Error(`La costa oficial de ${config.name} no contiene puntos suficientes para el oleaje`);
  }
  return coast;
}

function createCoastMask(
  geometry: THREE.PlaneGeometry,
  coastlines: CoastLine[],
  config: BeachConfig,
  terrainHeights: Float32Array
): number[] {
  if (config.coastalStructures.length || config.useFloodMask) {
    return coastalFloodMask(
      coastlines,
      config.seaSide,
      config.terrain.width,
      config.terrain.height,
      (config.projectedBounds.east - config.projectedBounds.west) / 2,
      (config.projectedBounds.north - config.projectedBounds.south) / 2,
      { heightsNorthToSouth: terrainHeights }
    );
  }
  const coast = coastlineEnvelope(coastlines, config.seaSide);
  const positions = geometry.attributes.position;
  const mask: number[] = [];
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    // PlaneGeometry se rota después -90°: su Y local positivo apunta al sur.
    const z = -positions.getY(index);
    // En la costa oriental de Mojácar, el mar queda al este (X UTM mayor).
    const isSea = isSeaPoint(coast, x, z, config.seaSide, 1.5);
    mask.push(isSea ? 1 : 0);
  }
  return mask;
}

function createSeaPointPredicate(coastlines: CoastLine[], config: BeachConfig) {
  const coast = coastlineEnvelope(coastlines, config.seaSide);
  const landPolygon = config.coastalStructures.length || config.useFloodMask
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
    ...SHORE_RIBBON_SHADER
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
    ...FOAM_POINTS_SHADER
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

function findSeawardStructureTip(
  records: LocalCoastline[],
  structureIds: Set<number>,
  seaSide: BeachConfig["seaSide"]
): [number, number] | undefined {
  const sign = seawardSign(seaSide);
  const points = records
    .filter(({ featureId }) => featureId != null && structureIds.has(featureId))
    .flatMap(({ line }) => line);
  if (!points.length) return undefined;
  return points.reduce((tip, point) => {
    const fartherSeaward = sign === 1
      ? crossOf(seaSide, point[0], point[1]) > crossOf(seaSide, tip[0], tip[1])
      : crossOf(seaSide, point[0], point[1]) < crossOf(seaSide, tip[0], tip[1]);
    return fartherSeaward ? point : tip;
  });
}
