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
  let started=false;
  const start=()=>{
    if(started)return;
    started=true;
    track('diagnostic_case_start',{location:'diagnostic-form'});
  };
  form.addEventListener('focusin',start,{once:true});
  form.addEventListener('input',start,{once:true});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    start();
    if(!form.reportValidity())return;
    const data=new FormData(form);
    const fields={};
    for(const [key,value] of data.entries()){
      if(key==='website')continue;
      if(fields[key])fields[key]=Array.isArray(fields[key])?[...fields[key],String(value)]:[fields[key],String(value)];
      else fields[key]=String(value);
    }
    const status=document.getElementById('diagnostic-status');
    const button=form.querySelector('[type="submit"]');
    const requestKey=`k4-diagnostic-request:${location.pathname}`;
    let requestId;
    try{requestId=sessionStorage.getItem(requestKey)||crypto.randomUUID().replaceAll('-','');sessionStorage.setItem(requestKey,requestId);}catch{requestId=crypto.randomUUID().replaceAll('-','');}
    const attribution={};
    for(const key of attributionKeys){const value=new URLSearchParams(location.search).get(key)||attribution[key];if(value)attribution[key]=value;}
    if(button)button.disabled=true;
    status.classList.remove('rd-hidden');
    status.querySelector('h3').textContent=russian?'Отправка заявки':french?'Envoi de la demande':'Sending your request';
    status.querySelector('p').textContent=russian?'Сохраняем заявку для команды K4…':french?'Enregistrement de votre demande pour K4…':'Saving your request for the K4 team…';
    try{
      const response=await fetch('/api/leads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        requestId,formType:'remote_diagnostics',language,fields,sourceUrl:location.href,
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,attribution,
        safetyAck:Object.keys(fields).some(key=>/safety|sécurité|безопасност/i.test(key))
      })});
      const result=await response.json();
      if(!response.ok||!result.success||!result.stored)throw new Error(result.error||'Request could not be stored.');
      status.querySelector('h3').textContent=russian?'Заявка получена':french?'Demande reçue':'Request received';
      status.querySelector('p').textContent=russian?`Номер заявки: ${result.reference}.`:french?`Référence : ${result.reference}.`:`Reference: ${result.reference}.`;
      try{
        const eventKey=`k4-lead-event:${result.reference}`;
        if(!sessionStorage.getItem(eventKey)){track('lead',{location:'diagnostic-form',form_type:'remote_diagnostics'});sessionStorage.setItem(eventKey,'1');}
      }catch{track('lead',{location:'diagnostic-form',form_type:'remote_diagnostics'});}
      try{sessionStorage.removeItem(requestKey);}catch{}
      form.reset();
    }catch(error){
      status.querySelector('h3').textContent=russian?'Не удалось сохранить заявку':french?'Impossible d’enregistrer la demande':'Request could not be saved';
      status.querySelector('p').textContent=russian?'Повторите попытку или напишите на ceo@k4-technology.com.':french?'Réessayez ou écrivez à ceo@k4-technology.com.':'Please try again or email ceo@k4-technology.com.';
    }finally{if(button)button.disabled=false;}
    status.focus();
  });
})();
