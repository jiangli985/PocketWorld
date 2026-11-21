import { MathUtils, Matrix4, Object3D, SkinnedMesh, Vector3 } from 'three';

/** Drive the two garment shape keys from the final animated pose, including procedural hand IK. */
export function createSleeveContact(asset: Object3D) {
  const surfaces: SkinnedMesh[] = [];
  asset.traverse(node => {
    if (node instanceof SkinnedMesh && node.morphTargetDictionary?.SleeveContact_L !== undefined
      && node.morphTargetDictionary.SleeveContact_R !== undefined) surfaces.push(node);
  });
  if (!surfaces.length) return undefined;

  const skeleton = surfaces[0].skeleton;
  const hips = skeleton.getBoneByName('mixamorigHips')!;
  const bindHips = skeleton.boneInverses[skeleton.bones.indexOf(hips)].clone().invert();
  const arms = (['Left', 'Right'] as const).map(side => ({
    shoulder: skeleton.getBoneByName('mixamorig' + side + 'Arm')!,
    wrist: skeleton.getBoneByName('mixamorig' + side + 'Hand')!,
    key: side === 'Left' ? 'SleeveContact_L' : 'SleeveContact_R',
  }));
  const toBind = new Matrix4(), shoulderPoint = new Vector3(), reach = new Vector3();
  const smooth = MathUtils.smoothstep;
  return () => {
    hips.updateWorldMatrix(true, false);
    toBind.copy(hips.matrixWorld).invert().premultiply(bindHips);
    for (const { shoulder, wrist, key } of arms) {
      shoulder.getWorldPosition(shoulderPoint).applyMatrix4(toBind);
      wrist.getWorldPosition(reach).applyMatrix4(toBind).sub(shoulderPoint);
      // Distances are in the garment's unscaled bind space. Release on lift, spread or forward reach.
      const weight = smooth(-reach.y, .115, .185) * (1 - smooth(Math.abs(reach.x), .082, .133))
        * (1 - smooth(Math.abs(reach.z), .105, .173));
      for (const surface of surfaces) surface.morphTargetInfluences![surface.morphTargetDictionary![key]] = weight;
    }
  };
}
