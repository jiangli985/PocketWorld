import * as THREE from 'three';
export function closeBody(geometry: THREE.BufferGeometry) {
  const p = geometry.getAttribute('position'), skin = geometry.getAttribute('skinIndex'), weight = geometry.getAttribute('skinWeight'), triangles = geometry.getIndex()!;
  const keys = new Map<string, number>(), ids = new Uint32Array(p.count), originals: number[] = [];
  for (let i = 0; i < p.count; i++) { const key = `${p.getX(i).toFixed(5)}/${p.getY(i).toFixed(5)}/${p.getZ(i).toFixed(5)}`; let id = keys.get(key); if (id === undefined) { id = keys.size; keys.set(key, id); originals.push(i); } ids[i] = id; }
  const edges = new Map<number, { a: number; b: number; n: number }>(), count = keys.size;
  for (let i = 0; i < triangles.count; i += 3) for (let j = 0; j < 3; j++) { const a = ids[triangles.getX(i + j)], b = ids[triangles.getX(i + (j + 1) % 3)]; if (a === b) continue; const key = Math.min(a, b) * count + Math.max(a, b), e = edges.get(key); if (e) e.n++; else edges.set(key, { a, b, n: 1 }); }
  const links = new Map<number, number[]>();
  for (const e of edges.values()) if (e.n === 1) { links.set(e.a, [...(links.get(e.a) ?? []), e.b]); links.set(e.b, [...(links.get(e.b) ?? []), e.a]); }
  const visited = new Set<number>(), positions: number[] = [], bones: number[] = [], weights: number[] = [];
  for (const first of links.keys()) {
    if (visited.has(first)) continue; let at = first, before = -1; const loop: number[] = [];
    for (let step = 0; step < 2000; step++) { if (visited.has(at)) break; visited.add(at); loop.push(originals[at]); const next = links.get(at)?.find(n => n !== before && (!visited.has(n) || n === first)); if (next === undefined) break; before = at; at = next; if (at === first) break; }
    if (at !== first || loop.length < 3) continue;
    const vertices = loop.map(i => new THREE.Vector3().fromBufferAttribute(p, i)), bounds = new THREE.Box3().setFromPoints(vertices);
    if (bounds.min.y < .6 || bounds.max.y > 1.15) continue;
    const center = vertices.reduce((sum, v) => sum.add(v), new THREE.Vector3()).divideScalar(vertices.length), totals = new Map<number, number>();
    for (const i of loop) for (let c = 0; c < 4; c++) { const bone = skin.getComponent(i, c); totals.set(bone, (totals.get(bone) ?? 0) + weight.getComponent(i, c) / loop.length); }
    const sorted = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = sorted.reduce((n, pair) => n + pair[1], 0);
    const put = (v: THREE.Vector3, source?: number) => { positions.push(v.x, v.y, v.z); for (let c = 0; c < 4; c++) { bones.push(source === undefined ? sorted[c]?.[0] ?? 0 : skin.getComponent(source, c)); weights.push(source === undefined ? (sorted[c]?.[1] ?? 0) / sum : weight.getComponent(source, c)); } };
    for (let j = 0; j < vertices.length; j++) { put(center); put(vertices[j], loop[j]); put(vertices[(j + 1) % vertices.length], loop[(j + 1) % vertices.length]); }
  }
  const result = new THREE.BufferGeometry(); result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); result.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bones, 4)); result.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4)); result.computeVertexNormals();
  return result;
}
