async page => {
 const context=await page.context().browser().newContext({reducedMotion:'reduce'}); const p=await context.newPage();
 const assert=(v,m)=>{if(!v)throw new Error(m);};
 try {
  await p.goto(page.url());await p.evaluate(()=>localStorage.setItem('pocketworld:journal:today',JSON.stringify({id:'today',date:'2026-11-08',text:'原有的日记',updatedAt:''})));await p.reload();await p.locator('canvas').waitFor();await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await p.keyboard.press('j');
  const right=p.getByRole('textbox',{name:'日记右页正文'});await right.waitFor({timeout:3000});
  assert(await right.inputValue()==='原有的日记','Legacy diary must remain on page one');await right.press('End');await right.pressSequentially('abc123',{delay:0});const cdp=await context.newCDPSession(p);await cdp.send('Input.imeSetComposition',{text:'nihao',selectionStart:5,selectionEnd:5});await cdp.send('Input.insertText',{text:'你好'});assert(await right.inputValue()==='原有的日记abc123你好','Rapid typing or IME lost characters: ' + await right.inputValue());assert(await p.getByRole('textbox',{name:'日记左页正文'}).count()===0,'First spread starts at page 01');
  await right.fill('第一页的内容');await p.getByRole('button',{name:'下一页',exact:true}).click();
  await p.locator('.world-journal-content[data-turning="false"]').waitFor();
  const left=p.getByRole('textbox',{name:'日记左页正文'});await left.waitFor();
  assert(await p.getByLabel('第 2 页',{exact:true}).textContent()==='02','Left page should be 02');
  assert(await p.getByLabel('第 3 页',{exact:true}).textContent()==='03','Right page should be 03');
  await left.fill('写在左页');await p.getByRole('group',{name:'左页天气'}).getByRole('button',{name:'雨',exact:true}).click();
  await right.fill('写在右页');await p.getByRole('group',{name:'右页天气'}).getByRole('button',{name:'晴',exact:true}).click();
  await p.getByRole('button',{name:'下一页',exact:true}).click();await p.locator('.world-journal-content[data-turning="false"]').waitFor();
  assert(await left.inputValue()==='' && await right.inputValue()==='','New spread should be blank');
  await p.getByRole('button',{name:'上一页',exact:true}).click();await p.locator('.world-journal-content[data-turning="false"]').waitFor();
  assert(await left.inputValue()==='写在左页' && await right.inputValue()==='写在右页','Both sides must keep their own text');
  assert(await p.getByRole('group',{name:'左页天气'}).getByRole('button',{name:'雨',exact:true}).getAttribute('aria-pressed')==='true','Left weather lost');
  assert(await p.getByRole('group',{name:'右页天气'}).getByRole('button',{name:'晴',exact:true}).getAttribute('aria-pressed')==='true','Right weather lost');
  await p.waitForTimeout(600);await p.reload();await p.locator('canvas').waitFor();await p.keyboard.press('j');await right.waitFor();
  assert(await right.inputValue()==='第一页的内容','First page lost after reload');
  await p.getByRole('button',{name:'下一页',exact:true}).click();await p.locator('.world-journal-content[data-turning="false"]').waitFor();
  assert(await left.inputValue()==='写在左页' && await right.inputValue()==='写在右页','Reload must restore both pages');
  return {passed:true,checks:['true spread numbering','both pages editable','independent weather','forward/backward spread','reload persistence']};
 }finally{await context.close();}
}
