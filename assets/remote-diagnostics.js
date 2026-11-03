(()=>{
  const form=document.querySelector('[data-diagnostic-form]');
  const language=document.documentElement.lang||'en';
  const russian=language==='ru';
  const servicePage=/^\/(?:ru\/)?services\/remote-gas-engine-diagnostics\/$/.test(location.pathname);
  const casePage=/^\/(?:ru\/)?case-studies\/remote-gas-engine-controller-fault-diagnostics\/$/.test(location.pathname);
  const attributionKeys=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','gclid','fbclid'];
  let attribution={};
  try{
    attribution={...JSON.parse(sessionStorage.getItem('k4_remote_diagnostics_attribution')||'{}')};
    attributionKeys.forEach(key=>{const value=new URLSearchParams(location.search).get(key);if(value)attribution[key]=value;});
    if(Object.keys(attribution).length)sessionStorage.setItem('k4_remote_diagnostics_attribution',JSON.stringify(attribution));
  }catch(error){/* Restricted storage must not affect page navigation. */}
  const funnelPaths=new Set(['/services/remote-gas-engine-diagnostics/','/ru/services/remote-gas-engine-diagnostics/','/case-studies/remote-gas-engine-controller-fault-diagnostics/','/ru/case-studies/remote-gas-engine-controller-fault-diagnostics/']);
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
  let started=false;
  const start=()=>{
    if(started)return;
    started=true;
    track('diagnostic_case_start',{location:'diagnostic-form'});
  };
  form.addEventListener('focusin',start,{once:true});
  form.addEventListener('input',start,{once:true});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    start();
    if(!form.reportValidity())return;
    const data=new FormData(form);
    const params=new URLSearchParams(location.search);
    const attribution=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'];
    const lines=[russian?'K4 Remote Diagnostics — заявка на диагностику':'K4 Remote Diagnostics — Diagnostic Case','',russian?'Проверьте данные и отправьте это письмо, чтобы передать заявку.':'Please review and send this email to submit the case.'];
    for(const [key,value] of data.entries()){
      if(key==='Safety acknowledgement'||key==='Подтверждение безопасности')continue;
      if(String(value).trim())lines.push(`${key}: ${String(value).trim()}`);
    }
    for(const key of attribution){
      const value=params.get(key);
      if(value)lines.push(`${key}: ${value}`);
    }
    lines.push('',russian?'Подтверждение безопасности: удалённые рекомендации будут выполнять только квалифицированные и уполномоченные специалисты площадки с соблюдением правил безопасности.':'Safety acknowledgement: The requester confirmed that remote instructions must only be performed by appropriately qualified and authorised site personnel under site safety procedures.');
    track('diagnostic_case_submit',{location:'diagnostic-form',form_destination:'email_draft'});
    const subject=russian?'K4 — заявка на удалённую диагностику':'K4 Remote Diagnostics — Diagnostic Case';
    const href=`mailto:ceo@k4-technology.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    const status=document.getElementById('diagnostic-status');
    status.classList.remove('rd-hidden');
    status.focus();
    window.location.href=href;
  });
})();
