import * as THREE from 'three';

const wood = new Map<string, THREE.MeshStandardMaterial>();
const fabric = new Map<string, THREE.MeshStandardMaterial>();
let weave: THREE.DataTexture | undefined;

export function timber(color: string) {
  if (!wood.has(color)) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTimber;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTimber = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTimber;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float band = vTimber.z * 190.0 + vTimber.y * 110.0;
          float bend = sin(vTimber.x * 2.6 + vTimber.z * 13.0) * 1.8;
          float aa = 1.0 - smoothstep(0.3, 2.0, fwidth(band));
          diffuseColor.rgb *= 1.0 + sin(band + bend) * 0.045 * aa;
        `);
    };
    material.customProgramCacheKey = () => 'orbital-timber-v1';
    wood.set(color, material);
  }
  return wood.get(color)!;
}

export function upholstery(color: string) {
  if (!weave) {
    const size = 128;
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const shade = 195 + Math.round(20 * Math.sin(x * Math.PI / 2) * Math.cos(y * Math.PI / 2));
      const offset = (y * size + x) * 4;
      pixels.set([shade, shade, shade, 255], offset);
    }
    weave = new THREE.DataTexture(pixels, size, size);
    weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
    weave.repeat.set(5, 5);
    weave.magFilter = THREE.LinearFilter;
    weave.minFilter = THREE.LinearMipmapLinearFilter;
    weave.generateMipmaps = true;
    weave.needsUpdate = true;
  }
  if (!fabric.has(color)) fabric.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.94, bumpMap: weave, bumpScale: 0.0012, side: THREE.DoubleSide }));
  return fabric.get(color)!;
}
