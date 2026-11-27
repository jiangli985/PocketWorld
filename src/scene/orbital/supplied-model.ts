import * as THREE from 'three';

/** Keep cached geometry/materials immutable while isolating each instance's visibility. */
export function cloneSuppliedModel(
  scene: THREE.Group,
  part?: string,
  options: { castShadow?: boolean } = {},
): THREE.Group {
  if (part && !scene.getObjectByName(part)) throw new Error(`Missing supplied part: ${part}`);
  const castShadow = options.castShadow ?? true;
  const clone = scene.clone(true);
  clone.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    if (part) {
      let parent: THREE.Object3D | null = o;
      let included = false;
      while (parent) { if (parent.name === part) included = true; parent = parent.parent; }
      o.visible = included;
      o.castShadow = included && castShadow;
      o.receiveShadow = included;
      // Three.js raycasting does not skip invisible meshes. Hidden sibling
      // parts must not steal hits from the original ObjectHandle hierarchy.
      if (!included) o.raycast = () => {};
      return;
    }
    o.castShadow = castShadow;
    o.receiveShadow = true;
  });
  return clone;
}
