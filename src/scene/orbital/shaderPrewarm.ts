import * as THREE from 'three';

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
  'clearcoatMap',
  'clearcoatRoughnessMap',
  'clearcoatNormalMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularIntensityMap',
  'specularColorMap',
] as const;

export interface WarmupPlan {
  textures: THREE.Texture[];
  batches: THREE.Object3D[][];
}

function collectMaterialTextures(material: THREE.Material, seenTextures: Set<THREE.Texture>, textures: THREE.Texture[]) {
  const record = material as unknown as Record<string, unknown>;
  for (const key of TEXTURE_SLOTS) {
    const value = record[key];
    if (value instanceof THREE.Texture && !seenTextures.has(value)) {
      seenTextures.add(value);
      textures.push(value);
    }
  }
}

function buildCompileProxy(mesh: THREE.Mesh, material: THREE.Material, assumeReceiveShadow: boolean): THREE.Object3D {
  if (mesh instanceof THREE.SkinnedMesh) {
    const proxy = new THREE.SkinnedMesh(mesh.geometry, material);
    proxy.bind(mesh.skeleton, mesh.bindMatrix);
    proxy.castShadow = mesh.castShadow;
    proxy.receiveShadow = assumeReceiveShadow || mesh.receiveShadow;
    proxy.frustumCulled = false;
    return proxy;
  }
  const proxy = new THREE.Mesh(mesh.geometry, material);
  proxy.castShadow = mesh.castShadow;
  proxy.receiveShadow = assumeReceiveShadow || mesh.receiveShadow;
  proxy.morphTargetInfluences = mesh.morphTargetInfluences;
  proxy.morphTargetDictionary = mesh.morphTargetDictionary;
  proxy.frustumCulled = false;
  return proxy;
}

/**
 * Deduplicate materials and textures under `root` and slice them into tiny batches so
 * GPU texture upload and GLSL program compilation can be spread across frames.
 */
export function createWarmupPlan(
  root: THREE.Object3D,
  materialsPerBatch = 3,
  options: { assumeReceiveShadow?: boolean } = {},
): WarmupPlan {
  const seenTextures = new Set<THREE.Texture>();
  const seenMaterials = new Set<string>();
  const textures: THREE.Texture[] = [];
  const proxies: THREE.Object3D[] = [];
  const assumeReceiveShadow = options.assumeReceiveShadow ?? true;

  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      collectMaterialTextures(material, seenTextures, textures);
      const skinnedKey = node instanceof THREE.SkinnedMesh ? '1' : '0';
      const shadowKey = (assumeReceiveShadow || node.receiveShadow) ? '1' : '0';
      const morphKey = node.morphTargetInfluences?.length ? '1' : '0';
      const key = `${material.uuid}:${skinnedKey}:${shadowKey}:${morphKey}`;
      if (seenMaterials.has(key)) continue;
      seenMaterials.add(key);
      proxies.push(buildCompileProxy(node, material, assumeReceiveShadow));
    }
  });

  const step = Math.max(1, Math.floor(materialsPerBatch));
  const batches: THREE.Object3D[][] = [];
  for (let i = 0; i < proxies.length; i += step) {
    batches.push(proxies.slice(i, i + step));
  }
  return { textures, batches };
}

export interface WarmupRunner {
  readonly done: boolean;
  step: (gl: Pick<THREE.WebGLRenderer, 'initTexture' | 'compile'>, scene: THREE.Scene, camera: THREE.Camera) => boolean;
}

export function createWarmupRunner(
  plan: WarmupPlan,
  options: { texturesPerFrame?: number } = {},
): WarmupRunner {
  let texIndex = 0;
  let batchIndex = 0;
  const texturesPerFrame = Math.max(1, Math.floor(options.texturesPerFrame ?? 2));
  const scratchGroup = new THREE.Group();
  scratchGroup.name = '__ShaderWarmupBatch';

  return {
    get done() {
      return texIndex >= plan.textures.length && batchIndex >= plan.batches.length;
    },
    step(gl, scene, camera) {
      if (texIndex < plan.textures.length) {
        const end = Math.min(plan.textures.length, texIndex + texturesPerFrame);
        for (; texIndex < end; texIndex++) {
          gl.initTexture(plan.textures[texIndex]);
        }
        return texIndex >= plan.textures.length && batchIndex >= plan.batches.length;
      }
      if (batchIndex < plan.batches.length) {
        const batch = plan.batches[batchIndex++];
        scratchGroup.clear();
        for (const obj of batch) scratchGroup.add(obj);
        gl.compile(scratchGroup, camera, scene);
        scratchGroup.clear();
      }
      return texIndex >= plan.textures.length && batchIndex >= plan.batches.length;
    },
  };
}
