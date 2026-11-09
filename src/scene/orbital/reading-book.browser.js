async page => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const p = await context.newPage(), errors = [];
  p.on('pageerror', error => errors.push(error.message));
  const assert = (value, message) => { if (!value) throw Error(message); };
  const ready = expected => p.waitForFunction(label => {
    const tools = document.querySelector('.world-reader-tools[aria-busy="false"]');
    return tools && (!label || tools.querySelector('output')?.textContent === label);
  }, expected);
  const button = name => p.getByRole('button', { name, exact: true });
  const readPage = () => p.getByLabel('阅读页码', { exact: true }).innerText();
  const paper = () => p.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const scene = _roots.get(document.querySelector('canvas')).store.getState().scene;
    const book = scene.getObjectByName('Reading_Book');
    const leaf = book.getObjectByName('Study_Leaf_0');
    return { cover: book.getObjectByName('Study_Cover').rotation.z, turn: leaf.skeleton.bones[0].rotation.y, maps: [4, 5].map(side => leaf.material[side].map?.image.width) };
  });
  try {
    await p.goto('http://127.0.0.1:5173/'); await p.locator('canvas').waitFor(); await p.waitForTimeout(350);
    await p.keyboard.press('r'); await ready('1 / 3');
    assert(await readPage() === '1 / 3', 'the preset book must start on its first page');
    await p.keyboard.press('r'); await p.waitForTimeout(1300); await ready();
    assert(await readPage() === '1 / 3', 'the open shortcut must not advance an already open book');
    const first = await paper();
    assert(first.cover > 3.14 && first.maps.every(width => width === 636), 'content must be printed on both faces of the new physical leaf');
    await p.screenshot({ path: '.vite/reader-first.png' });
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(420);
    const turning = await paper();
    assert(Math.abs(turning.turn - first.turn) > 0.15 && Math.abs(turning.turn) < 3.1, 'the leaf must pass through an animated intermediate pose');
    await p.screenshot({ path: '.vite/reader-turn.png' }); await ready('2–3 / 3');
    assert(await readPage() === '2–3 / 3' && await button('下一页').isDisabled(), 'the final spread must show both remaining pages and stop');
    await p.screenshot({ path: '.vite/reader-spread.png' });
    await p.keyboard.press('Escape'); await p.waitForTimeout(450); await p.keyboard.press('r'); await ready();
    assert(await readPage() === '2–3 / 3', 'reopening must restore the reading position');
    await button('上一页').click(); await ready('1 / 3');
    assert(await readPage() === '1 / 3', 'backward navigation must return to the first leaf');
    await p.mouse.move(910, 530); await p.mouse.down(); await p.mouse.move(780, 535, { steps: 8 }); await p.mouse.up();
    await p.waitForFunction(() => document.querySelector('.world-reader-tools output')?.textContent === '2–3 / 3');
    await ready();
    await p.setViewportSize({ width: 320, height: 640 });
    await p.waitForFunction(() => { const r = document.querySelector('.world-reader-tools').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }, undefined, { timeout: 3000 });
    await p.setViewportSize({ width: 1440, height: 1000 });
    await button('书目').click(); await p.getByRole('button', { name: /窗边的星图/ }).click(); await ready('1 / 2');
    assert(await readPage() === '1 / 2', 'selecting another title must open its first page');
    await button('书目').click(); await p.getByRole('button', { name: /轨道上的日常/ }).click(); await ready('2–3 / 3');
    assert(await readPage() === '2–3 / 3', 'switching back must restore the bookmark for this title');
    await button('添加书籍').click();
    await p.getByLabel('书名', { exact: true }).fill('舱室测试读物');
    await p.getByLabel('书籍正文', { exact: true }).fill(`${'这是需要滚动阅读的一段文字。'.repeat(22)}\n\n第二页。`);
    await button('放进书柜').click(); await ready('1 / 2');
    assert(await p.getByRole('article', { name: '舱室测试读物' }).count() === 1, 'new local books must open in the 3D reader');
    await button('向下滚动正文').click();
    await button('下一页').click(); await ready('2 / 2');
    assert(await readPage() === '2 / 2', 'the last left-hand page must remain readable');
    await p.reload(); await p.locator('canvas').waitFor(); await p.waitForTimeout(350); await p.keyboard.press('r'); await ready();
    assert(await readPage() === '2 / 2' && await p.getByRole('article', { name: '舱室测试读物' }).count() === 1, 'reload must restore both the selected title and its bookmark');
    assert(errors.length === 0, errors.join('\n'));
    return { passed: true };
  } finally { await context.close(); }
}
