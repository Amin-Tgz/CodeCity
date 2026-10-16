// Runs in a loaded CodeCity page, with the existing project model.
export async function runConnectionChecks() {
  const {t,setLocale,locales}=await import('../src/i18n.js');
  const {setMode}=await import('../src/mode.js');
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const city=window.__codecity,results=[];
  const tick=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const check=async(name,run)=>{try{await run();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}};
  setMode('advanced');
  await check('investigations and shared connections sections are removed',async()=>{
    assert(!document.getElementById('investigations'),'#investigations remains in DOM');
    assert(!document.getElementById('shared-connections'),'#shared-connections remains in DOM');
    for(const locale of locales){
      setLocale(locale);await tick();
      assert(document.querySelector('#pause-motion').title===t('Pause animations stops pedestrians and ambient motion. Camera rotation and Git playback have separate controls.'),locale+' pause tooltip');
    }
    setLocale('fa');await tick();
  });
  await check('building selection displays dependency map with show more and show less',async()=>{
    const building=[...city.byBuilding.values()][0]?.building;
    assert(building,'fixture has no building');
    const e=city.byBuilding.get(building.id);
    city.select(e.body);
    const detailsClose=document.getElementById('details-close');
    assert(document.querySelector('.relationship-diagram svg'),'selected building dependency map missing');
    const moreBtn=document.querySelector('.relationship-actions .mini-btn');
    if(moreBtn&&!moreBtn.hidden){
      moreBtn.click();await tick();
      const lessBtn=document.querySelectorAll('.relationship-actions .mini-btn')[1];
      assert(lessBtn&&!lessBtn.hidden,'less button is not visible after more');
      lessBtn.click();await tick();
    }
    detailsClose?.click();
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
