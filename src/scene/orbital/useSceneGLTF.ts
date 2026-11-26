import { useGLTF } from '@react-three/drei';
import type { GLTF } from 'three-stdlib';
import { loadSceneAsset } from './assetQueue.ts';

const configured = Symbol.for('pocketworld:scene-model-queue');
const configure: NonNullable<Parameters<typeof useGLTF>[3]> = loader => {
  if (Reflect.get(loader, configured)) return;
  Reflect.set(loader, configured, true);
  const load = loader.load.bind(loader);
  loader.load = (url, onLoad, onProgress, onError) => {
    void loadSceneAsset(url, () => new Promise<GLTF>((resolve, reject) => {
      load(url, resolve, onProgress, reject);
    })).then(onLoad, onError);
  };
};

export const useSceneGLTF = Object.assign(
  (url: string) => useGLTF(url, true, true, configure),
  { preload: (url: string) => useGLTF.preload(url, true, true, configure) },
);
