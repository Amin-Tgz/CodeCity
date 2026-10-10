// Runs in a loaded CodeCity page, with the existing project model.
export async function runConnectionChecks() {
  const {t,setLocale,locales}=await import('../src/i18n.js');
  const {setMode}=await import('../src/mode.js');
  const {PRESETS}=await import('../src/investigation.js');
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const change=(node,value)=>{node.value=value;node.dispatchEvent(new Event('change'));};
  const city=window.__codecity,results=[];
  const tick=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const check=async(name,run)=>{try{await run();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}};
  setMode('advanced');
  await check('every investigation label, option tooltip and guide entry works in all eight languages',async()=>{
    for(const locale of locales){
      setLocale(locale);await tick();
      const select=document.querySelector('#investigations select'),sort=document.querySelectorAll('#investigations select')[1];
      for(const [key,preset] of Object.entries(PRESETS)){
        const option=[...select.options].find(o=>o.value===key);assert(option.textContent===t(preset.label),locale+' label '+key);
        assert(option.title===t(preset.explain),locale+' tooltip '+key);change(select,key);await tick();
        assert(select.title===t(preset.explain),locale+' selected tooltip '+key);
        assert(document.querySelector('#investigations .muted-note').textContent===t(preset.explain),locale+' description '+key);
        assert(document.querySelector('#help .help-body').textContent.includes(t(preset.explain)),locale+' guide '+key);
      }
      for(const option of sort.options){change(sort,option.value);await tick();assert(sort.title===t('Sort '+option.value),locale+' sort tooltip');}
      assert(document.querySelector('#pause-motion').title===t('Pause animations stops pedestrians and ambient motion. Camera rotation and Git playback have separate controls.'),locale+' pause tooltip');
      assert(!document.querySelector('#investigations input[type=file]')&&!document.querySelector('#sel-color option[value=coverage]'),'coverage remains');
    }
    setLocale('fa');change(document.querySelector('#investigations select'),'');await tick();
  });
  await check('overview retains every dependency and shared routes expose both endpoints',async()=>{
    const represented=city.street.paths.flatMap(p=>p.shared?p.edges:[p]);assert(represented.length===city.model.roads.length,'links lost');
    const route=city.street.paths.find(p=>p.shared);assert(route,'fixture needs a shared route');
    document.querySelector('#shared-connections .member-row').click();await tick();
    assert(document.getElementById('details').classList.contains('open'),'route details did not open');
    assert(document.querySelectorAll('#details .member-row').length===route.edges.length*2,'route endpoints missing');
    document.querySelector('#details .member-row').click();await tick();
    const id=city.focusId,expected=city.model.roads.filter(edge=>edge.a===id||edge.b===id).length;
    const visible=city.street.focusGroup.children.filter(mesh=>mesh.userData.connection).length;
    assert(expected>0&&visible===expected,'selected building direct connections missing');
    assert(document.querySelector('#details summary')||document.querySelector('#details .source-section'),'building details missing');
    document.getElementById('details-close').click();
  });
  await check('pause animations freezes pedestrians while camera orbit remains independent',async()=>{
    const pause=document.getElementById('pause-motion');pause.checked=true;pause.dispatchEvent(new Event('change'));await tick();
    const before=city.street.walkers.map(w=>w.d);await new Promise(r=>setTimeout(r,150));
    assert(city.street.walkers.every((w,i)=>w.d===before[i]),'pedestrians moved while paused');
    const orbit=document.getElementById('auto-rotate');if(!orbit.classList.contains('active'))orbit.click();
    const position=city.camera.position.clone();await tick();await tick();
    assert(position.distanceTo(city.camera.position)>0,'camera orbit was stopped by pause');orbit.click();
    pause.checked=false;pause.dispatchEvent(new Event('change'));
  });
  return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
}
