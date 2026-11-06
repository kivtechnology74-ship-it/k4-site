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

  const contactField=form.querySelector('[data-contact-field]');
  const descriptionField=form.querySelector('[data-description-field]');
  const submitButton=form.querySelector('button[type="submit"]');
  const originalButtonText=submitButton?submitButton.textContent:'';
  const status=document.getElementById('diagnostic-status');
  const statusTitle=status?.querySelector('h3');
  const statusMessage=status?.querySelector('p');
  const apiEndpoint='/api/remote-diagnostics';
  const copy=russian?{
    invalidContact:'Укажите действующий e-mail или номер телефона / WhatsApp.',
    sending:'Отправляем…',
    successTitle:'Заявка получена и сохранена',
    successMessage:'K4 получил данные заявки. Номер заявки: ',
    queuedMessage:'Заявка надёжно сохранена. Почтовое уведомление K4 будет отправлено повторно автоматически. Номер заявки: ',
    errorTitle:'Не удалось отправить заявку',
    errorMessage:'Данные не были подтверждены сервером. Повторите отправку или свяжитесь с K4 по WhatsApp.'
  }:french?{
    invalidContact:'Indiquez une adresse e-mail ou un numéro de téléphone / WhatsApp valide.',
    sending:'Envoi…',
    successTitle:'Demande reçue et enregistrée',
    successMessage:'K4 a reçu les informations. Référence : ',
    queuedMessage:'La demande est enregistrée. La notification e-mail à K4 sera relancée automatiquement. Référence : ',
    errorTitle:'Impossible d’envoyer la demande',
    errorMessage:'Le serveur n’a pas confirmé la demande. Réessayez ou contactez K4 par WhatsApp.'
  }:{
    invalidContact:'Enter a valid email address or phone / WhatsApp number.',
    sending:'Sending…',
    successTitle:'Request received and saved',
    successMessage:'K4 has received the request details. Reference: ',
    queuedMessage:'The request is safely saved. K4’s email notification will retry automatically. Reference: ',
    errorTitle:'The request could not be sent',
    errorMessage:'The server did not confirm the request. Try again or contact K4 by WhatsApp.'
  };

  const trap=document.createElement('input');
  trap.type='text';
  trap.name='website';
  trap.tabIndex=-1;
  trap.autocomplete='off';
  trap.setAttribute('aria-hidden','true');
  trap.style.position='absolute';
  trap.style.left='-9999px';
  form.appendChild(trap);

  const validateContact=()=>{
    if(!contactField)return true;
    const value=contactField.value.trim();
    const validEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    const digits=value.replace(/\D/g,'').length;
    const validPhone=/^\+?[\d\s().-]+$/.test(value)&&digits>=7&&digits<=15;
    contactField.setCustomValidity(validEmail||validPhone?'':copy.invalidContact);
    return validEmail||validPhone;
  };
  if(contactField)contactField.addEventListener('input',validateContact);
  let started=false;
  const start=()=>{
    if(started)return;
    started=true;
    track('diagnostic_case_start',{location:'diagnostic-form'});
  };
  form.addEventListener('focusin',start,{once:true});
  form.addEventListener('input',start,{once:true});

  const showStatus=(title,message,isError=false)=>{
    if(!status)return;
    if(statusTitle)statusTitle.textContent=title;
    if(statusMessage)statusMessage.textContent=message;
    status.classList.remove('rd-hidden');
    status.dataset.state=isError?'error':'success';
    status.focus();
  };
  const formValue=id=>form.querySelector(`#${id}`)?.value.trim()||'';
  const safetyName=russian?'Подтверждение безопасности':french?'Confirmation de sécurité':'Safety acknowledgement';
  const createRequestId=()=>{
    if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64;
    bytes[8]=(bytes[8]&63)|128;
    const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  };

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    start();
    status?.classList.add('rd-hidden');
    validateContact();
    if(!form.reportValidity())return;
    const data=new FormData(form);
    const details=[];
    for(const [name,value] of data.entries()){
      if(['Contact','Fault description',safetyName,'website'].includes(name)||!String(value).trim())continue;
      details.push({name,value:String(value).trim()});
    }
    const requestId=form.dataset.requestId||createRequestId();
    form.dataset.requestId=requestId;
    const payload={
      requestId,
      contact:contactField?.value.trim()||'',
      faultDescription:descriptionField?.value.trim()||'',
      engineModel:formValue('engine-model'),
      alarmCode:formValue('alarms'),
      siteCountry:formValue('contact-country'),
      language:russian?'ru':french?'fr':'en',
      sourceUrl:location.href,
      safetyAcknowledged:Boolean(data.get(safetyName)),
      details,
      attribution,
      website:trap.value
    };
    if(submitButton){submitButton.disabled=true;submitButton.textContent=copy.sending;}
    track('diagnostic_case_submit_attempt',{location:'diagnostic-form',form_destination:'server'});
    try{
      const response=await fetch(apiEndpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.success||!result.stored)throw new Error(result.error||`HTTP ${response.status}`);
      const queued=result.emailStatus!=='sent';
      showStatus(copy.successTitle,(queued?copy.queuedMessage:copy.successMessage)+(result.reference||''));
      track('diagnostic_case_submit_success',{location:'diagnostic-form',form_destination:'server',notification_status:result.emailStatus||'unknown'});
      form.reset();
      delete form.dataset.requestId;
      started=false;
    }catch(error){
      showStatus(copy.errorTitle,copy.errorMessage,true);
      track('diagnostic_case_submit_error',{location:'diagnostic-form',form_destination:'server'});
    }finally{
      if(submitButton){submitButton.disabled=false;submitButton.textContent=originalButtonText;}
    }
  });
})();
