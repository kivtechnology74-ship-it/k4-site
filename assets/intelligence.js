(()=>{
  if(window.__k4IntelligenceLoaded)return;
  window.__k4IntelligenceLoaded=true;

  const gaId='G-7ZWVHK5XV9';
  const internalKey='k4_internal';
  const consentKey='k4_analytics_consent';
  const savedConsent=(()=>{try{return document.cookie.split(';').map(item=>item.trim()).find(item=>item.startsWith(`${consentKey}=`))?.split('=').slice(1).join('=')||'';}catch(error){return'';}})();
  window.k4AnalyticsConsent=savedConsent==='granted';
  const consentCopy={
    en:{title:'Help us improve K4',body:'With your permission, K4 uses Google Analytics and privacy-minimized calculator events to understand site use. No project figures or contact details are sent as analytics.',accept:'Accept analytics',reject:'Reject analytics',settings:'Privacy settings',policy:'Privacy notice'},
    ru:{title:'Помогите улучшить сайт K4',body:'С вашего разрешения K4 использует Google Analytics и минимизированные события калькулятора, чтобы понимать использование сайта. Числовые параметры проекта и контактные данные не передаются в аналитику.',accept:'Разрешить аналитику',reject:'Отказаться',settings:'Настройки приватности',policy:'Политика конфиденциальности'},
    fr:{title:'Aidez-nous à améliorer K4',body:'Avec votre accord, K4 utilise Google Analytics et des événements du calculateur minimisés pour comprendre l’utilisation du site. Les chiffres du projet et les coordonnées ne sont pas envoyés à des fins analytiques.',accept:'Accepter l’analyse',reject:'Refuser l’analyse',settings:'Paramètres de confidentialité',policy:'Politique de confidentialité'},
    es:{title:'Ayúdenos a mejorar K4',body:'Con su permiso, K4 utiliza Google Analytics y eventos minimizados de la calculadora para comprender el uso del sitio. No se envían cifras del proyecto ni datos de contacto a analítica.',accept:'Aceptar analítica',reject:'Rechazar analítica',settings:'Ajustes de privacidad',policy:'Política de privacidad'},
    'pt-br':{title:'Ajude a melhorar a K4',body:'Com sua autorização, a K4 usa o Google Analytics e eventos minimizados da calculadora para entender o uso do site. Valores do projeto e dados de contato não são enviados para análise.',accept:'Aceitar análise',reject:'Recusar análise',settings:'Configurações de privacidade',policy:'Política de privacidade'},
    zh:{title:'帮助我们改进 K4',body:'经您同意后，K4 会使用 Google Analytics 和经过最小化处理的计算器事件来了解网站使用情况。项目数值和联系信息不会发送到分析系统。',accept:'同意分析',reject:'拒绝分析',settings:'隐私设置',policy:'隐私政策'}
  };
  const pageLanguage=(document.documentElement.lang||'en').toLowerCase();
  const consentLanguage=pageLanguage.startsWith('ru')?'ru':pageLanguage.startsWith('fr')?'fr':pageLanguage.startsWith('es')?'es':pageLanguage.startsWith('pt')?'pt-br':pageLanguage.startsWith('zh')?'zh':'en';
  const consentText=consentCopy[consentLanguage];
  const privacyPath={ru:'/ru/privacy/',fr:'/fr/privacy/',es:'/es/privacy/','pt-br':'/pt-br/privacy/',zh:'/zh/privacy/'}[consentLanguage]||'/privacy/';
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
  const calculatorIdParam=search.get('calc_id');
  const applyCalculatorId=()=>{
    const field=document.querySelector('[name="calc_id"]');
    if(field&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(calculatorIdParam||''))field.value=calculatorIdParam;
  };
  applyCalculatorId();
  document.addEventListener('DOMContentLoaded',applyCalculatorId,{once:true});
  const technicalParams=['k4_internal','qa','gtm_latency','release','calc_id'];
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
  window.k4AnalyticsInternal=isInternal;

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
    if(section==='gpu-estimate')return{pageType:'calculator'};
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
  const analyticsAllowed=()=>window.k4AnalyticsConsent===true&&(typeof navigator==='undefined'||!['1','yes'].includes(String(navigator.doNotTrack||'').toLowerCase()));
  const sanitizedReferrer=()=>{
    try{
      if(!document.referrer)return'';
      const referrer=new URL(document.referrer);
      for(const key of [...referrer.searchParams.keys()])if(!utmKeys.has(key))referrer.searchParams.delete(key);
      return referrer.href;
    }catch(error){return'';}
  };
  const deniedConsent={analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'};
  window.gtag('consent','default',deniedConsent);
  let gaConfigured=false;
  const loadAnalytics=()=>{
    if(!analyticsAllowed()||gaConfigured)return;
    window.gtag('consent','update',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    window.gtag('set',analyticsContext);
    if(!document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${gaId}"]`)){
      const script=document.createElement('script');
      script.async=true;
      script.src='https://www.googletagmanager.com/gtag/js?id='+gaId;
      script.dataset.k4Ga4='true';
      document.head.appendChild(script);
    }
    window.gtag('js',new Date());
    window.gtag('config',gaId,{...analyticsContext,page_location:analyticsPageUrl.href,page_referrer:sanitizedReferrer()});
    gaConfigured=true;
  };
  if(analyticsAllowed())loadAnalytics();
  if(analyticsPageUrl.href!==location.href){
    history.replaceState(history.state,'',`${analyticsPageUrl.pathname}${analyticsPageUrl.search}${analyticsPageUrl.hash}`);
  }

  const track=(name,detail={})=>{
    if(!analyticsAllowed())return;
    const cleanDetail=Object.fromEntries(
      Object.entries({...pageContext(),...detail}).filter(([,value])=>value!==undefined&&value!==null&&value!=='')
    );
    window.gtag('event',name,cleanDetail);
    window.dispatchEvent(new CustomEvent('k4:analytics',{detail:{event:name,...cleanDetail}}));
  };

  const saveConsent=value=>{
    const granted=value==='granted';
    window.k4AnalyticsConsent=granted;
    try{document.cookie=`${consentKey}=${value}; Max-Age=15552000; Path=/; SameSite=Lax; Secure`;}catch(error){}
    if(granted)loadAnalytics();
    else{
      window.gtag('consent','update',deniedConsent);
      for(const cookie of document.cookie.split(';')){
        const name=cookie.trim().split('=')[0];
        if(!name.startsWith('_ga'))continue;
        document.cookie=`${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
        if(location.hostname.endsWith('k4-technology.com'))document.cookie=`${name}=; Max-Age=0; Path=/; Domain=.k4-technology.com; SameSite=Lax; Secure`;
      }
    }
    window.dispatchEvent(new CustomEvent('k4:analytics-consent-changed',{detail:{granted}}));
    const banner=document.getElementById('k4-consent-banner');
    if(banner)banner.hidden=true;
  };
  const style=document.createElement('style');
  style.textContent='#k4-consent-banner[hidden]{display:none!important}#k4-consent-banner{position:fixed;z-index:2147483000;left:50%;bottom:16px;transform:translateX(-50%);width:min(720px,calc(100vw - 28px));padding:18px 20px;background:#101821;color:#eef4f8;border:1px solid #526170;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.28);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}#k4-consent-banner h2{margin:0 0 5px;font-size:17px;line-height:1.3;color:#fff}#k4-consent-banner p{margin:0 0 12px;color:#d1dbe3}#k4-consent-banner a{color:#b7d9f2;text-decoration:underline}#k4-consent-banner .k4-consent-actions{display:flex;gap:10px;flex-wrap:wrap}#k4-consent-banner button{flex:1 1 190px;min-height:42px;padding:8px 14px;border:1px solid #9bb0c2;border-radius:7px;background:#17232f;color:#fff;font:600 14px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer}#k4-consent-banner button:hover{background:#263a4d}#k4-consent-banner button:focus-visible,#k4-privacy-settings:focus-visible{outline:3px solid #8ac8fa;outline-offset:2px}#k4-privacy-settings{border:0;background:transparent;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;padding:0}@media(max-width:560px){#k4-consent-banner{bottom:8px;padding:14px 15px}#k4-consent-banner .k4-consent-actions{display:grid;grid-template-columns:1fr}#k4-consent-banner button{width:100%}}';
  style.textContent+='.k4-consent-footer{position:fixed;right:12px;bottom:10px;z-index:2147482000;color:#25323d;background:rgba(255,255,255,.94);border:1px solid #cbd5dc;border-radius:7px;padding:7px 10px;font:12px/1.3 system-ui,-apple-system,Segoe UI,sans-serif}.k4-consent-footer #k4-privacy-settings{font-size:12px}@media(max-width:560px){.k4-consent-footer{right:8px;bottom:8px}}';
  document.head.appendChild(style);
  let footer=document.querySelector('footer');
  if(!footer){
    footer=document.createElement('footer');
    footer.className='k4-consent-footer';
    footer.setAttribute('aria-label',consentText.settings);
    document.body.appendChild(footer);
  }
  if(footer){
    const holder=footer.querySelector('.footer-links')||footer;
    if(!footer.querySelector('#k4-privacy-settings')){
      const settings=document.createElement('button');settings.id='k4-privacy-settings';settings.type='button';settings.textContent=consentText.settings;settings.addEventListener('click',()=>{const banner=document.getElementById('k4-consent-banner');if(banner)banner.hidden=false;});
      holder.append(' ',settings,' ');
      const link=document.createElement('a');link.href=privacyPath;link.textContent=consentText.policy;holder.append(link);
    }
  }
  const banner=document.createElement('section');banner.id='k4-consent-banner';banner.setAttribute('role','region');banner.setAttribute('aria-label',consentText.settings);banner.hidden=Boolean(savedConsent);
  const title=document.createElement('h2');title.textContent=consentText.title;
  const body=document.createElement('p');body.append(document.createTextNode(consentText.body+' '));
  const policy=document.createElement('a');policy.href=privacyPath;policy.textContent=consentText.policy;body.append(policy);
  const actions=document.createElement('div');actions.className='k4-consent-actions';
  const accept=document.createElement('button');accept.type='button';accept.textContent=consentText.accept;accept.addEventListener('click',()=>saveConsent('granted'));
  const reject=document.createElement('button');reject.type='button';reject.textContent=consentText.reject;reject.addEventListener('click',()=>saveConsent('denied'));
  actions.append(accept,reject);banner.append(title,body,actions);document.body.appendChild(banner);

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
  if(form&&!form.hasAttribute('data-server-lead-form')){
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
