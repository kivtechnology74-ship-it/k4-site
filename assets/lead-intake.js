(()=>{
  const forms=[...document.querySelectorAll('form[data-diagnostic-form],form[data-server-lead-form]')];
  if(!forms.length)return;
  const language=(document.documentElement.lang||'en').toLowerCase();
  const copy=language.startsWith('ru')?{
    sending:'Отправляем…',saved:'Заявка сохранена',savedBody:'K4 получил и сохранил заявку. Номер: ',queued:'Заявка сохранена, письмо K4 будет отправлено повторно. Номер: ',failed:'Заявка сохранена, но письмо K4 не доставлено. Свяжитесь с K4 напрямую. Номер: ',error:'Не удалось надёжно сохранить заявку. Повторите отправку или свяжитесь с K4 напрямую.'
  }:language.startsWith('fr')?{
    sending:'Envoi…',saved:'Demande reçue et enregistrée',savedBody:'K4 a reçu et enregistré la demande. Référence : ',queued:'La demande est enregistrée ; l’e-mail à K4 sera renvoyé. Référence : ',failed:'La demande est enregistrée, mais l’e-mail à K4 n’a pas été envoyé. Contactez K4 directement. Référence : ',error:'La demande n’a pas pu être enregistrée. Réessayez ou contactez K4 directement.'
  }:language.startsWith('zh')?{
    sending:'正在发送…',saved:'请求已保存',savedBody:'K4 已收到并保存请求。编号：',queued:'请求已保存，发给 K4 的邮件将自动重试。编号：',failed:'请求已保存，但发给 K4 的邮件未送达。请直接联系 K4。编号：',error:'请求未能可靠保存。请重试或直接联系 K4。'
  }:language.startsWith('es')?{
    sending:'Enviando…',saved:'Solicitud recibida y guardada',savedBody:'K4 recibió y guardó la solicitud. Referencia: ',queued:'La solicitud está guardada; se volverá a intentar el envío del correo a K4. Referencia: ',failed:'La solicitud está guardada, pero no se envió el correo a K4. Contacte directamente con K4. Referencia: ',error:'No se pudo guardar la solicitud. Inténtelo de nuevo o contacte directamente con K4.'
  }:language.startsWith('pt')?{
    sending:'Enviando…',saved:'Solicitação recebida e salva',savedBody:'A K4 recebeu e salvou a solicitação. Referência: ',queued:'A solicitação está salva; o e-mail para a K4 será enviado novamente. Referência: ',failed:'A solicitação está salva, mas o e-mail para a K4 não foi enviado. Entre em contato diretamente com a K4. Referência: ',error:'Não foi possível salvar a solicitação. Tente novamente ou entre em contato diretamente com a K4.'
  }:{
    sending:'Sending…',saved:'Request received and saved',savedBody:'K4 received and saved your request. Reference: ',queued:'Your request is saved; the email to K4 will be retried automatically. Reference: ',failed:'Your request is saved, but the email to K4 was not delivered. Contact K4 directly. Reference: ',error:'The request could not be reliably saved. Try again or contact K4 directly.'
  };
  const attributionKeys=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','gclid','fbclid'];
  const apiBase=location.hostname.endsWith('.k4-technology.pages.dev')?'https://k4-technology.com':'';
  let attribution={};
  try{
    attribution={...JSON.parse(sessionStorage.getItem('k4_campaign_attribution')||'{}')};
    const params=new URLSearchParams(location.search);
    attributionKeys.forEach(key=>{const value=params.get(key);if(value)attribution[key]=value;});
    if(Object.keys(attribution).length)sessionStorage.setItem('k4_campaign_attribution',JSON.stringify(attribution));
  }catch(error){/* Attribution must not interrupt submission. */}
  const track=(event,details={})=>{
    const payload={page_path:location.pathname,language,...details};
    if(typeof window.gtag==='function')window.gtag('event',event,payload);
    window.dispatchEvent(new CustomEvent('k4:analytics',{detail:{event,...payload}}));
  };
  const requestId=()=>crypto.randomUUID();
  const values=form=>[...new FormData(form).entries()].filter(([name,value])=>name!=='website'&&String(value).trim());
  const findStatus=form=>form.querySelector('[role="status"]')||(()=>{
    const node=document.createElement('div');node.className='rd-status';node.setAttribute('role','status');node.setAttribute('aria-live','polite');node.tabIndex=-1;form.append(node);return node;
  })();

  forms.forEach(form=>{
    form.dataset.serverLeadForm='true';
    const idKey=`k4_lead_request:${location.pathname}:${form.id||form.dataset.formType||'form'}`;
    let id='';
    try{id=sessionStorage.getItem(idKey)||'';}catch(error){/* In-memory idempotency remains available. */}
    let started=false;
    const submit=form.querySelector('button[type="submit"],input[type="submit"]');
    const originalLabel=submit?.textContent||submit?.value||'';
    const status=findStatus(form);
    const show=(title,body,isError=false)=>{
      const heading=status.querySelector('h3');
      const paragraph=status.querySelector('p');
      if(heading)heading.textContent=title;else status.textContent='';
      if(paragraph)paragraph.textContent=body;else status.append(document.createTextNode(`${title}. ${body}`));
      status.classList.remove('rd-hidden');
      status.dataset.state=isError?'error':'success';
      status.focus();
    };
    const trap=document.createElement('input');
    trap.type='text';trap.name='website';trap.tabIndex=-1;trap.autocomplete='off';trap.setAttribute('aria-hidden','true');trap.style.position='absolute';trap.style.left='-9999px';
    form.append(trap);
    form.addEventListener('input',()=>{if(!started){started=true;track('lead_form_start',{form_type:form.dataset.formType|| (form.matches('[data-diagnostic-form]')?'remote_diagnostics':'technical_review'),form_location:form.dataset.location||'form'});}});
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
      if(!started){started=true;track('lead_form_start',{form_type:form.dataset.formType|| (form.matches('[data-diagnostic-form]')?'remote_diagnostics':'technical_review'),form_location:form.dataset.location||'form'});}
      if(!form.reportValidity())return;
      const entries=values(form);
      const explicitContact=form.querySelector('[data-contact-field]')?.value.trim()||'';
      const email=entries.find(([name,value])=>/email/i.test(name)||form.querySelector(`[name="${CSS.escape(name)}"]`)?.type==='email')?.[1]||'';
      const phone=entries.find(([name,value])=>/phone|telephone|whatsapp|телефон/i.test(name))?.[1]||'';
      const contact=(explicitContact||String(email).trim()||String(phone).trim()||entries.find(([name])=>/contact|email|phone|контакт/i.test(name))?.[1]||'').toString().trim();
      const messageEntry=entries.find(([name])=>/fault description|briefly describe|project description|message|request|описание|сообщение|demande/i.test(name));
      const message=messageEntry?String(messageEntry[1]).trim():`${form.dataset.formTitle||'K4 website inquiry'} submitted from ${location.pathname}`;
      const excludedNames=new Set([messageEntry?.[0],'website'].filter(Boolean));
      const details=entries.filter(([name])=>!excludedNames.has(name)).map(([name,value])=>({name,value:String(value).trim()}));
      const currentId=id||(id=requestId());
      id=currentId;
      try{sessionStorage.setItem(idKey,id);}catch(error){/* The server still deduplicates this page session. */}
      const formType=form.dataset.formType||(form.matches('[data-diagnostic-form]')?'remote_diagnostics':'technical_review');
      const payload={
        requestId:currentId,contact,message,formType,
        language:document.documentElement.lang||'en',
        sourceUrl:location.href,
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'unknown',
        attribution,
        details,
        safetyAcknowledged:entries.some(([name])=>/safety|sécurité|безопас/i.test(name)),
        website:trap.value
      };
      if(submit){submit.disabled=true;if(submit.tagName==='INPUT')submit.value=copy.sending;else submit.textContent=copy.sending;}
      track('lead_form_submit_attempt',{form_type:formType,form_location:form.dataset.location||'form'});
      try{
        const response=await fetch(`${apiBase}/api/remote-diagnostics`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.stored!==true)throw new Error(result.error||`HTTP ${response.status}`);
        const deliveryMessage=result.emailStatus==='sent'?copy.savedBody:result.emailStatus==='failed'?copy.failed:copy.queued;
        show(copy.saved,`${deliveryMessage}${result.reference||''}`);
        track('lead_form_submit_success',{form_type:formType,form_location:form.dataset.location||'form',request_reference:result.reference||'stored',email_status:result.emailStatus||'pending'});
        if(formType==='remote_diagnostics')track('diagnostic_case_submit_success',{form_type:formType,form_location:form.dataset.location||'diagnostic-form',request_reference:result.reference||'stored'});
        id='';
        try{sessionStorage.removeItem(idKey);}catch(error){/* Nothing to clean up in restricted storage. */}
        form.reset();
      }catch(error){
        show('K4',copy.error,true);
        track('lead_form_submit_error',{form_type:formType,form_location:form.dataset.location||'form',error_type:error.name||'Error'});
      }finally{
        if(submit){submit.disabled=false;if(submit.tagName==='INPUT')submit.value=originalLabel;else submit.textContent=originalLabel;}
      }
    });
  });
})();
