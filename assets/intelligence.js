(()=>{
  const gaId='G-7ZWVHK5XV9';
  if(!document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${gaId}"]`)){
    window.dataLayer=window.dataLayer||[];
    window.gtag=window.gtag||function(){dataLayer.push(arguments)};
    const s=document.createElement('script');
    s.async=true;
    s.src='https://www.googletagmanager.com/gtag/js?id='+gaId;
    s.dataset.k4Ga4='true';
    document.head.appendChild(s);
    gtag('js',new Date());
    gtag('config',gaId);
  }

  const menuButton=document.querySelector('[data-menu]');
  const links=document.querySelector('[data-nav]');
  if(menuButton&&links){
    const close=()=>{
      menuButton.setAttribute('aria-expanded','false');
      links.classList.remove('open');
    };
    menuButton.addEventListener('click',()=>{
      const open=menuButton.getAttribute('aria-expanded')==='true';
      menuButton.setAttribute('aria-expanded',String(!open));
      links.classList.toggle('open',!open);
    });
    links.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  }

  const track=(name,detail={})=>{
    const cleanDetail=Object.fromEntries(Object.entries(detail).filter(([,value])=>value!==undefined&&value!==''));
    if(typeof window.gtag==='function'){
      window.gtag('event',name,cleanDetail);
    }else{
      window.dataLayer?.push({event:name,...cleanDetail});
    }
    window.dispatchEvent(new CustomEvent('k4:analytics',{detail:{event:name,...cleanDetail}}));
  };

  const reviewField=document.querySelector('[data-review-type-field]');
  document.querySelectorAll('[data-event]').forEach(el=>el.addEventListener('click',()=>{
    const reviewType=el.dataset.reviewType;
    const href=el.getAttribute('href');
    const linkUrl=href?new URL(href,location.href):null;
    const fileName=el.hasAttribute('download')&&linkUrl?decodeURIComponent(linkUrl.pathname.split('/').pop()||''):undefined;
    if(reviewType&&reviewField&&Array.from(reviewField.options).some(option=>option.value===reviewType)){
      reviewField.value=reviewType;
    }
    track(el.dataset.event,{
      location:el.dataset.location||location.pathname,
      channel:el.dataset.channel,
      review_type:reviewType,
      language:el.dataset.language||document.documentElement.lang,
      file_name:fileName,
      link_url:linkUrl?.href
    });
  }));

  const form=document.querySelector('[data-lead-form]');
  if(form){
    let started=false;
    const reviewLabels={
      quick:'Quick Review — USD 450',
      full:'Full Remote Review — USD 950',
      financial_model:'Project Financial Model Review',
      not_sure:'Not sure'
    };
    const formDetails=()=>({
      location:form.dataset.location||'form',
      review_type:form.querySelector('[data-review-type-field]')?.value,
      language:document.documentElement.lang
    });
    form.addEventListener('input',()=>{
      if(!started){
        started=true;
        track('equipment_form_start',formDetails());
      }
    });
    form.addEventListener('submit',e=>{
      e.preventDefault();
      const d=new FormData(form);
      const lines=[
        form.dataset.formTitle||'K4 gas engine review request',
        '',
        ...Array.from(d.entries())
          .filter(([k,v])=>k!=='files'&&String(v).trim())
          .map(([k,v])=>`${k}: ${k==='Review type'?(reviewLabels[v]||v):v}`),
        '',
        'Submitting this information does not create an engagement.'
      ];
      const details=formDetails();
      track('equipment_form_submit',details);
      track('lead_contact_click',{...details,channel:'email'});
      const subject=form.dataset.formSubject||'Gas engine technical review';
      location.href=`mailto:ceo@k4-technology.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    });
  }
})();
