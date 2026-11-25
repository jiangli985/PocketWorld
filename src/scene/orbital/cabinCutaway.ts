import { MathUtils, Mesh, type Group, type Material } from 'three';
import type { CabinDeck } from './cabinLayout';
import type { CabinView } from './cabinView';

type DeckOpacity = Record<CabinDeck, number>;
export type CabinOpacity = DeckOpacity & { resident: number; interior: number };
export const QUICK_CABIN_DURATION = .65;

export function cabinZoomIsolation(distanceRatio: number) {
  return 1 - MathUtils.smoothstep(distanceRatio, .75, .93);
}

export function cabinDeckOpacity(view: CabinView, isolation: number, ascent: number | null = null, from: CabinDeck | null = null): DeckOpacity {
  if (ascent === null || !from) {
    return { lower: view === 'upper' ? 1 - isolation : 1, upper: view === 'lower' ? 1 - isolation : 1 };
  }
  const progress = from === 'lower' ? ascent : 1 - ascent;
  const leaving = 1 - isolation * MathUtils.smoothstep(progress, .76, 1);
  const arriving = 1 - isolation * (1 - MathUtils.smoothstep(progress, 0, .26));
  return from === 'lower' ? { lower: leaving, upper: arriving } : { lower: arriving, upper: leaving };
}

export function quickCabinFrame(progress: number, start: DeckOpacity, target: CabinDeck, isolation: number) {
  const leaving = MathUtils.smoothstep(progress, 0, .5);
  const arriving = MathUtils.smoothstep(progress, .12, .85);
  return {
    lower: target === 'lower' ? MathUtils.lerp(start.lower, 1, arriving) : MathUtils.lerp(start.lower, 1 - isolation, leaving),
    upper: target === 'upper' ? MathUtils.lerp(start.upper, 1, arriving) : MathUtils.lerp(start.upper, 1 - isolation, leaving),
    resident: 1 - MathUtils.smoothstep(progress, .08, .43) + MathUtils.smoothstep(progress, .63, .93),
    relocate: progress >= .5,
  };
}

export function createCabinGroupFade() {
  type MeshMaterial = Material | Material[];
  const meshes = new Map<Mesh, { original: MeshMaterial; faded: MeshMaterial; castShadow: boolean }>();
  const materials = new Map<Material, Material>();

  const restore = () => {
    for (const [mesh, { original, faded, castShadow }] of meshes) {
      if (mesh.material === faded) mesh.material = original;
      mesh.castShadow = castShadow;
    }
    for (const material of materials.values()) material.dispose();
    meshes.clear();
    materials.clear();
  };

  return {
    restore,
    set(group: Group, opacity: number) {
      group.visible = opacity > 0;
      group.userData.cabinInteractive = opacity >= .5;
      if (opacity === 0 || opacity === 1) { restore(); return; }

      const cloneMaterial = (original: Material) => {
        let faded = materials.get(original);
        if (!faded) {
          faded = original.clone();
          faded.transparent = true;
          faded.alphaHash = false;
          faded.depthWrite = false;
          materials.set(original, faded);
        }
        return faded;
      };
      group.traverseVisible(node => {
        if (!(node instanceof Mesh)) return;
        const entry = meshes.get(node);
        if (entry && node.material === entry.faded) return;
        const original = node.material;
        const faded = Array.isArray(original) ? original.map(cloneMaterial) : cloneMaterial(original);
        meshes.set(node, { original, faded, castShadow: entry?.castShadow ?? node.castShadow });
        node.castShadow = false;
        node.material = faded;
      });
      for (const [original, faded] of materials) faded.opacity = original.opacity * opacity;
    },
  };
}
