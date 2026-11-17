(()=>{
  const forms=[...document.querySelectorAll('form[data-diagnostic-form],form[data-server-lead-form]')];
  if(!forms.length)return;
  const language=(document.documentElement.lang||'en').toLowerCase();
  const copy=language.startsWith('ru')?{
    sending:'Отправляем…',saved:'Заявка получена. Номер: ',error:'Не удалось сохранить заявку. Повторите попытку или напишите на ceo@k4-technology.com.'
  }:language.startsWith('fr')?{
    sending:'Envoi…',saved:'Demande reçue. Référence : ',error:'Impossible d’enregistrer la demande. Réessayez ou écrivez à ceo@k4-technology.com.'
  }:language.startsWith('zh')?{
    sending:'正在发送…',saved:'已收到请求。编号：',error:'无法保存请求。请重试或发送邮件至 ceo@k4-technology.com。'
  }:language.startsWith('es')?{
    sending:'Enviando…',saved:'Solicitud recibida. Referencia: ',error:'No se pudo guardar la solicitud. Inténtelo de nuevo o escriba a ceo@k4-technology.com.'
  }:language.startsWith('pt')?{
    sending:'Enviando…',saved:'Solicitação recebida. Referência: ',error:'Não foi possível salvar. Tente novamente ou escreva para ceo@k4-technology.com.'
  }:{
    sending:'Sending…',saved:'Request received. Reference: ',error:'We could not save your request. Please try again or email ceo@k4-technology.com.'
  };
  const attributionKeys=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','gclid','fbclid'];
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
  const requestId=()=>crypto.randomUUID().replaceAll('-','');
  const values=form=>[...new FormData(form).entries()].filter(([name,value])=>name!=='website'&&String(value).trim());
  const findStatus=form=>form.querySelector('[role="status"]')||(()=>{
    const node=document.createElement('div');node.className='rd-status';node.setAttribute('role','status');node.setAttribute('aria-live','polite');node.tabIndex=-1;form.append(node);return node;
  })();

  forms.forEach(form=>{
    form.dataset.serverLeadForm='true';
    const idKey=`k4_lead_request:${location.pathname}:${form.id||form.dataset.formType||'form'}`;
    const fingerprintKey=`${idKey}:payload`;
    let id='';
    let fingerprint='';
    try{id=sessionStorage.getItem(idKey)||'';fingerprint=sessionStorage.getItem(fingerprintKey)||'';}catch(error){/* In-memory idempotency remains available. */}
    let started=false;
    const submit=form.querySelector('button[type="submit"],input[type="submit"]');
    const originalLabel=submit?.textContent||submit?.value||'';
    const status=findStatus(form);
    const show=(title,body,isError=false)=>{
      const heading=document.createElement('h3');
      heading.textContent=title;
      const paragraph=document.createElement('p');
      paragraph.textContent=body;
      status.replaceChildren(heading,paragraph);
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
      const formType=form.dataset.formType||(form.matches('[data-diagnostic-form]')?'remote_diagnostics':'technical_review');
      const payloadFingerprint=JSON.stringify({formType,language:document.documentElement.lang||'en',sourceUrl:location.pathname,contact,message,details});
      if(!id||fingerprint!==payloadFingerprint){id=requestId();fingerprint=payloadFingerprint;}
      const currentId=id;
      try{sessionStorage.setItem(idKey,id);sessionStorage.setItem(fingerprintKey,fingerprint);}catch(error){/* The server still deduplicates this page session. */}
      const fields={Contact:contact,Message:message};
      details.forEach(item=>{fields[item.name]=item.value;});
      const payload={
        requestId:currentId,fields,formType,
        language:document.documentElement.lang||'en',
        sourceUrl:location.href,
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'unknown',
        attribution,
        safetyAck:entries.some(([name])=>/safety|sécurité|безопас/i.test(name)),
        website:trap.value
      };
      if(submit){submit.disabled=true;if(submit.tagName==='INPUT')submit.value=copy.sending;else submit.textContent=copy.sending;}
      track('lead_form_submit_attempt',{form_type:formType,form_location:form.dataset.location||'form'});
      try{
        const response=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.stored!==true)throw new Error(result.error||`HTTP ${response.status}`);
        show('K4',`${copy.saved}${result.reference||''}`);
        track('lead_form_submit_success',{form_type:formType,form_location:form.dataset.location||'form'});
        if(formType==='remote_diagnostics')track('diagnostic_case_submit_success',{form_type:formType,form_location:form.dataset.location||'diagnostic-form',request_reference:result.reference||'stored'});
        id='';
        try{sessionStorage.removeItem(idKey);sessionStorage.removeItem(fingerprintKey);}catch(error){/* Nothing to clean up in restricted storage. */}
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
