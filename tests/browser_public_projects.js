// Invoke with a Playwright page on an isolated CodeCity server and a local Git clone.
// Exercises the real folder dialog, rendered city, saved profile, and history UI.
export async function runPublicProjectChecks(page, projectPath, name, {structural=true}={}) {
  const checks=[],errors=[];
  const assert=(value,label)=>{if(!value)throw Error(`${name}: ${label}`);checks.push(label);};
  const onError=error=>errors.push(error.message);
  page.on('pageerror',onError);
  const ready=()=>page.waitForFunction(()=>window.__codecity&&document.getElementById('loading').style.display==='none',null,{timeout:120000});
  const current=()=>page.evaluate(()=>{const r=document.getElementById('tl-range');r.value=r.max;r.dispatchEvent(new Event('input'));});
  const started=Date.now();
  try {
    await page.setViewportSize({width:1280,height:900});
    await ready();
    await page.locator('#ui-language').selectOption('en');
    await page.locator('[data-mode-choice="simple"]').click();
    await page.locator('#project-menu-btn').click();
    await page.locator('#project-open').click();
    await page.locator('#folder-path').fill(projectPath);
    await page.locator('#folder-submit').click();
    await page.waitForFunction(root=>window.__codecity?.model.meta.root.replaceAll('\\','/').toLowerCase()===root.replaceAll('\\','/').toLowerCase()&&!document.getElementById('folder-dialog').open&&document.getElementById('loading').style.display==='none',projectPath,{timeout:120000});
    if(await page.locator('#controls').evaluate(panel=>panel.classList.contains('folded')))await page.locator('#controls .panel-fold').click();
    const model=await page.evaluate(async()=>{
      const c=window.__codecity;await c.ready;
      const {validateModel}=await import('./src/model.js');validateModel(c.model);
      return {totals:c.model.meta.totals,historyFrames:c.model.meta.history?.frames.length||0,renderCount:window.__renderCount,
        rendered:c.byBuilding.size,duplicateIds:c.model.buildings.length-new Set(c.model.buildings.map(b=>b.id)).size,
        sample:c.model.buildings.find(b=>b.kind==='class'&&b.members?.some(m=>m.kind==='method'))||c.model.buildings.find(b=>b.language==='typescript')||c.model.buildings[0]};
    });
    assert(model.totals.buildings>100&&model.rendered===model.totals.buildings&&model.renderCount>0,'full project scans, validates, and renders');
    assert(model.duplicateIds===0,'building identities are unique');
    assert(await page.locator('#sel-height').isVisible()&&await page.locator('#tl-play').isVisible(),'Simple exposes metrics and Git history');
    for(const id of ['filter','sel-streets'])assert(!await page.locator('#'+id).isVisible(),`Simple hides ${id}`);

    await page.locator('#sel-height').selectOption('deps');
    await page.locator('#sel-footprint').selectOption('loc');
    await page.locator('#sel-color').selectOption('language');
    await page.locator('#sel-mode').selectOption('threshold');
    const desired={height:'deps',footprint:'loc',color:'language',mode:'threshold'};
    assert(await page.evaluate(mapping=>JSON.stringify(window.__codecity.mapping)===JSON.stringify(mapping),desired),'metric controls update the city');
    await page.locator('#metric-profile-save').click();
    await page.waitForFunction(()=>document.getElementById('metric-profile-status').textContent==='Default metrics saved for the next app launch.');
    await page.reload();await ready();
    assert(await page.evaluate(mapping=>JSON.stringify(window.__codecity.mapping)===JSON.stringify(mapping),desired),'saved profile restores after reload');
    await page.locator('#sel-color').selectOption('language');
    assert(await page.evaluate(()=>window.__codecity.mapping.color==='language'),'programming language mapping remains selectable');
    await page.locator('#sel-color').selectOption('language');
    assert(await page.locator('#metric-profile-status').textContent()==='Changes are temporary until you save them as default.','unsaved changes are identified');

    await page.locator('#list-btn').click();
    await page.locator('#list-filter').fill(model.sample.file);
    await page.locator('.list-row[data-id]').filter({hasText:model.sample.name}).first().click();
    await page.locator('#list-close').click();
    assert(await page.locator('#details').isVisible(),'building selection opens details in Simple');
    await page.locator('.source-section > button').click();
    await page.waitForFunction(()=>!!document.querySelector('.selected-line'),null,{timeout:30000});
    assert(await page.evaluate(()=>document.querySelector('.source-preview').textContent.length>20),'source preview loads real source lines');
    await page.locator('.metric-explain[data-metric="loc"]').click();
    assert(await page.locator('html').getAttribute('data-mode')==='advanced'&&await page.locator('.metric-evidence').isVisible(),'metric explanation reveals Advanced evidence');
    await page.locator('#details-close').click();
    await page.locator('#list-btn').click();await page.locator('#list-filter').fill(model.sample.name);await page.locator(`.list-row[data-id="${model.sample.id}"]`).click();await page.locator('#list-close').click();
    assert(await page.locator('#details').isVisible(),'Advanced building list selects a building');
    await page.locator('#details-close').click();
    await page.locator('#filter').selectOption(model.sample.district);
    assert(await page.evaluate(d=>window.__codecity.filterId===d,model.sample.district),'Advanced district filter applies');
    // District selection opens its first building and folds Explore; reopen it to query.
    if(await page.locator('#controls').evaluate(panel=>panel.classList.contains('folded')))await page.locator('#controls .panel-fold').click();
    await page.locator('#investigations select').first().selectOption('fan-out');
    assert(await page.evaluate(()=>window.__codecity.highlightSet instanceof Set),'Advanced investigation highlights candidates');
    await page.locator('[data-mode-choice="simple"]').click();
    assert(await page.evaluate(()=>!window.__codecity.filterId&&!window.__codecity.highlightSet&&document.querySelector('#investigations select').value===''),'Simple clears hidden filters and investigation highlights');

    assert(model.historyFrames>1,'multiple real Git commits are available');
    await current();
    await page.locator('#history-toggle').click();
    assert(await page.evaluate(()=>document.getElementById('tl-play').getAttribute('aria-pressed')==='true'&&!!window.__codecity.historyFrame),'Git playback starts in Simple');
    await page.locator('[data-mode-choice="advanced"]').click();
    await page.locator('[data-mode-choice="simple"]').click();
    assert(await page.locator('#tl-play').getAttribute('aria-pressed')==='true','switching modes preserves playback');
    await page.locator('#history-toggle').click();
    assert(await page.locator('#tl-play').getAttribute('aria-pressed')==='false','Git playback pauses');
    await current();
    assert(await page.evaluate(()=>!window.__codecity.historyFrame),'last timeline position restores the current model');
    if(structural) {
      await page.locator('#history-mode').selectOption('structural');
      await page.locator('#tl-range').evaluate(range=>{range.value=String(Math.max(0,Number(range.max)-2));range.dispatchEvent(new Event('input'));});
      await page.waitForFunction(()=>!document.getElementById('history-compare').disabled||/limit|exceeds|Could not|timed out/i.test(document.getElementById('tl-label').textContent),null,{timeout:120000});
      assert(!await page.locator('#history-compare').isDisabled(),`commit structure loads (${await page.locator('#tl-label').textContent()})`);
      assert(await page.evaluate(()=>!!window.__codecity.model.meta.commit),'history parses the selected commit');
      await page.locator('#history-compare').click();
      assert(await page.evaluate(()=>!!window.__codecity.model.meta.comparisonCommit),'commit comparison applies');
      await current();
      assert(await page.evaluate(()=>!window.__codecity.model.meta.commit&&!window.__codecity.model.meta.comparisonCommit),'current structure restores after comparison');
      await page.locator('#history-mode').selectOption('approximate');
    }

    await page.locator('#ui-language').selectOption('fa');
    assert(await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length).every(b=>b.title&&!/\b(Open|Show|Select|Play|Save|Close|Copy|Fold)\b/.test(b.title))),'visible buttons have Persian tooltips');
    await page.locator('#help-btn').click();
    const localization=await page.evaluate(async()=>{
      const {HELP_SECTIONS}=await import('./src/help.js');const {setLocale,t,locales}=await import('./src/i18n.js');
      const quality=(await import('./src/quality-strings.js')).default;
      const keys=[...HELP_SECTIONS.flatMap(([title,body])=>[title,...body]),...Object.keys(quality)];
      const missing={};for(const locale of locales.slice(1)){setLocale(locale);missing[locale]=keys.filter(key=>t(key)===key);}setLocale('fa');
      return {missing,footer:document.querySelector('.quality-guide').lastElementChild.textContent,figures:document.querySelectorAll('.quality-example svg').length};
    });
    assert(Object.values(localization.missing).every(rows=>!rows.length),'help has complete translations in every language');
    assert(localization.figures===2&&/نمایندهٔ کد/.test(localization.footer),'help diagrams and footer are present in Persian');
    await page.locator('#help-close').click();
    await page.setViewportSize({width:390,height:844});
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Persian mobile layout has no page overflow');
    await page.screenshot({path:`output/playwright/${name}-simple-fa-mobile.png`});
    await page.locator('#ui-language').selectOption('en');await page.setViewportSize({width:1280,height:900});
    await page.screenshot({path:`output/playwright/${name}-simple.png`});
    await page.locator('#project-menu-btn').click();await page.locator('#project-close').click();
    await page.waitForFunction(()=>window.__codecity?.model.meta.root===''&&document.getElementById('loading').style.display==='none');
    assert(await page.locator('#empty-open').isVisible()&&!await page.locator('#controls').isVisible(),'close project returns to empty Simple city');
    assert(!errors.length,`no browser runtime errors (${errors.join('; ')})`);
    return {name,root:projectPath,totals:model.totals,historyFrames:model.historyFrames,sampleFile:model.sample.file,checks,durationMs:Date.now()-started};
  } finally {page.off('pageerror',onError);}
}
