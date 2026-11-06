import type { WebGLProgramParametersWithUniforms } from 'three';

/** Subtle longitudinal grain on the actual extruded floor boards; no texture allocation. */
export function applyOakGrain(shader: WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vOakPosition;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOakPosition = position.xy;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vOakPosition;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      float grainWarp = sin(vOakPosition.x * 1.7 + vOakPosition.y * 12.0) * 0.8;
      float broadGrain = sin(vOakPosition.y * 95.0 + grainWarp);
      float fineGrain = sin(vOakPosition.y * 380.0 + grainWarp * 2.0);
      float grainAA = 1.0 - smoothstep(0.15, 0.9, fwidth(vOakPosition.y * 95.0));
      diffuseColor.rgb *= 1.0 + (broadGrain * 0.022 + fineGrain * 0.009) * grainAA;
    `);
}
