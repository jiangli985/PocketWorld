export function createAssetQueue(limit = 2) {
  let active = 0;
  const pending: { priority: number; start: () => void }[] = [];
  const drain = () => {
    while (active < limit && pending.length) pending.shift()!.start();
  };
  return {
    run<T>(load: () => Promise<T>, priority = 1): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pending.push({ priority, start: () => {
          active++;
          void Promise.resolve().then(load).then(resolve, reject).finally(() => {
            active--;
            drain();
          });
        } });
        pending.sort((a, b) => a.priority - b.priority);
        drain();
      });
    },
  };
}

const sceneAssets = createAssetQueue();

export function loadSceneAsset<T>(url: string, load: () => Promise<T>): Promise<T> {
  const critical = /\/cabin\/(?:open-cabin|spacecraft-hull)\.glb$|\/resident\/luna-(?:walk-room|ribbon|cardigan)\.glb$/.test(url);
  return sceneAssets.run(load, critical ? 0 : url.endsWith('.bin') ? 2 : 1);
}
