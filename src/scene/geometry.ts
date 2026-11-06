import * as THREE from 'three';

/**
 * 底部平直、顶部半圆的拱形轮廓；传入 Path 可作为墙体或窗框的镂空洞
 */
export function createArchShape(
  halfWidth: number,
  bottomY: number,
  springY: number,
  centerX = 0,
  target: THREE.Shape | THREE.Path = new THREE.Shape()
) {
  target.moveTo(centerX - halfWidth, bottomY);
  target.lineTo(centerX + halfWidth, bottomY);
  target.lineTo(centerX + halfWidth, springY);
  target.absarc(centerX, springY, halfWidth, 0, Math.PI, false);
  target.lineTo(centerX - halfWidth, bottomY);
  return target;
}

/**
 * 顶边为平缓弧线的板材轮廓（床头板等），宽 width，两侧高 sideHeight，中心高 peakHeight
 */
export function createCrownedPanelShape(width: number, sideHeight: number, peakHeight: number): THREE.Shape {
  const half = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(half, sideHeight);
  shape.quadraticCurveTo(0, peakHeight * 2 - sideHeight, -half, sideHeight);
  shape.lineTo(-half, 0);
  return shape;
}

/**
 * 按包围盒把几何体正面 UV 重新归一化到 [0,1]，避免 Extrude 默认以米为单位重复贴图
 */
export function normalizePlanarUV(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const w = box.max.x - box.min.x || 1;
  const h = box.max.y - box.min.y || 1;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - box.min.x) / w, (pos.getY(i) - box.min.y) / h);
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * 自然垂坠褶皱布料：褶皱振幅自上而下逐渐增大，模拟窗帘下摆散开
 */
export function createDrapeGeometry(
  width: number,
  height: number,
  folds: number,
  depth: number
): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, folds * 10, 12);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const flare = 0.55 + 0.45 * (0.5 - y / height);
    pos.setZ(i, Math.sin((x / width + 0.5) * folds * Math.PI * 2) * depth * flare);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function bendOverEdge(excess: number, radius: number): [number, number] {
  const arc = (radius * Math.PI) / 2;
  if (excess <= arc) {
    return [radius * Math.sin(excess / radius), -(radius - radius * Math.cos(excess / radius))];
  }
  return [radius, -(radius + excess - arc)];
}

/**
 * 盖在床垫上的被子：顶面微鼓带褶皱，两侧与床尾自然垂下；局部坐标床头在 -x，顶面 y = 0
 */
export function createQuiltGeometry(length: number, width: number, sideDrop: number, footDrop: number) {
  const geometry = new THREE.PlaneGeometry(length + footDrop, width + sideDrop * 2, 64, 48);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const edgeRadius = 0.08;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + footDrop / 2;
    const z = pos.getZ(i);
    const [outZ, downZ] = bendOverEdge(Math.max(0, Math.abs(z) - halfWidth), edgeRadius);
    const [outX, downX] = bendOverEdge(Math.max(0, x - halfLength), edgeRadius);
    const onTop = downZ === 0 && downX === 0;
    const nz = Math.abs(Math.min(Math.abs(z), halfWidth) / halfWidth);
    const puff = onTop ? 0.06 * (1 - nz * nz) : 0;
    const wrinkle = 0.014 * Math.sin(x * 7.3 + z * 2.1) * Math.sin(z * 5.2 - x * 1.7);

    pos.setXYZ(
      i,
      Math.min(x, halfLength) + outX,
      downZ + downX + puff + wrinkle,
      Math.sign(z) * (Math.min(Math.abs(z), halfWidth) + outZ)
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 蓬松枕头：边缘收薄、四角微尖，中间鼓起
 */
export function createPillowGeometry(sizeX: number, sizeY: number, sizeZ: number) {
  const geometry = new THREE.SphereGeometry(1, 40, 24);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const sx = Math.sign(x) * Math.pow(Math.abs(x), 0.55);
    const sz = Math.sign(z) * Math.pow(Math.abs(z), 0.55);
    const edge = Math.max(Math.abs(sx), Math.abs(sz));
    pos.setXYZ(i, (sx * sizeX) / 2, (y * sizeY * (1 - 0.65 * Math.pow(edge, 4))) / 2, (sz * sizeZ) / 2);
  }
  geometry.computeVertexNormals();
  return geometry;
}
