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

export const SEA_STATES = ["calm", "moderate", "rough"] as const;
export type SeaState = typeof SEA_STATES[number];

type SeaSettings = {
  amplitude: number;
  wavelength: number;
  speed: number;
  breakerCount: number;
  breakerSpacing: number;
  breakerWidth: number;
  breakerOpacity: number;
  shoreGap: number;
  textureStrength: number;
  textureSpeed: number;
};

const SETTINGS: Record<SeaState, SeaSettings> = {
  calm: { amplitude: .55, wavelength: 74, speed: 4, breakerCount: 2, breakerSpacing: 48, breakerWidth: 2.5, breakerOpacity: .3, shoreGap: 3, textureStrength: .46, textureSpeed: .004 },
  moderate: { amplitude: 1.8, wavelength: 52, speed: 8, breakerCount: 3, breakerSpacing: 40, breakerWidth: 4.5, breakerOpacity: .48, shoreGap: 4.5, textureStrength: .82, textureSpeed: .008 },
  rough: { amplitude: 3.2, wavelength: 38, speed: 12, breakerCount: 4, breakerSpacing: 34, breakerWidth: 6.5, breakerOpacity: .62, shoreGap: 5, textureStrength: 1.05, textureSpeed: .012 }
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
  setState(state: SeaState): void;
  dispose(): void;
}

export async function createSea(
  sizeX: number,
  sizeZ: number,
  config: BeachConfig
): Promise<SeaController> {
  const group = new THREE.Group();
  const coastlineRecords = await loadLocalCoastlines(config);
  const coastlines = coastlineRecords.map(({ line }) => line);
  const structureIds = new Set(config.coastalStructures.map(({ featureId }) => featureId));
  const breakerCoastlines = structureIds.size
    ? coastlineRecords.filter(({ featureId }) => !featureId || !structureIds.has(featureId)).map(({ line }) => line)
    : [createBreakerCoastline(coastlines, config)];
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
  const normalMap = await new THREE.TextureLoader().loadAsync(
    "/terrain/textures/mediterranean-waves-normal.webp"
  );
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  // Escala intencionadamente sobredimensionada: el agua se lee como parte
  // ilustrada de la maqueta, no como una reproducción métrica del oleaje.
  normalMap.repeat.set(1.15, 2.3);
  const uniforms = {
    waveTime: { value: 0 },
    waveAmplitude: { value: SETTINGS.moderate.amplitude },
    waveLength: { value: SETTINGS.moderate.wavelength },
    waveSpeed: { value: SETTINGS.moderate.speed }
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: "#55a9aa",
    roughness: .4,
    metalness: 0,
    clearcoat: .24,
    clearcoatRoughness: .5,
    transparent: true,
    opacity: .98,
    normalMap,
    normalScale: new THREE.Vector2(.35, .35)
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float coastMask;
        varying float vCoastMask;
        uniform float waveTime;
        uniform float waveAmplitude;
        uniform float waveLength;
        uniform float waveSpeed;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vCoastMask = coastMask;
        float wavePhase = waveTime * waveSpeed;
        float seaWave = sin((position.x + wavePhase) * 6.2831853 / waveLength);
        seaWave += 0.42 * sin((position.y * 0.72 - wavePhase * 0.63) * 6.2831853 / (waveLength * 0.57));
        // La ola crece sobre el nivel del mar. Evita que una exageración
        // artística abra huecos y deje ver el DEM bajo la superficie.
        transformed.z += (seaWave * 0.35 + 0.55) * waveAmplitude;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vCoastMask;
        uniform float waveTime;`
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
      );
  };
  const surface = new THREE.Mesh(geometry, material);
  surface.rotateX(-Math.PI / 2);
  surface.position.y = config.seaLevelMeters;
  surface.receiveShadow = true;
  group.add(surface);

  const breakers = Array.from({ length: SETTINGS.rough.breakerCount }, (_, index) =>
    createBreaker(breakerCoastlines, index, config)
  );
  for (const breaker of breakers) group.add(breaker.mesh);

  let state: SeaState = "moderate";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const setState = (next: SeaState) => {
    state = next;
    const setting = SETTINGS[next];
    uniforms.waveAmplitude.value = setting.amplitude;
    uniforms.waveLength.value = setting.wavelength;
    uniforms.waveSpeed.value = setting.speed;
    material.normalScale.setScalar(setting.textureStrength);
    breakers.forEach((breaker, index) => {
      breaker.mesh.visible = index < setting.breakerCount;
      breaker.material.opacity = setting.breakerOpacity;
    });
  };
  setState(state);

  return {
    group,
    update(elapsedSeconds) {
      const time = reducedMotion ? 0 : elapsedSeconds;
      uniforms.waveTime.value = time;
      const setting = SETTINGS[state];
      normalMap.offset.set(time * setting.textureSpeed * .37, -time * setting.textureSpeed);
      breakers.forEach((breaker, index) => {
        if (!breaker.mesh.visible) return;
        // 1 → 0: cada cresta nace mar adentro y rompe al alcanzar la costa.
        const progress = reducedMotion
          ? (index + 1) / (setting.breakerCount + 1)
          : 1 - ((time * setting.speed * .055 + index / setting.breakerCount) % 1);
        updateBreaker(
          breaker,
          setting.shoreGap + progress * setting.breakerSpacing * setting.breakerCount,
          setting.breakerWidth
        );
        breaker.material.opacity = setting.breakerOpacity * Math.sin(Math.PI * (.08 + progress * .84));
      });
    },
    setState,
    dispose() {
      geometry.dispose();
      material.dispose();
      normalMap.dispose();
      breakers.forEach(({ geometry: breakerGeometry, material: breakerMaterial }) => {
        breakerGeometry.dispose();
        breakerMaterial.dispose();
      });
    }
  };
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

type Breaker = {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshBasicMaterial;
  coast: Array<{ x: number; z: number; nx: number; nz: number }>;
  halfWidth: number;
  halfDepth: number;
  seaLevel: number;
};

function createBreaker(coastlines: CoastLine[], index: number, config: BeachConfig): Breaker {
  const coast = coastlines.flatMap((line) => withSeaNormals(line));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(coast.length * 2 * 3), 3));
  const indices: number[] = [];
  let cursor = 0;
  for (const line of coastlines) {
    for (let point = 0; point < line.length - 1; point++) {
      const offset = cursor + point * 2;
      indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
    }
    cursor += line.length * 2;
  }
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({
    color: index % 2 ? "#fff8dc" : "#eef8e9",
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3;
  const breaker = {
    mesh,
    geometry,
    material,
    coast,
    halfWidth: (config.projectedBounds.east - config.projectedBounds.west) / 2,
    halfDepth: (config.projectedBounds.north - config.projectedBounds.south) / 2,
    seaLevel: config.seaLevelMeters
  };
  updateBreaker(breaker, 20 + index * 15, 2);
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

function updateBreaker(breaker: Breaker, offshoreDistance: number, width: number) {
  const positions = breaker.geometry.attributes.position.array as Float32Array;
  breaker.coast.forEach((point, index) => {
    for (let edge = 0; edge < 2; edge++) {
      const distance = offshoreDistance + edge * width;
      const offset = (index * 2 + edge) * 3;
      positions[offset] = THREE.MathUtils.clamp(
        point.x + point.nx * distance,
        -breaker.halfWidth,
        breaker.halfWidth
      );
      positions[offset + 1] = breaker.seaLevel + 1.85
        + Math.sin(index * .72 + offshoreDistance * .12) * .32;
      positions[offset + 2] = THREE.MathUtils.clamp(
        point.z + point.nz * distance,
        -breaker.halfDepth,
        breaker.halfDepth
      );
    }
  });
  breaker.geometry.attributes.position.needsUpdate = true;
  breaker.geometry.computeBoundingSphere();
}

async function loadLocalCoastlines(config: BeachConfig): Promise<LocalCoastline[]> {
  const response = await fetch(config.coastlineAsset);
  if (!response.ok) throw new Error(`No se pudo cargar la costa para el oleaje (${response.status})`);
  const data = await response.json() as GeoJSON;
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
