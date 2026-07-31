import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";
import { classifyWindForBeach, windFlowVector, type WindRelation } from "../wind/windDirection";

export type WindGlyph = {
  relation: WindRelation | null;
  setConditions(speedKmh: number | null | undefined, fromDegrees: number | null | undefined, gustKmh?: number | null): WindRelation | null;
  setSolarAppearance(altitudeDegrees: number, aboveHorizon: boolean): void;
  setVisible(value: boolean): void;
  update(elapsedSeconds: number): void;
  dispose(): void;
};

export function createWindGlyph(config: BeachConfig, container: HTMLElement): WindGlyph {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: window.devicePixelRatio <= 1.5 });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.55, 1.55, 1.55, -1.55, .1, 20);
  const bearing = THREE.MathUtils.degToRad(config.camera.bearing);
  const pitch = THREE.MathUtils.degToRad(32);
  camera.position.set(Math.sin(bearing) * Math.cos(pitch) * 7, Math.sin(pitch) * 7, Math.cos(bearing) * Math.cos(pitch) * 7);
  camera.lookAt(0, .15, 0);

  scene.add(new THREE.HemisphereLight("#fff4d5", "#243b48", 2.1));
  const key = new THREE.DirectionalLight("#ffffff", 2.5);
  key.position.set(-3, 5, 4);
  scene.add(key);

  // El mismo sistema local que la maqueta: X este, Z norte. El espejo Z
  // convierte después esas coordenadas geográficas al sistema de Three.js.
  const geographicWorld = new THREE.Group();
  geographicWorld.scale.z = -1;
  scene.add(geographicWorld);

  const baseMaterial = new THREE.MeshToonMaterial({ color: "#315d59" });
  const topMaterial = new THREE.MeshToonMaterial({ color: "#d8ba7b" });
  const edgeMaterial = new THREE.MeshToonMaterial({ color: "#173a3d" });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.48, .48, 1.48), baseMaterial);
  base.position.y = -.55;
  geographicWorld.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, .09, 1.3), topMaterial);
  top.position.y = -.265;
  geographicWorld.add(top);

  const roseMaterial = createCompassRoseMaterial(renderer.capabilities.getMaxAnisotropy());
  const rose = new THREE.Mesh(new THREE.PlaneGeometry(2.86, 2.86), roseMaterial);
  rose.rotation.x = -Math.PI / 2;
  rose.position.y = -.16;
  geographicWorld.add(rose);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.055, .075, 1.08, 12), edgeMaterial);
  mast.position.y = .29;
  geographicWorld.add(mast);
  const windRoot = new THREE.Group();
  windRoot.position.y = .76;
  geographicWorld.add(windRoot);
  const windMaterial = new THREE.MeshToonMaterial({
    vertexColors: true,
    emissive: "#7d2715",
    emissiveIntensity: .12,
    side: THREE.DoubleSide
  });
  const sockGeometry = createWindsockGeometry();
  const sock = new THREE.Mesh(sockGeometry, windMaterial);
  sock.position.x = .07;
  windRoot.add(sock);
  const mouthMaterial = new THREE.MeshToonMaterial({ color: "#fff0cf", emissive: "#d8662f", emissiveIntensity: .12 });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.255, .035, 16, 48), mouthMaterial);
  mouth.rotation.y = Math.PI / 2;
  mouth.position.x = .07;
  windRoot.add(mouth);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(.105, 14, 10), edgeMaterial);
  windRoot.add(hub);
  const disposables: THREE.BufferGeometry[] = [base.geometry, top.geometry, rose.geometry, mast.geometry, sockGeometry, mouth.geometry, hub.geometry];

  let requestedVisible = true;
  let hasData = false;
  let currentYaw = 0;
  let targetYaw = 0;
  let gustWobble = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const result: WindGlyph = {
    relation: null,
    setConditions(speedKmh, fromDegrees, gustKmh) {
      hasData = speedKmh != null && fromDegrees != null && Number.isFinite(speedKmh) && Number.isFinite(fromDegrees);
      container.hidden = !requestedVisible || !hasData;
      if (!hasData) {
        result.relation = null;
        return null;
      }
      const speed = speedKmh as number;
      const direction = fromDegrees as number;
      const flow = windFlowVector(direction);
      const relation = classifyWindForBeach(direction, config);
      // La manga se extiende desde el mástil hacia el destino del flujo.
      targetYaw = Math.atan2(-flow.z, flow.x);
      const gustRatio = gustKmh == null ? 0 : THREE.MathUtils.clamp((gustKmh - speed) / Math.max(speed, 10), 0, 1);
      gustWobble = THREE.MathUtils.degToRad(1.5 + gustRatio * 3);
      result.relation = relation;
      return relation;
    },
    setSolarAppearance(altitudeDegrees, aboveHorizon) {
      const daylight = aboveHorizon ? THREE.MathUtils.smoothstep(altitudeDegrees, -2, 24) : 0;
      const warmth = aboveHorizon ? 1 - THREE.MathUtils.smoothstep(altitudeDegrees, 3, 20) : 0;
      baseMaterial.color.copy(new THREE.Color("#29384a")).lerp(new THREE.Color("#315d59"), daylight).lerp(new THREE.Color("#78505a"), warmth * .72);
      topMaterial.color.copy(new THREE.Color("#73808d")).lerp(new THREE.Color("#d8ba7b"), daylight).lerp(new THREE.Color("#e09769"), warmth * .78);
    },
    setVisible(value) {
      requestedVisible = value;
      container.hidden = !requestedVisible || !hasData;
    },
    update(elapsedSeconds) {
      if (container.hidden) return;
      const delta = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw));
      currentYaw += delta * .1;
      windRoot.rotation.y = currentYaw + (reducedMotion ? 0 : Math.sin(elapsedSeconds * 1.7) * gustWobble);
      renderer.render(scene, camera);
    },
    dispose() {
      observer.disconnect();
      disposables.forEach((geometry) => geometry.dispose());
      roseMaterial.map?.dispose();
      [baseMaterial, topMaterial, edgeMaterial, roseMaterial, mouthMaterial, windMaterial].forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
  return result;
}

function createCompassRoseMaterial(anisotropy: number): THREE.MeshBasicMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 2048;
  const context = canvas.getContext("2d")!;
  context.scale(2, 2);
  context.translate(512, 512);
  // Compensa el scale.z negativo del mundo geográfico. Las posiciones N/S se
  // intercambian al dibujar para conservar su ubicación después del espejo.
  context.scale(1, -1);
  context.strokeStyle = "#102f38";
  context.lineCap = "round";
  context.lineWidth = 38;
  context.beginPath();
  context.arc(0, 0, 355, 0, Math.PI * 2);
  context.stroke();
  for (let index = 0; index < 16; index++) {
    const angle = index * Math.PI / 8;
    const cardinal = index % 4 === 0;
    context.lineWidth = cardinal ? 28 : 15;
    context.beginPath();
    context.moveTo(Math.sin(angle) * (cardinal ? 270 : 307), Math.cos(angle) * (cardinal ? 270 : 307));
    context.lineTo(Math.sin(angle) * 397, Math.cos(angle) * 397);
    context.stroke();
  }
  const labels: Array<[string, number, number, boolean]> = [
    ["N", 0, -438, true], ["E", 438, 0, false], ["S", 0, 438, false], ["O", -438, 0, false]
  ];
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  labels.forEach(([label, x, y, north]) => {
    context.beginPath();
    context.fillStyle = north ? "#f06d5f" : "#102f38";
    context.arc(x, y, north ? 79 : 67, 0, Math.PI * 2);
    context.fill();
    context.font = `700 ${north ? 142 : 116}px Georgia, "Times New Roman", serif`;
    context.fillStyle = north ? "#173a3d" : "#fff4d5";
    context.fillText(label, x, y);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
}

function createWindsockGeometry(): THREE.BufferGeometry {
  const lengthSegments = 56;
  const radialSegments = 28;
  const positions: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  const orange = new THREE.Color("#ff6d28");
  const lightOrange = new THREE.Color("#ffad55");
  for (let segment = 0; segment <= lengthSegments; segment++) {
    const t = segment / lengthSegments;
    const x = t * 1.2;
    const radius = THREE.MathUtils.lerp(.25, .065, Math.pow(t, .82));
    const tipFall = THREE.MathUtils.smoothstep(t, .52, 1);
    const centreY = -.12 * t * t - .27 * tipFall * tipFall;
    const centreZ = Math.sin(t * Math.PI) * .055;
    const band = Math.floor(t * 7) % 2;
    const colour = band === 0 ? orange : lightOrange;
    for (let radial = 0; radial <= radialSegments; radial++) {
      const angle = radial / radialSegments * Math.PI * 2;
      positions.push(x, centreY + Math.cos(angle) * radius, centreZ + Math.sin(angle) * radius);
      colours.push(colour.r, colour.g, colour.b);
      if (segment < lengthSegments && radial < radialSegments) {
        const row = radialSegments + 1;
        const a = segment * row + radial;
        indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
