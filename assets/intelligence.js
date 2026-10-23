(()=>{
  if(window.__k4IntelligenceLoaded)return;
  window.__k4IntelligenceLoaded=true;

  const gaId='G-7ZWVHK5XV9';
  const internalKey='k4_internal';
  const search=new URLSearchParams(location.search);
  const internalControl=search.get(internalKey);
  const analyticsPageUrl=new URL(location.href);
  const utmKeys=new Set(['utm_source','utm_medium','utm_campaign','utm_content','utm_term']);
  let repairedLegacyUtm=false;
  for(const [key,value] of [...analyticsPageUrl.searchParams]){
    if(!key.startsWith('amp;utm_'))continue;
    const normalizedKey=key.slice(4);
    if(utmKeys.has(normalizedKey)&&!analyticsPageUrl.searchParams.has(normalizedKey)){
      analyticsPageUrl.searchParams.set(normalizedKey,value);
    }
    analyticsPageUrl.searchParams.delete(key);
    repairedLegacyUtm=true;
  }
  const legacyCampaignSources={
    existing_fleet_2026:'direct_outreach',
    data_center_power_2026:'direct_outreach'
  };
  const legacyCampaign=analyticsPageUrl.searchParams.get('utm_campaign');
  if(repairedLegacyUtm&&!analyticsPageUrl.searchParams.has('utm_source')&&legacyCampaignSources[legacyCampaign]){
    analyticsPageUrl.searchParams.set('utm_source',legacyCampaignSources[legacyCampaign]);
  }
  const effectiveSearch=analyticsPageUrl.searchParams;
  const qaSource=effectiveSearch.get('utm_source')==='codex_internal_test'&&effectiveSearch.get('utm_medium')==='qa';
  const isQa=qaSource||search.has('qa')||search.has('gtm_latency');
  const technicalParams=['k4_internal','qa','gtm_latency','release'];
  technicalParams.forEach(parameter=>analyticsPageUrl.searchParams.delete(parameter));
  const readInternalCookie=()=>{
    try{
      return document.cookie.split(';').some(part=>part.trim()===`${internalKey}=1`);
    }catch(error){
      return false;
    }
  };
  const writeInternalCookie=enabled=>{
    try{
      document.cookie=enabled
        ?`${internalKey}=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure`
        :`${internalKey}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
    }catch(error){
      // Cookies can be unavailable in privacy-restricted or sandboxed contexts.
    }
  };
  const setInternalFlag=enabled=>{
    try{
      if(enabled)localStorage.setItem(internalKey,'true');
      else localStorage.removeItem(internalKey);
    }catch(error){
      // Storage can be unavailable in privacy-restricted browsers; the cookie is the fallback.
    }
    writeInternalCookie(enabled);
  };
  if(internalControl==='1')setInternalFlag(true);
  if(internalControl==='0')setInternalFlag(false);

  let persistentInternal=false;
  try{
    persistentInternal=localStorage.getItem(internalKey)==='true';
  }catch(error){
    persistentInternal=readInternalCookie();
  }
  if(!persistentInternal){
    persistentInternal=readInternalCookie();
  }
  const isInternal=internalControl==='0'?false:persistentInternal||isQa;
  const trafficParams={};
  if(isInternal)trafficParams.traffic_type='internal';
  if(isQa)trafficParams.debug_mode=true;

  const localeSegments=new Set(['en','ru','zh','es','pt-br']);
  const routeInfo=pathname=>{
    const segments=pathname.split('/').filter(Boolean);
    if(localeSegments.has(segments[0]))segments.shift();
    if(!segments.length)return{pageType:'home'};
    const section=segments[0];
    const slug=segments[1];
    if(section==='services')return slug
      ?{pageType:'service',serviceSlug:slug}
      :{pageType:'services_index'};
    if(section==='case-studies')return slug
      ?{pageType:'case_study',caseSlug:slug}
      :{pageType:'case_studies_index'};
    if(section==='insights')return slug
      ?{pageType:'insight',articleSlug:slug}
      :{pageType:'insights_index'};
    if(section==='resources')return{pageType:'resource'};
    return{pageType:'other'};
  };
  const pagePath=location.pathname;
  const currentRoute=routeInfo(pagePath);
  const pageContext=()=>{
    const context={page_path:pagePath,page_type:currentRoute.pageType,...trafficParams};
    if(currentRoute.serviceSlug)context.service_slug=currentRoute.serviceSlug;
    if(currentRoute.caseSlug)context.case_slug=currentRoute.caseSlug;
    if(currentRoute.articleSlug)context.article_slug=currentRoute.articleSlug;
    return context;
  };

  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};
  const analyticsContext=pageContext();
  window.gtag('set',analyticsContext);
  if(!document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${gaId}"]`)){
    const script=document.createElement('script');
    script.async=true;
    script.src='https://www.googletagmanager.com/gtag/js?id='+gaId;
    script.dataset.k4Ga4='true';
    document.head.appendChild(script);
  }
  window.gtag('js',new Date());
  window.gtag('config',gaId,{...analyticsContext,page_location:analyticsPageUrl.href});
  if(analyticsPageUrl.href!==location.href){
    history.replaceState(history.state,'',`${analyticsPageUrl.pathname}${analyticsPageUrl.search}${analyticsPageUrl.hash}`);
  }

  const track=(name,detail={})=>{
    const cleanDetail=Object.fromEntries(
      Object.entries({...pageContext(),...detail}).filter(([,value])=>value!==undefined&&value!==null&&value!=='')
    );
    window.gtag('event',name,cleanDetail);
    window.dispatchEvent(new CustomEvent('k4:analytics',{detail:{event:name,...cleanDetail}}));
  };

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
    links.querySelectorAll('a').forEach(link=>link.addEventListener('click',close));
    document.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
  }

  const tableHintCopy={
    ru:'Прокрутите таблицу по горизонтали →',
    zh:'横向滑动查看完整表格 →',
    en:'Swipe to view the full table →'
  };
  const updateTableHints=()=>{
    const language=(document.documentElement.lang||'en').toLowerCase();
    const copy=language.startsWith('ru')?tableHintCopy.ru:language.startsWith('zh')?tableHintCopy.zh:tableHintCopy.en;
    document.querySelectorAll('.table-scroll').forEach(table=>{
      const previous=table.previousElementSibling;
      const current=previous?.classList.contains('table-scroll-hint')?previous:null;
      const needsHint=table.scrollWidth>table.clientWidth+1;
      if(needsHint&&!current){
        const hint=document.createElement('p');
        hint.className='table-scroll-hint';
        hint.textContent=copy;
        table.insertAdjacentElement('beforebegin',hint);
      }else if(!needsHint&&current){
        current.remove();
      }
    });
  };
  requestAnimationFrame(updateTableHints);
  window.addEventListener('resize',updateTableHints,{passive:true});

  const reviewField=document.querySelector('[data-review-type-field]');
  const ctaLocation=element=>element.dataset.location
    ||(element.closest('nav')?'navigation'
      :element.closest('.hero')?'hero'
      :element.closest('.cta-band')?'cta-band'
      :element.closest('aside')?'sidebar'
      :element.closest('footer')?'footer':'content');
  const contactType=(element,linkUrl)=>{
    const channel=(element.dataset.channel||'').toLowerCase();
    if(['email','phone','whatsapp','telegram'].includes(channel))return channel;
    if(linkUrl?.protocol==='mailto:')return'email';
    if(linkUrl?.protocol==='tel:')return'phone';
    const host=(linkUrl?.hostname||'').replace(/^www\./,'');
    if(host==='wa.me'||host.endsWith('.whatsapp.com'))return'whatsapp';
    if(host==='t.me'||host.endsWith('.telegram.me'))return'telegram';
    return undefined;
  };
  const destinationFor=linkUrl=>{
    if(!linkUrl)return undefined;
    if(!['http:','https:'].includes(linkUrl.protocol))return undefined;
    return linkUrl.origin===location.origin
      ?`${linkUrl.pathname}${linkUrl.hash}`
      :`${linkUrl.origin}${linkUrl.pathname}${linkUrl.hash}`;
  };
  const downloadable=(element,linkUrl)=>element.hasAttribute('download')
    ||/\.(?:pdf|docx?|xlsx?|csv|zip)$/i.test(linkUrl?.pathname||'');

  document.querySelectorAll('a[href], [data-event]').forEach(element=>element.addEventListener('click',()=>{
    const trackedThisGesture=new Set();
    const trackOnce=(name,detail)=>{
      if(trackedThisGesture.has(name))return;
      trackedThisGesture.add(name);
      track(name,detail);
    };
    const declaredEvent=element.dataset.event;
    const reviewType=element.dataset.reviewType;
    const href=element.getAttribute('href');
    const linkUrl=href?new URL(href,location.href):null;
    const targetRoute=linkUrl&&linkUrl.origin===location.origin?routeInfo(linkUrl.pathname):{};
    const type=contactType(element,linkUrl);
    const safeLinkUrl=type?undefined:destinationFor(linkUrl);
    const fileName=downloadable(element,linkUrl)
      ?decodeURIComponent(linkUrl?.pathname.split('/').pop()||'')
      :undefined;
    const locationName=ctaLocation(element);
    const service=element.dataset.service||targetRoute.serviceSlug||currentRoute.serviceSlug||reviewType;
    const baseDetail={
      location:element.dataset.location||pagePath,
      channel:element.dataset.channel,
      review_type:reviewType,
      language:element.dataset.language||document.documentElement.lang,
      file_name:fileName,
      link_url:safeLinkUrl
    };
    if(reviewType&&reviewField&&Array.from(reviewField.options).some(option=>option.value===reviewType)){
      reviewField.value=reviewType;
    }
    // GA4 Enhanced Measurement is the sole source of file_download. The global
    // analytics context above enriches that automatic event without duplicating it.
    if(declaredEvent&&declaredEvent!=='file_download'){
      const declaredDetail={...baseDetail};
      if(declaredEvent==='lead_contact_click'){
        declaredDetail.contact_type=type||'other';
        declaredDetail.cta_location=locationName;
      }
      if(declaredEvent==='service_review_cta_click'){
        declaredDetail.service=service||'unspecified';
        declaredDetail.cta_location=locationName;
      }
      if(declaredEvent==='article_cta_click'){
        declaredDetail.article=currentRoute.articleSlug||element.dataset.article||'unspecified';
        declaredDetail.destination=element.dataset.destination||destinationFor(linkUrl);
        declaredDetail.cta_location=locationName;
      }
      if(declaredEvent==='checklist_pdf_download'){
        declaredDetail.file_url=safeLinkUrl;
      }
      trackOnce(declaredEvent,declaredDetail);
    }
    if(type&&declaredEvent!=='lead_contact_click'){
      trackOnce('lead_contact_click',{
        ...baseDetail,
        contact_type:type,
        cta_location:locationName
      });
    }
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
      cta_location:form.dataset.location||'form',
      review_type:form.querySelector('[data-review-type-field]')?.value,
      service:currentRoute.serviceSlug||'remote-technical-review',
      language:document.documentElement.lang
    });
    form.addEventListener('input',()=>{
      if(!started){
        started=true;
        track('lead_form_start',formDetails());
      }
    });
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const data=new FormData(form);
      const lines=[
        form.dataset.formTitle||'K4 gas engine review request',
        '',
        ...Array.from(data.entries())
          .filter(([key,value])=>key!=='files'&&String(value).trim())
          .map(([key,value])=>`${key}: ${key==='Review type'?(reviewLabels[value]||value):value}`),
        '',
        'Submitting this information does not create an engagement.'
      ];
      const details=formDetails();
      track('lead_form_mailto_open',{...details,channel:'email',contact_type:'email'});
      const subject=form.dataset.formSubject||'Gas engine technical review';
      location.href=`mailto:ceo@k4-technology.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    });
  }

  window.setTimeout(()=>track('engaged_30s'),30_000);
  window.setTimeout(()=>track('engaged_60s'),60_000);

  const scrollMilestones=new Set();
  const trackScroll=()=>{
    const documentHeight=Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0);
    if(!documentHeight)return;
    const depth=Math.min(100,Math.round(((window.scrollY+window.innerHeight)/documentHeight)*100));
    [{depth:50,event:'scroll_50'},{depth:90,event:'scroll_90'}].forEach(milestone=>{
      if(depth>=milestone.depth&&!scrollMilestones.has(milestone.depth)){
        scrollMilestones.add(milestone.depth);
        track(milestone.event,{scroll_depth:milestone.depth});
      }
    });
  };
  window.addEventListener('scroll',trackScroll,{passive:true});
})();
