import * as THREE from 'three';

export const SLIPPER_MODEL_URL = `${import.meta.env.BASE_URL}models/cabin/open-cabin.glb`;

export interface SlipperPart { geometry: THREE.BufferGeometry; material: THREE.Material }
export interface SlipperSide { parts: SlipperPart[]; center: [number, number]; radius: number }
export interface SlipperModel { left: SlipperSide; right: SlipperSide }

export function isSlipperMaterial(material: THREE.Material | THREE.Material[] | undefined) {
  const list = Array.isArray(material) ? material : material ? [material] : [];
  return list.length > 0 && list.every(item => item.name.startsWith('Slipper'));
}

interface Primitive {
  position: THREE.BufferAttribute;
  normal: THREE.BufferAttribute | undefined;
  uv: THREE.BufferAttribute | undefined;
  index: THREE.BufferAttribute | null;
  matrix: THREE.Matrix4;
  material: THREE.Material;
}

let cached: SlipperModel | null | undefined;

/** The cabin exports the rug and both slippers as one mesh; split them back into kickable props. */
export function extractSlipperModel(scene: THREE.Object3D): SlipperModel | null {
  if (cached !== undefined) return cached;
  try { cached = build(scene); } catch { cached = null; }
  return cached;
}

function build(scene: THREE.Object3D): SlipperModel | null {
  scene.updateMatrixWorld(true);
  const primitives: Primitive[] = [];
  scene.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !isSlipperMaterial(node.material)) return;
    const position = node.geometry.getAttribute('position');
    if (!(position instanceof THREE.BufferAttribute)) return;
    primitives.push({
      position,
      normal: node.geometry.getAttribute('normal') as THREE.BufferAttribute | undefined,
      uv: node.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined,
      index: node.geometry.getIndex(),
      matrix: node.matrixWorld.clone(),
      material: Array.isArray(node.material) ? node.material[0] : node.material,
    });
  });
  if (!primitives.length) return null;

  const point = new THREE.Vector3(), centroid = new THREE.Vector3();
  const centroidX = (primitive: Primitive, a: number, b: number, c: number) => {
    centroid.set(0, 0, 0);
    for (const vertex of [a, b, c]) {
      point.fromBufferAttribute(primitive.position, vertex).applyMatrix4(primitive.matrix);
      centroid.add(point);
    }
    return centroid.x / 3;
  };

  const samples: number[] = [];
  for (const primitive of primitives) {
    const count = primitive.index ? primitive.index.count : primitive.position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const a = primitive.index ? primitive.index.getX(i) : i;
      const b = primitive.index ? primitive.index.getX(i + 1) : i + 1;
      const c = primitive.index ? primitive.index.getX(i + 2) : i + 2;
      samples.push(centroidX(primitive, a, b, c));
    }
  }
  if (!samples.length) return null;

  // Two clusters along X keep one slipper on each side even if the pair is not centered on the rug.
  let low = Math.min(...samples), high = Math.max(...samples);
  for (let pass = 0; pass < 8 && high - low > 1e-4; pass++) {
    let lowSum = 0, lowCount = 0, highSum = 0, highCount = 0;
    for (const value of samples) {
      if (Math.abs(value - low) <= Math.abs(value - high)) { lowSum += value; lowCount++; }
      else { highSum += value; highCount++; }
    }
    if (!lowCount || !highCount) break;
    low = lowSum / lowCount;
    high = highSum / highCount;
  }
  const split = (low + high) / 2;

  const sideMeshes = [0, 1].map(side => primitives.map(primitive => {
    const source = primitive.position;
    const count = primitive.index ? primitive.index.count : source.count;
    const vertices: number[] = [];
    for (let i = 0; i + 2 < count; i += 3) {
      const a = primitive.index ? primitive.index.getX(i) : i;
      const b = primitive.index ? primitive.index.getX(i + 1) : i + 1;
      const c = primitive.index ? primitive.index.getX(i + 2) : i + 2;
      if ((centroidX(primitive, a, b, c) < split ? 0 : 1) !== side) continue;
      vertices.push(a, b, c);
    }
    if (!vertices.length) return null;

    const positions = new Float32Array(vertices.length * 3);
    const normals = primitive.normal ? new Float32Array(vertices.length * 3) : undefined;
    const uvs = primitive.uv ? new Float32Array(vertices.length * 2) : undefined;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(primitive.matrix);
    vertices.forEach((vertex, i) => {
      point.fromBufferAttribute(source, vertex).applyMatrix4(primitive.matrix);
      positions.set([point.x, point.y, point.z], i * 3);
      if (normals && primitive.normal) {
        point.fromBufferAttribute(primitive.normal, vertex).applyMatrix3(normalMatrix).normalize();
        normals.set([point.x, point.y, point.z], i * 3);
      }
      if (uvs && primitive.uv) uvs.set([primitive.uv.getX(vertex), primitive.uv.getY(vertex)], i * 2);
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (normals) geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    if (uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.computeBoundingBox();
    return { geometry, material: primitive.material };
  }));

  const sides = sideMeshes.map(parts => {
    const meshes = parts.filter((part): part is SlipperPart => !!part);
    if (!meshes.length) return null;
    const bounds = new THREE.Box3();
    for (const part of meshes) { part.geometry.computeBoundingBox(); bounds.union(part.geometry.boundingBox!); }
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    for (const part of meshes) part.geometry.translate(-center.x, 0, -center.z);
    return {
      parts: meshes,
      center: [center.x, center.z] as [number, number],
      radius: THREE.MathUtils.clamp(Math.max(size.x, size.z) * 0.35, 0.09, 0.16),
    };
  });
  if (!sides[0] || !sides[1]) return null;
  return { left: sides[0], right: sides[1] };
}
