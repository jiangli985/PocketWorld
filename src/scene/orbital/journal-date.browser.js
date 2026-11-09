async page => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const p = await context.newPage(), errors = [];
  p.on('pageerror', error => errors.push(error.message));
  const assert = (value, message) => { if (!value) throw Error(message); };
  const open = async () => { await p.locator('canvas').waitFor(); await p.waitForTimeout(250); await p.keyboard.press('j'); await p.getByRole('textbox', { name: '日记右页正文' }).waitFor(); };
  const turn = async name => {
    const current = Number(await p.getByRole('textbox', { name: '日记右页正文' }).getAttribute('data-page'));
    const destination = current + (name === '下一页' ? 2 : -2);
    await p.getByRole('button', { name, exact: true }).click();
    await p.locator('.world-journal-content[data-turning="false"]').waitFor();
    await p.locator(`input[aria-label="右页日期"][data-page="${destination}"]`).waitFor();
  };
  const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('pocketworld:journal:today')));
  const printedDate = () => p.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const scene = _roots.get(document.querySelector('canvas')).store.getState().scene;
    const canvas = scene.getObjectByName('Study_Leaf_0').material[4].map.image;
    return Array.from(canvas.getContext('2d').getImageData(380, 56, 220, 40).data).join(',');
  });
  try {
    await p.goto('http://127.0.0.1:5173/');
    await p.evaluate(() => localStorage.setItem('pocketworld:journal:today', JSON.stringify({ id: 'today', date: '2020-01-02', text: '保留原有正文', updatedAt: '' })));
    await p.reload(); await open();
    const right = p.getByLabel('右页日期', { exact: true });
    await right.waitFor({ timeout: 2500 });
    assert(await right.getAttribute('type') === 'text', 'date must be an ordinary editable text field');
    assert(await right.inputValue() === '2020-01-02', 'old entries must inherit their existing date');
    const before = await printedDate();
    await p.evaluate(async () => {
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const scene = _roots.get(document.querySelector('canvas')).store.getState().scene;
      const ctx = scene.getObjectByName('Study_Leaf_0').material[4].map.image.getContext('2d');
      const draw = ctx.fillText;
      ctx.fillText = function (text, x, y, ...rest) {
        if (x === 294 && y === 42) globalThis.__printedJournalDate = text;
        return draw.call(this, text, x, y, ...rest);
      };
    });
    await right.click(); await right.press('Control+A'); await right.press('Backspace');
    assert(await right.inputValue() === '', 'clearing a date while editing must not restore the old value');
    await right.pressSequentially('2025-03-14', { delay: 0 });
    assert(await right.inputValue() === '2025-03-14', 'manual typing must keep every character');
    assert(await p.evaluate(() => globalThis.__printedJournalDate) === '2025-03-14', 'printed date must match the exact typed format');
    assert(await right.evaluate(input => getComputedStyle(input).opacity === '1' && getComputedStyle(input).color !== 'rgba(0, 0, 0, 0)'), 'the field and caret must be visible while editing');
    assert((await stored()).pages[0].date === '2025-03-14', 'edited date must be saved on the page');
    assert((await printedDate()) !== before, 'edited date must update the actual printed leaf');
    await p.getByRole('textbox', { name: '日记右页正文' }).fill('正文仍然可以编辑');
    assert(await p.evaluate(() => globalThis.__printedJournalDate) === '2025-03-14', 'leaving the field must not change its date format');
    assert((await stored()).pages[0].date === '2025-03-14', 'editing text must preserve the date');
    await turn('下一页');
    const left = p.getByLabel('左页日期', { exact: true });
    const today = await p.evaluate(() => new Date().toLocaleDateString('sv-SE'));
    assert(await left.inputValue() === today && await right.inputValue() === today, 'new pages must automatically start with the current local date');
    await left.fill('2025-03-15'); await right.fill('2025-03-16');
    await p.getByRole('group', { name: '左页天气' }).getByRole('button', { name: '雨', exact: true }).click();
    assert((await stored()).pages[1].date === '2025-03-15', 'weather edits must preserve the date');
    await turn('上一页');
    assert(await right.inputValue() === '2025-03-14', 'turning back must restore the first page date: ' + await right.inputValue() + ', saved ' + (await stored()).pages[0].date);
    await p.reload(); await open();
    assert(await right.inputValue() === '2025-03-14', 'first page date must survive a reload');
    assert(await p.getByRole('textbox', { name: '日记右页正文' }).inputValue() === '正文仍然可以编辑', 'body must survive date editing and reload');
    await turn('下一页');
    assert(await left.inputValue() === '2025-03-15' && await right.inputValue() === '2025-03-16', 'both page dates must reload independently');
    await p.screenshot({ path: '.vite/journal-editable-date.png' });
    await right.click();
    await p.screenshot({ path: '.vite/journal-date-input.png' });
    assert(errors.length === 0, errors.join('\n'));
    return { passed: true, checks: ['legacy date fallback', 'printed date updates', 'independent page dates', 'text and weather preserved', 'turn and reload persistence'] };
  } finally { await context.close(); }
}
