async page => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const p = await context.newPage(), errors = [];
  p.on('pageerror', error => errors.push(error.message));
  p.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const assert = (value, message) => { if (!value) throw Error(message); };
  const settled = () => p.waitForFunction(() => !document.querySelector('.study-cover').disabled, { timeout: 15000 });
  const inspect = async cursor => p.evaluate(async cursor => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { leafPose } = await import('/src/scene/orbital/book-study/model.ts');
    const scene = _roots.get(document.querySelector('canvas')).store.getState().scene;
    scene.updateMatrixWorld(true);
    const meshes = Array.from({ length: 32 }, (_, i) => scene.getObjectByName(`Study_Leaf_${i}`));
    let error = 0, clearance = 1;
    const boundaries = meshes.map((mesh, index) => {
      mesh.skeleton.update();
      const position = mesh.geometry.attributes.position, left = index < cursor;
      const profile = leafPose(index, Number(left), 1, cursor).points, top = [], bottom = [];
      for (let i = 0; i < position.count; i++) {
        if (position.getY(i) < 0) continue;
        const column = Math.round(position.getX(i) / 1.38 * 32);
        const center = new THREE.Vector3(position.getX(i), 0, 0);
        mesh.applyBoneTransform(i, center); center.applyMatrix4(mesh.matrixWorld);
        error = Math.max(error, Math.hypot(center.x - profile[column].x, center.y - profile[column].y));
        const point = new THREE.Vector3().fromBufferAttribute(position, i);
        mesh.applyBoneTransform(i, point); point.applyMatrix4(mesh.matrixWorld);
        const upper = position.getZ(i) * (left ? -1 : 1) > 0;
        (upper ? top : bottom)[column] = { x: point.x, y: point.y };
      }
      return { top, bottom };
    });
    const at = (points, x) => {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if ((x - a.x) * (x - b.x) > 1e-12) continue;
        return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
      }
      throw Error('outside boundary');
    };
    for (let i = 1; i < 32; i++) {
      if (i === cursor) continue;
      const upper = boundaries[i < cursor ? i : i - 1].bottom;
      const lower = boundaries[i < cursor ? i - 1 : i].top;
      const min = Math.max(Math.min(upper[0].x, upper[32].x), Math.min(lower[0].x, lower[32].x));
      const max = Math.min(Math.max(upper[0].x, upper[32].x), Math.max(lower[0].x, lower[32].x));
      for (let j = 0; j <= 100; j++) { const x = min + (max - min) * j / 100; clearance = Math.min(clearance, at(upper, x) - at(lower, x)); }
    }
    return { count: meshes.length, modelError: error, clearance, cover: scene.getObjectByName('Study_Cover').rotation.z };
  }, cursor);
  try {
    await p.goto('http://127.0.0.1:5173/book-study.html');
    await p.waitForFunction(async () => {
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      return _roots.get(document.querySelector('canvas'))?.store.getState().scene.getObjectByName('Study_Leaf_31');
    });
    await p.screenshot({ path: '.vite/book-study-final-closed.png' });
    await p.getByRole('button', { name: '翻开日记' }).click();
    await p.waitForTimeout(450);
    await p.screenshot({ path: '.vite/book-study-final-cover.png' });
    await settled();
    const first = await inspect(0);
    assert(first.cover > 3.14 && first.modelError < 1e-5 && first.clearance > 0, 'opening must render the tested paper geometry without overlap: ' + JSON.stringify(first));
    for (let i = 0; i < 32; i++) {
      await p.getByRole('button', { name: '下一页', exact: true }).click();
      if (i === 0) {
        await p.waitForTimeout(400);
        assert(await p.getByRole('button', { name: '上一页', exact: true }).isDisabled(), 'turns must lock navigation');
        await p.screenshot({ path: '.vite/book-study-final-turn.png' });
      }
      await settled();
      if (i === 15) {
        const middle = await inspect(16);
        assert(middle.modelError < 1e-5 && middle.clearance > 0, 'middle spread must not overlap: ' + JSON.stringify(middle));
        await p.screenshot({ path: '.vite/book-study-final-middle.png' });
      }
    }
    const last = await inspect(32);
    assert(last.clearance > 0 && last.count === 32, 'all leaves must persist and keep their order: ' + JSON.stringify(last));
    assert(await p.getByRole('button', { name: '下一页', exact: true }).isDisabled(), 'last spread must stop at the end');
    for (let i = 0; i < 2; i++) { await p.getByRole('button', { name: '上一页', exact: true }).click(); await settled(); }
    assert((await p.locator('output').innerText()).includes('60 / 61'), 'backward turn must reach the preceding spread');
    await p.getByRole('button', { name: '合上日记' }).click(); await settled();
    assert((await p.locator('output').innerText()) === '封面', 'closing must gather pages before lowering the cover');
    await p.getByRole('button', { name: '翻开日记' }).click(); await settled();
    assert((await p.locator('output').innerText()) === '衬页 / 01', 'reopening must start at the first page');
    await p.setViewportSize({ width: 390, height: 844 });
    await p.getByRole('button', { name: '下一页', exact: true }).click(); await settled();
    await p.getByRole('button', { name: '俯视', exact: true }).click(); await p.waitForTimeout(1500);
    await p.screenshot({ path: '.vite/book-study-final-mobile.png' });
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'narrow layout must not overflow');
    assert(errors.length === 0, errors.join('\n'));
    return { passed: true, first, last, checks: ['64 pages forward', 'backward turns', 'close and reopen', 'rendered skeleton matches model', 'actual sheet thickness clearance', 'reduced motion still animates', '390px layout', 'no runtime errors'] };
  } finally { await context.close(); }
}
