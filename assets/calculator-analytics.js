(()=>{
  const VERSION='1.0-beta';
  const endpoint='/api/calculator-events';
  const root=document.documentElement;
  const language=(root.lang||'en').toLowerCase().startsWith('ru')?'ru':'en';
  const pagePath=location.pathname;
  const modelSelect=document.querySelector('#profile');
  const contact=document.querySelector('[data-calculator-contact]');
  const contactContainer=document.querySelector('#calcContact');
  const qa=location.hostname.endsWith('.pages.dev')||new URLSearchParams(location.search).has('qa')||new URLSearchParams(location.search).get('utm_source')==='codex_internal_test';
  const automation=/bot|crawler|spider|headless|lighthouse|pagespeed/i.test(navigator.userAgent||'');
  const trafficClass=qa?'qa':automation?'probable_automation':'production';
  const consentAllowed=()=>!['1','yes'].includes(String(navigator.doNotTrack||'').toLowerCase())&&window.k4AnalyticsConsent!==false;
  const id=()=>crypto.randomUUID();
  const base={brand:'k4',language,calculator_version:VERSION,page_path:pagePath};
  let calcId=id();
  let model={brand:'unknown',model_id:'unknown',model_name:'unknown',profile_type:'incomplete'};
  let started=false;
  let completeTimer=0;
  let lastFingerprint='';
  let validCurrent=false;
  let completionPromise=Promise.resolve(false);

  function selectedModel(profile){
    if(modelSelect?.value==='custom'||profile?.isCustom)return{brand:'custom',model_id:'manual',model_name:'manual profile',profile_type:'manual'};
    if(!profile)return{brand:'unknown',model_id:'unknown',model_name:'unknown',profile_type:'incomplete'};
    const type=profile.isCustom?'manual':profile.is_example?'demo':/oem (confirmed|подтверждено)/i.test(profile.status||'')?'oem':'incomplete';
    return{brand:String(profile.brand||'unknown').slice(0,60),model_id:String(profile.id||'unknown').slice(0,80),model_name:String(profile.engine||profile.model||'unknown').slice(0,100),profile_type:type};
  }
  function send(eventName,scenario=calcId,{waitForGa=false}={}){
    if(!consentAllowed())return Promise.resolve(false);
    const eventId=id();
    const payload={event_id:eventId,event_name:eventName,session_id:sessionId,calc_id:scenario,...base,...model,traffic_class:trafficClass};
    let gaDelivery=Promise.resolve(false);
    try{
      if(typeof window.gtag==='function'){
        const gaParams={calculator_brand:'k4',calculator_model_id:model.model_id,calculator_model:model.model_name,calculator_profile_type:model.profile_type,calculator_language:language,calculator_version:VERSION,calculator_traffic_class:trafficClass,...(trafficClass==='qa'?{debug_mode:true}:{})};
        if(waitForGa)gaDelivery=new Promise(resolve=>{
          let settled=false;
          const finish=delivered=>{if(settled)return;settled=true;window.clearTimeout(timeout);resolve(delivered);};
          const timeout=window.setTimeout(()=>finish(false),750);
          gaParams.transport_type='beacon';
          gaParams.event_callback=()=>finish(true);
        });
        window.gtag('event',eventName,gaParams);
      }
    }catch(error){/* Analytics must never interrupt the calculator. */}
    try{
      const stored=fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),keepalive:true}).then(response=>response.ok).catch(()=>false);
      return waitForGa?Promise.all([gaDelivery,stored]).then(([delivered,saved])=>delivered||saved):stored;
    }catch(error){/* Analytics must never interrupt the calculator. */return gaDelivery;}
  }
  let sessionId;
  try{sessionId=sessionStorage.getItem('k4_calc_session')||id();sessionStorage.setItem('k4_calc_session',sessionId);}catch(error){sessionId=id();}
  function start(){if(started)return;started=true;send('calculator_started');}
  function fingerprint(){
    const ids=['power','units','load','hours','fuelRate','manualFuelUnit','fuelPrice','electricPrice','heatPower','heatUse','heatPrice','horizon','zipCost','opsCost','oilCost','capex','currency','idxElectric','idxHeat','idxFuel','idxZip','idxOps','idxOil'];
    return JSON.stringify([model.model_id,...ids.map(field=>document.getElementById(field)?.value??'')]);
  }
  function context(){return{...base,...model,calc_id:calcId};}
  window.K4CalculatorAnalytics={
    selected(profile){const next=selectedModel(profile);if(window.K4CalculatorAnalytics.lastCompleted&&next.model_id!==model.model_id){calcId=id();started=false;validCurrent=false;window.K4CalculatorAnalytics.lastCompleted='';}model={...next};},
    modelSelected(profile){if(profile){const next=selectedModel(profile);if(window.K4CalculatorAnalytics.lastCompleted&&next.model_id!==model.model_id){calcId=id();started=false;validCurrent=false;window.K4CalculatorAnalytics.lastCompleted='';}model={...next};}start();send('calculator_model_selected');window.clearTimeout(completeTimer);const current=fingerprint();lastFingerprint=current;completeTimer=window.setTimeout(()=>window.K4CalculatorAnalytics.complete(current),650);},
    changed(){const current=fingerprint();if(window.K4CalculatorAnalytics.lastCompleted===current){lastFingerprint=current;return;}if(window.K4CalculatorAnalytics.lastCompleted&&current!==window.K4CalculatorAnalytics.lastCompleted){calcId=id();started=false;validCurrent=false;window.K4CalculatorAnalytics.lastCompleted='';}start();window.clearTimeout(completeTimer);lastFingerprint=current;validCurrent=false;completeTimer=window.setTimeout(()=>window.K4CalculatorAnalytics.complete(current),650);},
    complete(expected){
      if(expected&&expected!==fingerprint())return;
      const values=window.K4CalculatorResult;
      if(!values||values.valid!==true||model.profile_type==='demo')return;
      const current=fingerprint();if(current===window.K4CalculatorAnalytics.lastCompleted)return;
      if(!started)return;
      calcId=calcId||id();validCurrent=true;lastFingerprint=current;window.K4CalculatorAnalytics.lastCompleted=current;
      const ctaUrl=new URL(contact.href,location.href);ctaUrl.searchParams.set('calc_id',calcId);contact.href=ctaUrl.href;if(contactContainer)contactContainer.hidden=false;
      completionPromise=send('calculator_result_completed',calcId);
    },
    pdfClicked(){return validCurrent?send('calculator_pdf_clicked',calcId,{waitForGa:true}):Promise.resolve(false);},
    contactClicked(){if(validCurrent)send('calculator_contact_clicked');},
    current(){return validCurrent?context():null;}
  };
  model={...selectedModel()};
  send('calculator_page_view');
  modelSelect?.addEventListener('change',event=>{if(event.isTrusted)window.K4CalculatorAnalytics.modelSelected();});
  document.addEventListener('input',event=>{if(event.isTrusted&&event.target!==modelSelect&&event.target.closest('.panel'))window.K4CalculatorAnalytics.changed();},true);
  document.addEventListener('change',event=>{if(event.isTrusted&&event.target.closest('.panel')&&event.target!==modelSelect)window.K4CalculatorAnalytics.changed();},true);
  contact?.addEventListener('click',event=>{
    if(!validCurrent)return;
    event.preventDefault();
    window.K4CalculatorAnalytics.contactClicked();
    const destination=contact.href;
    const fallback=new Promise(resolve=>window.setTimeout(()=>resolve(false),1500));
    Promise.race([completionPromise,fallback]).finally(()=>window.location.assign(destination));
  });
})();
