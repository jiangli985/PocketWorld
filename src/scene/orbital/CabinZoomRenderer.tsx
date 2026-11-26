import { useEffect, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Camera, FramebufferTexture, Mesh, PlaneGeometry, Scene, ShaderMaterial, Vector2 } from 'three';
import type { Object3D } from 'three';
import type { CabinOpacity } from './cabinCutaway';

export function CabinZoomRenderer({ opacity }: { opacity: MutableRefObject<CabinOpacity> }) {
  const pass = useMemo(() => {
    const scene = new Scene();
    const material = new ShaderMaterial({
      uniforms: { frame: { value: null as FramebufferTexture | null }, amount: { value: 1 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D frame;
        uniform float amount;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(texture2D(frame, vUv).rgb, amount);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const geometry = new PlaneGeometry(2, 2);
    const quad = new Mesh(geometry, material);
    quad.frustumCulled = false;
    scene.add(quad);
    return { scene, material, geometry, camera: new Camera(), size: new Vector2(), parts: [] as Object3D[] };
  }, []);

  useEffect(() => () => {
    pass.material.uniforms.frame.value?.dispose();
    pass.material.dispose();
    pass.geometry.dispose();
  }, [pass]);

  useFrame(({ gl, scene, camera }) => {
    // The first pass preserves the complete room's depth and shadows.
    gl.render(scene, camera);
    const deck = opacity.current.zoomFade;
    if (!deck) return;

    scene.traverseVisible(node => {
      if (typeof node.userData.cabinZoomOpacity === 'number') pass.parts.push(node);
    });
    if (pass.parts.length === 0) return;

    const autoClear = gl.autoClear;
    try {
      const { x: width, y: height } = gl.getDrawingBufferSize(pass.size);
      let texture = pass.material.uniforms.frame.value;
      if (!texture || texture.image.width !== width || texture.image.height !== height) {
        texture?.dispose();
        texture = new FramebufferTexture(width, height);
        pass.material.uniforms.frame.value = texture;
      }
      // Copy display colors so exposure and antialiasing match the normal render.
      gl.copyFramebufferToTexture(texture);

      for (const part of pass.parts) part.visible = false;
      gl.render(scene, camera);
      gl.autoClear = false;
      pass.material.uniforms.amount.value = opacity.current[deck];
      gl.render(pass.scene, pass.camera);
    } finally {
      for (const part of pass.parts) part.visible = true;
      pass.parts.length = 0;
      gl.autoClear = autoClear;
    }
  }, 1);

  return null;
}
