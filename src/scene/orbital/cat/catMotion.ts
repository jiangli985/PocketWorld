import { AnimationMixer, type AnimationClip, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let pending: Promise<AnimationClip[]> | undefined;

export function loadCatClips() {
  const url = `${import.meta.env.BASE_URL}models/cat/tuanzi-motion.glb`;
  return pending ??= new GLTFLoader().loadAsync(url).then(({ animations }) => animations).catch(error => {
    pending = undefined;
    throw error;
  });
}

const NAMES = {
  stretch: 'Tuanzi_Stretch',
  lieDown: 'Tuanzi_LieDown',
  sleep: 'Tuanzi_Sleep',
  getUp: 'Tuanzi_GetUp',
} as const;

type ActionName = keyof typeof NAMES;
type Phase = 'standing' | ActionName | 'riseEarly';

const BEFORE_STRETCH = 4;
const BEFORE_SLEEP = 6;
const SLEEP_TIME = 10;
const WAKE_BLEND = 0.25;
const IDLE_BLEND = 0.4;

export function createCatMotion(root: Object3D, clips: AnimationClip[]) {
  const mixer = new AnimationMixer(root);
  const find = (name: ActionName) => {
    const clip = clips.find(clip => clip.name === NAMES[name]);
    return clip ? mixer.clipAction(clip) : null;
  };
  const stretch = find('stretch'), lieDown = find('lieDown'), sleep = find('sleep'), getUp = find('getUp');
  if (!stretch || !lieDown || !sleep || !getUp) return null;
  const actions = { stretch, lieDown, sleep, getUp };
  const walkClip = clips.find(clip => clip.name === 'Tuanzi_Walk');
  const walk = walkClip ? mixer.clipAction(walkClip) : null;
  const duration = (name: ActionName) => actions[name].getClip().duration;
  let phase: Phase = 'standing';
  let time = 0;
  let sleepAtWake = 0;
  let naturalWake = false;
  let next: 'stretch' | 'lieDown' = 'stretch';
  let standingFor = BEFORE_STRETCH;
  let blendIn = false;

  function stand(comingFromAnimation: boolean) {
    phase = 'standing';
    time = 0;
    blendIn = comingFromAnimation;
    standingFor = next === 'stretch' ? BEFORE_STRETCH : BEFORE_SLEEP;
    mixer.stopAllAction();
  }

  function sample(name: ActionName, seconds: number, weight = 1) {
    const action = actions[name];
    action.play();
    action.paused = true; // The state clock drives all sample times, including a partial reversal.
    action.time = seconds;
    action.setEffectiveWeight(weight);
  }

  return {
    walk: walk ? {
      sample(cycles: number, weight: number) {
        walk.play();
        walk.paused = true;
        walk.time = (cycles % 1) * walk.getClip().duration;
        walk.setEffectiveWeight(weight);
        mixer.update(0);
      },
      stop() { walk.stop(); },
    } : null,
    update(dt: number, pet: boolean, petActive: boolean, reducedMotion: boolean, onStart: () => void) {
      if (reducedMotion) {
        if (phase !== 'standing') stand(false);
        time = 0;
        return { idle: 0, standing: true };
      }
      if (phase === 'standing') {
        if (petActive) {
          // Re-arm the idle timer on petting, but keep full procedural feedback.
          time = IDLE_BLEND;
          return { idle: 1, standing: true };
        }
        time += dt;
        if (time < standingFor) {
          const attack = blendIn ? time / IDLE_BLEND : 1;
          return { idle: Math.min(1, attack, (standingFor - time) / IDLE_BLEND), standing: true };
        }
        phase = next;
        time = 0;
        // The mixer must capture neutral transforms before its first action starts.
        onStart();
      } else if (phase === 'lieDown' && pet) {
        phase = 'riseEarly';
      } else if (phase === 'sleep' && (pet || time >= SLEEP_TIME)) {
        naturalWake = !pet;
        sleepAtWake = time % duration('sleep');
        phase = 'getUp';
        time = 0;
      }

      if (phase === 'riseEarly') {
        time = Math.max(0, time - dt * 1.4);
        sample('lieDown', time);
        if (time === 0) {
          stand(true);
          return { idle: 0, standing: true };
        }
      } else {
        time += dt;
        if (phase === 'sleep') {
          sample('sleep', time % duration('sleep'));
        } else {
          const end = duration(phase);
          if (phase === 'getUp') {
            const weight = Math.min(1, time / WAKE_BLEND);
            if (weight < 1) sample('sleep', sleepAtWake, 1 - weight);
            else sleep.stop();
            sample('getUp', Math.min(time, end), weight);
          } else {
            sample(phase, Math.min(time, end));
          }
          if (time >= end) {
            if (phase === 'lieDown') {
              lieDown.stop();
              phase = 'sleep';
              time = 0;
              next = 'stretch';
              sample('sleep', 0);
            } else {
              next = phase === 'stretch' ? 'lieDown' : 'stretch';
              const walkReady = phase === 'getUp' && naturalWake && !petActive;
              stand(true);
              return { idle: 0, standing: true, walkReady };
            }
          }
        }
      }
      mixer.update(0);
      return { idle: 0, standing: false };
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    },
  };
}
