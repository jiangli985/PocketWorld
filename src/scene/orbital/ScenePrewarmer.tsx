import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { createWarmupPlan, createWarmupRunner, type WarmupRunner } from './shaderPrewarm';

const prewarmedObjects = new WeakSet<THREE.Object3D>();

/**
 * Incrementally uploads textures and compiles shaders for `target` inside the R3F loop
 * so the first visible render does not freeze the main thread.
 */
export function usePrewarmObject(
  target: THREE.Object3D | null | undefined,
  options: {
    enabled?: boolean;
    materialsPerFrame?: number;
    texturesPerFrame?: number;
    assumeReceiveShadow?: boolean;
  } = {},
) {
  const { enabled = true, materialsPerFrame = 3, texturesPerFrame = 2, assumeReceiveShadow = true } = options;
  const { gl, scene, camera } = useThree();
  const runnerRef = useRef<WarmupRunner | null>(null);

  useEffect(() => {
    if (!enabled || !target || prewarmedObjects.has(target)) {
      runnerRef.current = null;
      return;
    }
    const plan = createWarmupPlan(target, materialsPerFrame, { assumeReceiveShadow });
    if (plan.textures.length === 0 && plan.batches.length === 0) {
      prewarmedObjects.add(target);
      runnerRef.current = null;
      return;
    }
    runnerRef.current = createWarmupRunner(plan, { texturesPerFrame });
    return () => {
      runnerRef.current = null;
    };
  }, [target, enabled, materialsPerFrame, texturesPerFrame, assumeReceiveShadow]);

  useFrame(() => {
    const runner = runnerRef.current;
    if (!runner || !target) return;
    if (runner.done) {
      prewarmedObjects.add(target);
      runnerRef.current = null;
      return;
    }
    const finished = runner.step(gl, scene, camera);
    if (finished) {
      prewarmedObjects.add(target);
      runnerRef.current = null;
    }
  });
}
