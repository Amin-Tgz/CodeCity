// End-to-end flows for the portable launcher, on an already loaded Git project.
export async function runBrowserFlows(page) {
  const assert=(ok,text)=>{if(!ok)throw Error(text);};
  await page.evaluate(()=>{
    const a=document.querySelector('#auto-hide-panels');if(a.getAttribute('aria-pressed')==='true')a.click();
    document.getElementById('details-close')?.click();
    const c=document.getElementById('controls');if(c.classList.contains('folded'))c.querySelector('.panel-fold').click();
    document.getElementById('search').value=window.__codecity.model.buildings[0].name;
    document.getElementById('search-form').dispatchEvent(new Event('submit',{cancelable:true}));
  });
  assert(await page.evaluate(()=>{
    const p=document.getElementById('controls'),d=document.getElementById('details');
    return p.classList.contains('folded')&&p.getBoundingClientRect().bottom<=d.getBoundingClientRect().top;
  }),'details overlap Explore');
  await page.locator('#controls .panel-fold').click();
  assert(await page.evaluate(()=>!document.getElementById('details').classList.contains('open')&&!document.getElementById('controls').classList.contains('folded')),'Explore cannot be reopened');
  assert(await page.locator('#export-png,#export-json,#compare-btn,#compare-file').count()===0,'removed export/compare UI remains');
  await page.locator('#history-toggle').click();
  assert(await page.evaluate(()=>window.__construction.root.visible&&window.__codecity.historyFrame),'construction/history did not start');
  const before=await page.evaluate(()=>window.__construction.loaders[0].loader.position.toArray());
  await page.waitForTimeout(450);
  assert(await page.evaluate(before=>window.__construction.loaders[0].loader.position.toArray().some((v,i)=>v!==before[i]),before),'loader does not move');
  await page.locator('#history-toggle').click();
  assert(await page.evaluate(()=>!window.__construction.root.visible),'machinery remains after pause');
  await page.evaluate(()=>{const r=document.getElementById('tl-range');r.value=String(Number(r.max)-1);r.dispatchEvent(new Event('input'));});
  await page.locator('#history-toggle').click();
  await page.waitForTimeout(950);
  assert(await page.evaluate(()=>!window.__construction.root.visible&&!window.__codecity.historyFrame),'playback did not finish on current model');
  return {selectionFold:true,exploreReopen:true,removedOutput:true,history:true,machinesAnimate:true,pause:true,currentModel:true};
}
