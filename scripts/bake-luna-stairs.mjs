import { readFileSync, writeFileSync } from 'node:fs';
import { AnimationMixer, LoopOnce, MathUtils, Vector3 } from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';

const [ascent, descent] = process.argv.slice(2);
if (!ascent || !descent) {
  console.error('Usage: node scripts/bake-luna-stairs.mjs <113_20.bvh> <113_19.bvh>');
  process.exit(1);
}

const sides = ['Right', 'Left'];
const sampleCount = 17;

function extract(path, heading, swings) {
  const { skeleton, clip } = new BVHLoader().parse(readFileSync(path, 'utf8'));
  const bones = new Map(skeleton.bones.map(bone => [bone.name, bone]));
  const mixer = new AnimationMixer(skeleton.bones[0]);
  mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
  const point = name => bones.get(name).getWorldPosition(new Vector3());
  const pitch = (vector, up) => Math.atan2(heading * vector.z, up * vector.y);

  const samples = swings.map(([first, last], index) => {
    const side = sides[index];
    const frames = Array.from({ length: sampleCount }, (_, n) => {
      mixer.setTime(MathUtils.lerp(first, last, n / (sampleCount - 1)) / 120);
      const ankle = point(side + 'Foot');
      return {
        distance: heading * ankle.z,
        height: ankle.y,
        solePitch: pitch(point(side + 'ToeBase').sub(ankle), 1) - Math.PI / 2,
        lean: pitch(point('Neck').sub(point('Hips')), 1),
        arms: sides.map(arm => pitch(point(arm + 'ForeArm').sub(point(arm + 'Arm')), -1)),
      };
    });
    const from = frames[0], to = frames.at(-1);
    let lastAdvance = 0;
    return frames.map((frame, n) => {
      const phase = n / (sampleCount - 1);
      const advance = lastAdvance = MathUtils.clamp((frame.distance - from.distance) / (to.distance - from.distance), lastAdvance, 1);
      const clearance = Math.max(0, frame.height - MathUtils.lerp(from.height, to.height, advance));
      return [
        advance, clearance / 15,
        frame.solePitch - MathUtils.lerp(from.solePitch, to.solePitch, phase),
        frame.lean, ...frame.arms,
      ];
    });
  });
  const [right, left] = samples;
  // Join the trunk and arm channels at the two alternating contacts.
  for (let channel = 3; channel < right[0].length; channel++) {
    const a = (left.at(-1)[channel] + right[0][channel]) / 2;
    const b = (right.at(-1)[channel] + left[0][channel]) / 2;
    for (const [step, start, end] of [[right, a, b], [left, b, a]]) {
      const entry = start - step[0][channel], exit = end - step.at(-1)[channel];
      step.forEach((frame, i) => {
        frame[channel] += entry * (1 - MathUtils.smoothstep(i, 0, 5))
          + exit * MathUtils.smoothstep(i, sampleCount - 6, sampleCount - 1);
      });
    }
  }
  return samples;
}

const profiles = {
  up: extract(ascent, -1, [[179, 262], [263, 345]]),
  down: extract(descent, 1, [[505, 607], [426, 514]]),
};
const output = new URL('../assets/models/resident/luna-stair-gait.json', import.meta.url);
writeFileSync(output, '{\n' + Object.entries(profiles).map(([name, steps]) =>
  `  "${name}": [\n${steps.map(step => '    [\n' + step.map(row =>
    '      ' + JSON.stringify(row.map(value => Number(value.toFixed(4))))).join(',\n') + '\n    ]').join(',\n')}\n  ]`
).join(',\n') + '\n}\n');
