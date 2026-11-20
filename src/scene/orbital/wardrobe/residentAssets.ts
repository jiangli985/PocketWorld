import { FileLoader, type AnimationClip } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readSeatContactCache, type SeatContactCache } from '../chairAnimation';
import { readLibraryMotion, type LibraryMotion } from '../library/libraryMotion';
import type { ResidentOutfit } from './outfit';

export interface ResidentAssets {
  outfit: ResidentOutfit;
  scene: GLTF['scene'];
  walk: AnimationClip;
  sit: AnimationClip;
  contact: SeatContactCache;
  fitted?: {
    bed: AnimationClip;
    sofa: AnimationClip;
    library: LibraryMotion;
    idle?: { yawn: AnimationClip; look: AnimationClip };
  };
}

const files = {
  everyday: ['luna-walk-room.glb', 'luna-seat-contact.bin'],
  cloudhoodie: ['luna-cloudhoodie.glb', 'luna-cloudhoodie-seat.bin'],
  snowflower: ['luna-snowflower.glb', 'luna-snowflower-seat.bin'],
} as const;
const pending = new Map<ResidentOutfit, Promise<ResidentAssets>>();

export function loadResidentAssets(outfit: ResidentOutfit): Promise<ResidentAssets> {
  const cached = pending.get(outfit);
  if (cached) return cached;
  const base = import.meta.env.BASE_URL + 'models/resident/';
  const [model, cache] = files[outfit];
  const request = Promise.all([
    new GLTFLoader().loadAsync(base + model),
    new FileLoader().setResponseType('arraybuffer').loadAsync(base + cache),
  ]).then(([gltf, buffer]) => {
    const clip = (name: string) => {
      const match = gltf.animations.find(animation => animation.name === name);
      if (!match) throw new Error('人物动作缺失：' + name);
      return match;
    };
    return {
      outfit, scene: gltf.scene, walk: clip('Walk_Grounded_Loop'), sit: clip('ChairSit_Contact'),
      contact: readSeatContactCache(buffer as ArrayBuffer),
      fitted: outfit !== 'everyday' ? {
        bed: clip('Luna_Bed_V3_DirectSeat'), sofa: clip('Luna_CMU_75_20'), library: readLibraryMotion(gltf.animations),
        idle: outfit === 'cloudhoodie' ? { yawn: clip('Luna_Yawn'), look: clip('Luna_Looking_Around') } : undefined,
      } : undefined,
    };
  }).catch(error => { pending.delete(outfit); throw error; });
  pending.set(outfit, request);
  return request;
}
