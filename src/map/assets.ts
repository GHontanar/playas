import * as THREE from "three";

const jsonCache = new Map<string, Promise<unknown>>();
const floatCache = new Map<string, Promise<Float32Array>>();
const byteCache = new Map<string, Promise<Uint8Array>>();
const textureCache = new Map<string, Promise<THREE.Texture>>();

export function loadJson<T>(url: string): Promise<T> {
  let cached = jsonCache.get(url);
  if (!cached) {
    cached = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`No se pudo cargar ${url} (${response.status})`);
      return response.json();
    });
    jsonCache.set(url, cached);
  }
  return cached as Promise<T>;
}

export function loadFloat32(url: string): Promise<Float32Array> {
  let cached = floatCache.get(url);
  if (!cached) {
    cached = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`No se pudo cargar ${url} (${response.status})`);
      return new Float32Array(await response.arrayBuffer());
    });
    floatCache.set(url, cached);
  }
  return cached;
}

export function loadUint8(url: string): Promise<Uint8Array> {
  let cached = byteCache.get(url);
  if (!cached) {
    cached = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`No se pudo cargar ${url} (${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    });
    byteCache.set(url, cached);
  }
  return cached;
}

export function loadTexture(url: string): Promise<THREE.Texture> {
  let cached = textureCache.get(url);
  if (!cached) {
    cached = new THREE.TextureLoader().loadAsync(url);
    textureCache.set(url, cached);
  }
  return cached;
}

export function prefetchJson(url: string): void {
  void loadJson(url).catch(() => undefined);
}

export function prefetchTexture(url: string): void {
  void loadTexture(url).catch(() => undefined);
}
