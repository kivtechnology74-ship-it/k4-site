(()=>{
  const form=document.querySelector('[data-diagnostic-form]');
  const language=document.documentElement.lang||'en';
  const russian=language==='ru';
  const french=language==='fr';
  const servicePage=/^(?:\/(?:ru|fr))?\/services\/remote-gas-engine-diagnostics\/$/.test(location.pathname);
  const casePage=/^(?:\/(?:ru|fr))?\/case-studies\/remote-gas-engine-controller-fault-diagnostics\/$/.test(location.pathname);
  const attributionKeys=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','gclid','fbclid'];
  let attribution={};
  try{
    attribution={...JSON.parse(sessionStorage.getItem('k4_remote_diagnostics_attribution')||'{}')};
    attributionKeys.forEach(key=>{const value=new URLSearchParams(location.search).get(key);if(value)attribution[key]=value;});
    if(Object.keys(attribution).length)sessionStorage.setItem('k4_remote_diagnostics_attribution',JSON.stringify(attribution));
  }catch(error){/* Restricted storage must not affect page navigation. */}
  const funnelPaths=new Set([
    '/services/remote-gas-engine-diagnostics/','/ru/services/remote-gas-engine-diagnostics/','/fr/services/remote-gas-engine-diagnostics/',
    '/case-studies/remote-gas-engine-controller-fault-diagnostics/','/ru/case-studies/remote-gas-engine-controller-fault-diagnostics/','/fr/case-studies/remote-gas-engine-controller-fault-diagnostics/'
  ]);
  document.querySelectorAll('a[href]').forEach(link=>link.addEventListener('click',()=>{
    try{
      const url=new URL(link.href,location.href);
      if(url.origin!==location.origin||!funnelPaths.has(url.pathname)||!Object.keys(attribution).length)return;
      attributionKeys.forEach(key=>{if(!url.searchParams.has(key)&&attribution[key])url.searchParams.set(key,attribution[key]);});
      link.href=url.toString();
    }catch(error){/* Keep existing links intact if URL parsing is unavailable. */}
  }));
  document.querySelectorAll('a[data-channel="whatsapp"]').forEach(link=>link.addEventListener('click',()=>track('diagnostic_whatsapp_click',{location:link.dataset.location||'content',channel:'whatsapp'})));
  if(casePage)document.querySelectorAll('a[href*="/services/remote-gas-engine-diagnostics/"]').forEach(link=>link.addEventListener('click',()=>track('diagnostic_case_study_to_service',{location:link.dataset.location||'case-study'})));
  const track=(name,detail={})=>{
    if(typeof window.gtag==='function')window.gtag('event',name,{page_path:location.pathname,page_type:casePage?'case_study':'service',language,...detail});
    window.dispatchEvent(new CustomEvent('k4:analytics',{detail:{event:name,...detail}}));
  };
  if(servicePage)track('remote_diagnostics_view',{service_slug:'remote-gas-engine-diagnostics'});
  if(casePage)track('diagnostic_case_study_view',{case_slug:'remote-gas-engine-controller-fault-diagnostics'});
  if(!form)return;
  if(!form.querySelector('[name="website"]')){
    const trap=document.createElement('input');
    trap.type='text';trap.name='website';trap.tabIndex=-1;trap.autocomplete='off';
    trap.setAttribute('aria-hidden','true');trap.style.cssText='position:absolute;left:-10000px;width:1px;height:1px;';
    form.append(trap);
  }
  const requestKey=`k4-diagnostic-request:${location.pathname}`;
  const fingerprintKey=`${requestKey}:payload`;
  const button=form.querySelector('[type="submit"]');
  const status=document.getElementById('diagnostic-status');
  const language=(document.documentElement.lang||'en').toLowerCase();
  const copy=language.startsWith('ru')
    ?{sending:'Сохраняем заявку…',received:'Заявка получена. Номер: ',error:'Не удалось сохранить заявку. Повторите попытку или напишите на ceo@k4-technology.com.'}
    :language.startsWith('fr')
      ?{sending:'Enregistrement…',received:'Demande reçue. Référence : ',error:'Impossible d’enregistrer la demande. Réessayez ou écrivez à ceo@k4-technology.com.'}
      :{sending:'Saving your request…',received:'Request received. Reference: ',error:'We could not save your request. Please try again or email ceo@k4-technology.com.'};
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    if(!form.reportValidity())return;
    const data=new FormData(form);
    const fields={};
    for(const [key,value] of data.entries()){
      if(key==='website')continue;
      if(fields[key])fields[key]=Array.isArray(fields[key])?[...fields[key],String(value)]:[fields[key],String(value)];
      else fields[key]=String(value);
    }
    const sourceUrl=`${location.pathname}${location.search}`;
    const formType='remote_diagnostics';
    const currentLanguage=document.documentElement.lang||'en';
    const payloadFingerprint=JSON.stringify({fields,sourceUrl,formType,language:currentLanguage});
    let requestId='';
    try{
      requestId=sessionStorage.getItem(requestKey)||'';
      if(!requestId||sessionStorage.getItem(fingerprintKey)!==payloadFingerprint){
        requestId=crypto.randomUUID();
        sessionStorage.setItem(requestKey,requestId);
        sessionStorage.setItem(fingerprintKey,payloadFingerprint);
      }
    }catch{requestId=crypto.randomUUID();}
    const submissionAttribution={};
    for(const key of attributionKeys){const value=new URLSearchParams(location.search).get(key)||attribution[key];if(value)submissionAttribution[key]=value;}
    if(button)button.disabled=true;
    status.classList.remove('rd-hidden');
    status.querySelector('h3').textContent=copy.sending;
    status.querySelector('p').textContent=copy.sending;
    try{
      const response=await fetch('/api/leads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        requestId,formType,language:currentLanguage,fields,sourceUrl:location.href,
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'unknown',attribution:submissionAttribution,
        safetyAck:Object.keys(fields).some(key=>/safety|sécurité|безопасност/i.test(key)),
        website:form.querySelector('[name="website"]')?.value||''
      })});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result.success!==true||result.stored!==true)throw new Error('storage');
      status.querySelector('h3').textContent=language.startsWith('ru')?'Заявка получена':language.startsWith('fr')?'Demande reçue':'Request received';
      status.querySelector('p').textContent=`${copy.received}${result.reference}.`;
      try{
        const eventKey=`k4-lead-event:${result.reference}`;
        if(!sessionStorage.getItem(eventKey)){
          track('lead',{location:'diagnostic-form',form_type:formType});
          sessionStorage.setItem(eventKey,'1');
        }
      }catch{track('lead',{location:'diagnostic-form',form_type:formType});}
      try{sessionStorage.removeItem(requestKey);sessionStorage.removeItem(fingerprintKey);}catch{}
      form.reset();
    }catch{
      status.querySelector('h3').textContent=language.startsWith('ru')?'Не удалось сохранить заявку':language.startsWith('fr')?'Impossible d’enregistrer la demande':'Request could not be saved';
      status.querySelector('p').textContent=copy.error;
    }finally{if(button)button.disabled=false;}
    status.focus();
  });
})();
