(() => {
  'use strict';
  const overlay = document.getElementById('funnel-overlay');
  const content = document.getElementById('funnel-content');
  const menu = document.getElementById('site-nav');
  const menuToggle = document.getElementById('menu-toggle');
  const CATEGORIES = [
    ['lead-generation','Lead generation & prospecting'],
    ['appointment-setting','Appointment setting'],
    ['customer-support','Customer support'],
    ['crm-operations','CRM & pipeline operations'],
    ['technical-support','Technical support'],
    ['operations-support','Project & operations coordination'],
    ['other','Something else']
  ];
  const h = x => String(x == null ? '' : x).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const track = (event, detail = {}) => {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
    fetch('/api/events', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,detail:{page:location.pathname,...detail}}),keepalive:true}).catch(()=>{});
  };
  const state = () => ({step:0,kind:'client',intent:'',services:[],description:'',engagement:'',name:'',email:'',phone:'',company:'',consentContact:false,consentWhatsapp:false,source:'',leadId:'',config:null,submitted:false});
  let data = state();
  let previousFocus = null;
  let saving = false;
  let lastNotice = '';

  const allowFunnelClose=()=>track('funnel_close',{step:data.step,submitted:data.submitted?'yes':'no'});
  const labels=['intent','services','details','engagement','contact'];
  function showOverlay(kind='client', service='') {
    data = state(); data.kind=kind; data.source=service || location.pathname;
    if(service) {data.services=[service]; data.step=2; data.intent='specific-service';}
    previousFocus=document.activeElement;
    overlay.hidden=false; document.body.classList.add('modal-open');
    render(); document.getElementById('close-funnel').focus();
    track(kind==='recruiter'?'recruiter_form_open':'funnel_start',{service});
  }
  function closeOverlay(){ const wasOpen=!overlay.hidden; overlay.hidden=true;document.body.classList.remove('modal-open'); if(previousFocus && previousFocus.focus) previousFocus.focus(); if(wasOpen) allowFunnelClose(); }
  function wizardHeader(){
    const labels=['YOUR GOAL','YOUR SERVICES','YOUR REQUIREMENTS','WORKING STYLE','YOUR DETAILS','CALENDAR'];
    const idx=Math.min(data.step,5);
    return `<div class="funnel-top"><span>${data.kind==='client'?'LET’S TALK BUSINESS':'INTERVIEW REQUEST'}</span><small>${data.kind==='client'?`0${idx+1} / 06 · ${labels[idx]}`:'RECRUITER CONTACT'}</small></div><div class="progress-track" aria-hidden="true"><div style="width:${data.kind==='client'?Math.round((idx+1)/6*100):55}%"></div></div>`;
  }
  const navButtons=(back=true,label='Continue')=>`<div class="funnel-footer">${back?'<button class="back-btn" type="button" id="funnel-back">← Back</button>':'<span></span>'}<button type="button" id="funnel-next" class="btn btn-green">${label} <span>↗</span></button></div><p class="form-message" id="funnel-error" role="alert"></p>`;
  function option(value,label,multi=false){let selected=multi?data.services.includes(value):(data.step===0?data.intent:data.engagement)===value; return `<button type="button" class="choice-button ${selected?'selected':''}" data-choice="${h(value)}" aria-pressed="${selected}">${h(label)}</button>`;}
  function render(){
    if(data.kind==='recruiter'){renderRecruiter();return;}
    let html=wizardHeader();
    if(data.step===0) html+=`<h2>What brings you here?</h2><p class="funnel-description">Let's make sure we focus on what matters to you.</p><div class="choice-grid">${option('specific-service','I need a specific service')}${option('ongoing-support','I need ongoing professional support')}${option('collaboration','I want to explore a collaboration')}${option('hiring-contract','I want to hire Adnan for a project')}${option('recruiter','I’m a recruiter / employer')}${option('other','Something else')}</div>${navButtons(false)}`;
    if(data.step===1) html+=`<h2>What would you like help with?</h2><p class="funnel-description">Choose as many as you need. We can figure out the details together.</p><div class="choice-grid">${CATEGORIES.map(([value,label])=>option(value,label,true)).join('')}</div>${navButtons()}`;
    if(data.step===2) html+=`<h2>Tell me a little about the work.</h2><p class="funnel-description">What's the situation, goal, or challenge? A few sentences are enough. This is optional.</p><div class="field"><label for="funnel-description">Project or business requirements</label><textarea maxlength="2000" id="funnel-description" placeholder="For example: We need help responding to real estate leads and scheduling qualified appointments...">${h(data.description)}</textarea></div>${navButtons()}`;
    if(data.step===3) html+=`<h2>What kind of support fits best?</h2><p class="funnel-description">This helps me understand the shape of the opportunity.</p><div class="choice-grid">${option('one-time','One-time project')}${option('ongoing','Ongoing support')}${option('part-time','Part-time arrangement')}${option('full-time','Full-time contract')}${option('exploring','Still exploring')}</div>${navButtons()}`;
    if(data.step===4) html+=`<h2>Where can I reach you?</h2><p class="funnel-description">Your details are only used to respond to this inquiry and help coordinate a conversation.</p><form id="contact-fields"><div class="field-group"><div class="field"><label for="contact-name">Full name *</label><input id="contact-name" type="text" autocomplete="name" maxlength="120" required value="${h(data.name)}"></div><div class="field"><label for="contact-email">Email address *</label><input id="contact-email" type="email" autocomplete="email" maxlength="254" required value="${h(data.email)}"></div><div class="field"><label for="contact-company">Company / business</label><input id="contact-company" type="text" autocomplete="organization" maxlength="120" value="${h(data.company)}"></div><div class="field"><label for="contact-phone">Phone number (optional)</label><input id="contact-phone" type="tel" autocomplete="tel" maxlength="25" placeholder="+1 555 000 0000" value="${h(data.phone)}"><small>Optional. Include your country code. Adnan may call or text about this inquiry; no marketing texts.</small></div></div><label class="checkbox-row"><input type="checkbox" id="contact-consent" ${data.consentContact?'checked':''} required><span>I agree to be contacted about this inquiry (by email or, if I provide a number, by call or text) and understand how my details will be used in the <a href="/privacy/" target="_blank" rel="noopener" style="text-decoration:underline">privacy notice</a>. *</span></label></form>${navButtons(true,'Continue to scheduling')}`;
    if(data.step===5) { renderBooking();return; }
    content.innerHTML=html;
    content.querySelectorAll('[data-choice]').forEach(el=>el.addEventListener('click',()=>{
      const value=el.dataset.choice;
      if(data.step===0 && value==='recruiter') {data.kind='recruiter';data.step=0;render();return;}
      if(data.step===1){ if(data.services.includes(value))data.services=data.services.filter(v=>v!==value);else data.services=[...data.services,value]; }
      else if(data.step===0)data.intent=value;else if(data.step===3)data.engagement=value;
      render();
    }));
    const next=document.getElementById('funnel-next'); if(next)next.addEventListener('click',nextStep);
    const back=document.getElementById('funnel-back');if(back)back.addEventListener('click',()=>{persistFields();data.step=Math.max(0,data.step-1);render();});
  }
  function persistFields(){
    const text=document.getElementById('funnel-description');if(text)data.description=text.value.trim();
    const fields=[['contact-name','name'],['contact-email','email'],['contact-company','company'],['contact-phone','phone']];
    fields.forEach(([id,key])=>{const el=document.getElementById(id);if(el)data[key]=el.value.trim();});
    if(document.getElementById('contact-consent'))data.consentContact=document.getElementById('contact-consent').checked;
    if(document.getElementById('whatsapp-consent'))data.consentWhatsapp=document.getElementById('whatsapp-consent').checked;
  }
  function error(message){const el=document.getElementById('funnel-error');if(el){el.textContent=message;el.scrollIntoView({block:'nearest'});} }
  async function nextStep(){
    if(saving)return;
    persistFields();
    if(data.step===0&&!data.intent)return error('Please select the option that best describes your inquiry.');
    if(data.step===1&&!data.services.length)return error('Please choose at least one service.');
    if(data.step===3&&!data.engagement)return error('Please choose your preferred engagement.');
    if(data.step===4){
      const form=document.getElementById('contact-fields'); if(!form.reportValidity())return;
      if(!/^\+?[0-9\s().-]{7,25}$/.test(data.phone) && data.phone) return error('Please use a valid phone number with the country code.');
      if(!data.consentContact)return error('Consent is required to submit this inquiry.');
      track('question_completed',{page:'step:contact'});
      return submitLead();
    }
    track('question_completed',{page:'step:'+labels[data.step]});
    data.step++;track('funnel_step',{step:data.step});render();
  }
  function utm(){const u=new URLSearchParams(location.search);const fields=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];return Object.fromEntries(fields.filter(k=>u.has(k)).map(k=>[k,u.get(k).slice(0,120)]));}
  async function sendLead(payload){
    const response=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    let result={};try{result=await response.json();}catch{}
    if(!response.ok)throw new Error(result.error||'Unable to submit your request.');
    return result;
  }
  function mailtoFallback(kind){
    const lines=[`Name: ${data.name}`,`Email: ${data.email}`,`Phone: ${data.phone||'—'}`,`Company: ${data.company||'—'}`,kind==='recruiter'?'Type: Recruiter / employer':'Type: Client inquiry'];
    if(kind!=='recruiter'){lines.push(`Services: ${(data.services||[]).join(', ')||'—'}`,`Engagement: ${data.engagement||'—'}`,`Intent: ${data.intent||'—'}`,`Details: ${data.description||'—'}`);}
    if(kind==='recruiter')lines.push(`Role & interview window: ${data.description||'—'}`);
    const subject=encodeURIComponent(kind==='recruiter'?'Interview request via adnanhamza.online':'Discovery call request via adnanhamza.online');
    const href=`mailto:nothinggamer03@gmail.com?subject=${subject}&body=${encodeURIComponent(lines.join('\n'))}`;
    return `<div class="booking-notice" role="status">This page copy can’t reach the website server — your inquiry hasn’t been saved yet. <strong>Nothing is lost:</strong> press the button below and your email app will open with everything you typed already filled in.</div><div class="funnel-footer"><button class="back-btn" type="button" id="funnel-edit">← Edit my details</button><a class="btn btn-green" href="${href}">Email Adnan directly ↗</a></div>`;
  }
  async function submitLead(){
    saving=true; const button=document.getElementById('funnel-next');if(button){button.disabled=true;button.textContent='Saving your inquiry…';}
    try{
      const result=await sendLead({type:'client',name:data.name,email:data.email,phone:data.phone,company:data.company,intent:data.intent,services:data.services,description:data.description,engagement:data.engagement,contactConsent:data.consentContact,whatsappConsent:data.consentWhatsapp,source:data.source,utm:utm()});
      data.leadId=result.id;data.step=5;data.submitted=true;data.config=result;track('contact_submitted',{type:'client'});render();
    }catch(e){const btn=document.getElementById('funnel-next');if(btn)btn.style.display='none';const msg=document.getElementById('funnel-error');if(msg){msg.innerHTML=mailtoFallback('client');const edit=document.getElementById('funnel-edit');if(edit)edit.addEventListener('click',()=>{data.step=4;render();});}return;}finally{saving=false;}
  }
  function calUrl(base){
    try{const url=new URL(base);url.searchParams.set('name',data.name);url.searchParams.set('email',data.email);url.searchParams.set('metadata[leadId]',data.leadId);const u=utm();for(const [key,val] of Object.entries(u))url.searchParams.set(key,val);return url.toString();}catch{return '';}
  }
  function renderBooking(){
    const link=data.config?.bookingUrl;
    let html=wizardHeader();
    html+=`<div class="booking-success"><span class="success-icon" aria-hidden="true">✓</span><h2>Your inquiry is saved.</h2><p>Thanks, ${h(data.name.split(' ')[0])}. Your details have been recorded. ${link?'Choose a time below using the live scheduling provider.':'I can follow up using the contact information you submitted.'}</p>`;
    if(link){const url=calUrl(link);html+=`<div class="booking-notice">Your appointment is <strong>not booked yet</strong>. Choose a date and time in the calendar below. You will receive a booking confirmation only after the scheduling provider accepts it.</div><div class="calendar-frame"><iframe title="Live appointment scheduling with Cal.com" src="${h(url)}" loading="lazy" allow="camera; microphone; fullscreen"></iframe></div><p class="calendar-disclaimer">If the calendar does not load, <a href="${h(url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">open the secure booking page ↗</a>. Availability, timezone and double-booking prevention are managed by Cal.com.</p>`;}
    else html+=`<div class="booking-notice">Live calendar booking isn't connected yet. This is <strong>not</strong> a confirmed appointment. Your inquiry has been saved and you can also <a href="mailto:nothinggamer03@gmail.com?subject=Discovery%20call%20request" style="text-decoration:underline">email Adnan directly</a>.</div>`;
    html+=`<div class="funnel-footer"><button class="back-btn" type="button" id="funnel-finish">Close</button><a class="btn btn-outline" href="/">Return home ↗</a></div></div>`;
    content.innerHTML=html;document.getElementById('funnel-finish').addEventListener('click',closeOverlay);
  }
  function renderRecruiter(){
    const html=`${wizardHeader()}<h2>Tell me about the opportunity.</h2><p class="funnel-description">A short, direct interview request. No customer qualification steps.</p><form id="recruiter-fields"><div class="field-group"><div class="field"><label for="recruiter-name">Your name *</label><input id="recruiter-name" autocomplete="name" maxlength="120" required value="${h(data.name)}"></div><div class="field"><label for="recruiter-email">Work email *</label><input id="recruiter-email" type="email" autocomplete="email" required maxlength="254" value="${h(data.email)}"></div><div class="field"><label for="recruiter-company">Company *</label><input id="recruiter-company" maxlength="120" required value="${h(data.company)}"></div><div class="field"><label for="recruiter-phone">Phone (optional)</label><input id="recruiter-phone" type="tel" autocomplete="tel" maxlength="25" placeholder="+1 555 000 0000" value="${h(data.phone)}"><small>Optional. Include your country code. Adnan may call or text about this role; no marketing texts.</small></div><div class="field full"><label for="recruiter-role">Role, requirements and suggested interview time *</label><textarea id="recruiter-role" required maxlength="2000" placeholder="Position title, key requirements, timezone and a suitable interview window">${h(data.description)}</textarea></div></div><label class="checkbox-row"><input type="checkbox" id="recruiter-consent" ${data.consentContact?'checked':''} required><span>I consent to being contacted about this recruitment inquiry by email or, if I provide a number, by call or text. See the <a href="/privacy/" target="_blank" rel="noopener" style="text-decoration:underline">privacy notice</a>. *</span></label></form><div class="funnel-footer"><button class="back-btn" type="button" id="switch-to-client">← I'm a client</button><button class="btn btn-green" type="button" id="send-recruiter">Send interview request ↗</button></div><p class="form-message" role="alert" id="funnel-error"></p>`;
    if(data.submitted){
      const bookingUrl=data.config?.bookingUrl;
      content.innerHTML=`${wizardHeader()}<div class="booking-success"><span class="success-icon">✓</span><h2>Interview request received.</h2><p>Thank you, ${h(data.name)}. Your inquiry is saved. Adnan can follow up directly. ${bookingUrl?'You can also select an interview slot below if you prefer.':''}</p>${bookingUrl?`<div class="booking-notice">Selecting a time with Cal.com completes the booking. Your request alone is not a confirmed meeting.</div><div class="calendar-frame"><iframe title="Recruiter interview scheduling" loading="lazy" src="${h(calUrl(bookingUrl))}"></iframe></div>`:''}<div class="funnel-footer"><button class="back-btn" type="button" id="funnel-finish">Close</button><a class="btn btn-outline" href="/assets/Adnan-Hamza-CV.pdf" download>Download CV ↓</a></div></div>`;
      document.getElementById('funnel-finish').addEventListener('click',closeOverlay);return;
    }
    content.innerHTML=html;
    document.getElementById('switch-to-client').addEventListener('click',()=>{data=state();render();});
    document.getElementById('send-recruiter').addEventListener('click',async()=>{
      if(saving)return;
      const form=document.getElementById('recruiter-fields');if(!form.reportValidity())return;
      const get=id=>document.getElementById(id).value.trim();
      data.name=get('recruiter-name');data.email=get('recruiter-email');data.company=get('recruiter-company');data.phone=get('recruiter-phone');data.description=get('recruiter-role');data.consentContact=document.getElementById('recruiter-consent').checked;
      saving=true;const button=document.getElementById('send-recruiter');button.disabled=true;button.textContent='Sending…';
      try{const result=await sendLead({type:'recruiter',name:data.name,email:data.email,company:data.company,phone:data.phone,description:data.description,contactConsent:data.consentContact,source:location.pathname,utm:utm()});data.leadId=result.id;data.config=result;data.submitted=true;track('contact_submitted',{type:'recruiter'});render();}
      catch(e){button.style.display='none';const msg=document.getElementById('funnel-error');if(msg){msg.innerHTML=mailtoFallback('recruiter');const edit=document.getElementById('funnel-edit');if(edit)edit.addEventListener('click',()=>render());}return;}finally{saving=false;}
    });
  }
  document.querySelectorAll('[data-open-funnel]').forEach(button=>button.addEventListener('click',()=>showOverlay(button.dataset.openFunnel,button.dataset.service||'')));
  document.getElementById('close-funnel').addEventListener('click',closeOverlay);
  overlay.addEventListener('mousedown',e=>{if(e.target===overlay)closeOverlay();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden)closeOverlay();if(e.key==='Tab'&&!overlay.hidden){const focusables=[...overlay.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled])')].filter(el=>el.offsetParent!==null);if(focusables.length){const first=focusables[0],last=focusables[focusables.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}});
  menuToggle.addEventListener('click',()=>{const open=menu.classList.toggle('open');menuToggle.setAttribute('aria-expanded',String(open));});
  document.querySelectorAll('.site-header nav a').forEach(x=>x.addEventListener('click',()=>{menu.classList.remove('open');menuToggle.setAttribute('aria-expanded','false');}));
  document.querySelectorAll('[data-track="cv_download"]').forEach(x=>x.addEventListener('click',()=>track('cv_download')));
  track('page_view');
  if(location.pathname.startsWith('/services/'))track('service_view',{service:location.pathname.split('/')[2]});
  // Honest placeholder: the intro play button only reveals an honest notice until a real first-party video is configured.
  const playBtn=document.getElementById('intro-play');
  if(playBtn)playBtn.addEventListener('click',()=>{const notice=document.getElementById('video-notice');if(notice){notice.hidden=false;notice.scrollIntoView({block:'nearest'});}});
  fetch('/api/config').then(r=>r.ok?r.json():{}).then(c=>{
    if(c.introVideoUrl){const holder=document.getElementById('intro-video');const stage=holder&&holder.querySelector('.video-stage');if(stage){const video=document.createElement('video');video.className='video-embed';video.controls=true;video.preload='metadata';video.setAttribute('playsinline','');video.setAttribute('aria-label','Introduction video by Adnan Hamza');video.src=c.introVideoUrl;stage.replaceChildren(video);video.addEventListener('play',()=>track('video_play'));}}
  }).catch(()=>{});
  // Scroll-triggered reveals (disabled automatically for reduced-motion users via CSS)
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealEls=document.querySelectorAll('.reveal');
  if(reduceMotion||!('IntersectionObserver' in window)){revealEls.forEach(el=>el.classList.add('in'));}else{const io=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){entry.target.classList.add('in');io.unobserve(entry.target);}}},{threshold:.12,rootMargin:'0px 0px -8% 0px'});revealEls.forEach(el=>io.observe(el));}
  // Reusable service video slot: auto-upgrades to a real /assets/videos/<slug>.mp4 if present; otherwise the honest placeholder stays.
  document.querySelectorAll('[data-service-video]').forEach(card=>{
    const slug=card.dataset.serviceVideo;
    fetch(`/assets/videos/${slug}.mp4`,{method:'HEAD'}).then(r=>{
      if(!r.ok)return;
      const video=document.createElement('video');
      video.className='service-video-embed';video.controls=true;video.preload='metadata';video.setAttribute('playsinline','');video.src=`/assets/videos/${slug}.mp4`;video.setAttribute('aria-label',`Service video: ${slug.replace(/-/g,' ')}`);
      card.replaceChildren();video.addEventListener('play',()=>track('video_play',{service:slug}));card.replaceWith(video);
    }).catch(()=>{});
  });
  document.querySelectorAll('[data-service-video-play]').forEach(btn=>btn.addEventListener('click',()=>{const note=document.getElementById('sv-note-'+btn.dataset.serviceVideoPlay);if(note)note.hidden=false;}));
  // One-time, subtle engagement nudge: 3.5s without any interaction and not dismissed this session. Never on /admin/.
  (function nudge(){
    const nudgeEl=document.getElementById('engagement-nudge');if(!nudgeEl||location.pathname.startsWith('/admin/'))return;
    try{if(sessionStorage.getItem('nudgeDone')==='1')return;}catch(e){return;}
    let engaged=false;
    const mark=()=>{engaged=true;window.removeEventListener('pointerdown',mark);window.removeEventListener('keydown',mark);window.removeEventListener('scroll',mark);window.removeEventListener('touchstart',mark);};
    window.addEventListener('pointerdown',mark,{passive:true});window.addEventListener('keydown',mark);window.addEventListener('scroll',mark,{passive:true});window.addEventListener('touchstart',mark,{passive:true});
    const done=(eventName)=>{try{sessionStorage.setItem('nudgeDone','1');}catch(e){}nudgeEl.classList.remove('show');if(eventName)track(eventName);};
    document.getElementById('nudge-dismiss').addEventListener('click',()=>done('nudge_dismissed'));
    document.getElementById('nudge-cta').addEventListener('click',()=>{done('nudge_clicked');showOverlay('client');});
    window.setTimeout(()=>{if(engaged)return;if(!overlay.hidden)return;nudgeEl.classList.add('show');track('nudge_shown');},3500);
  })();

  // Secure administration — authentication cookie is httpOnly; do not persist credentials.
  const adminApp=document.getElementById('admin-app');
  if(adminApp){
    let leadCache=[];
    const adminReq=async (url,opts={})=>{const res=await fetch(url,{credentials:'same-origin',...opts});const json=await res.json().catch(()=>({}));if(!res.ok)throw Error(json.error||'Request failed');return json;};
    const dashboard=async()=>{
      try{const res=await adminReq('/api/admin/leads');leadCache=res.leads;renderAdmin(res.leads,res.events||[],res.stepEvents||[]);}catch(e){document.getElementById('admin-message')?.append(e.message);}
    };
    function renderAdmin(leads,events,stepEvents=[]){
      const booked=leads.filter(x=>x.status==='booked').length;
      const count=(event)=>events.find(x=>x.event===event)?.total||0;
      const stepOrder=['step:intent','step:services','step:details','step:engagement','step:contact'];
      const stepLabel={'step:intent':'Intent chosen','step:services':'Services picked','step:details':'Brief given','step:engagement':'Engagement chosen','step:contact':'Contact details sent'};
      const stepMap=Object.fromEntries((stepEvents||[]).map(e=>[e.page,e.total]));
      const maxStep=Math.max(1,...stepOrder.map(k=>stepMap[k]||0));
      const dropoff=stepOrder.map(k=>`<div class="dropoff-row"><span>${stepLabel[k]}</span><div class="dropoff-bar"><i style="width:${Math.round((stepMap[k]||0)/maxStep*100)}%"></i></div><span>${stepMap[k]||0}</span></div>`).join('');
      const starts=count('funnel_start')+count('recruiter_form_open');
      const submissions=count('contact_submitted');
      const completion=starts?Math.round(submissions/starts*100)+'%':'—';
      const rows=leads.map(l=>`<tr><td><strong>${h(l.name)}</strong><small>${h(l.email)}</small><small>${h(l.phone||'')}</small></td><td>${h(l.type)}<small>${h(l.company||'')}</small></td><td>${h((l.services||[]).join(', ')||l.intent||'—')}<small>${h(l.description||'').slice(0,200)}</small></td><td>${h(new Date(l.created_at).toLocaleString())}<small>${h(l.source||'')}</small></td><td><label class="sr-only" for="status-${h(l.id)}">Pipeline status for ${h(l.name)}</label><select id="status-${h(l.id)}" data-status-id="${h(l.id)}"><option value="new" ${l.status==='new'?'selected':''}>New</option><option value="contacted" ${l.status==='contacted'?'selected':''}>Contacted</option><option value="qualified" ${l.status==='qualified'?'selected':''}>Qualified</option><option value="booked" ${l.status==='booked'?'selected':''}>Booked</option><option value="closed" ${l.status==='closed'?'selected':''}>Closed</option><option value="cancelled" ${l.status==='cancelled'?'selected':''}>Cancelled</option></select><small>${h(l.booking_start||'')}</small></td></tr>`).join('');
      adminApp.innerHTML=`<div class="admin-dashboard"><div class="admin-top"><p>Inbound inquiries · newest first</p><div class="admin-actions"><button type="button" id="export-csv">Export CSV ↓</button><button type="button" id="refresh-leads">Refresh ↻</button><button type="button" id="admin-logout">Log out</button></div></div><div class="stats-grid"><div class="stat-card"><strong>${leads.length}</strong><span>Total inquiries</span></div><div class="stat-card"><strong>${leads.filter(l=>l.type==='client').length}</strong><span>Client leads</span></div><div class="stat-card"><strong>${leads.filter(l=>l.type==='recruiter').length}</strong><span>Recruiter leads</span></div></div><div class="stats-grid"><div class="stat-card"><strong>${count('page_view')}</strong><span>Tracked page views</span></div><div class="stat-card"><strong>${starts}</strong><span>Form starts</span></div><div class="stat-card"><strong>${completion}</strong><span>Submit / start ratio</span></div></div><div class="funnel-dropoff" aria-label="Funnel step completions"><h2>Funnel drop-off (step completions)</h2>${dropoff}<p class="form-hint">Counts are aggregate and privacy-conscious; a visitor may complete steps more than once. Use alongside Submit / start ratio.</p></div><p class="form-hint">Aggregate, privacy-conscious counts; no persistent visitor tracking. This ratio is directional, not deduplicated by visitor.</p><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Contact</th><th>Audience</th><th>Need</th><th>Received</th><th>Status</th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="admin-empty">No inquiries yet.</td></tr>'}</tbody></table></div><p class="form-message" id="admin-result" role="status"></p></div>`;
      document.getElementById('export-csv').addEventListener('click',()=>{window.location.href='/api/admin/export.csv';});
      document.getElementById('refresh-leads').addEventListener('click',dashboard);
      document.getElementById('admin-logout').addEventListener('click',async()=>{await adminReq('/api/admin/logout',{method:'POST'});location.reload();});
      document.querySelectorAll('[data-status-id]').forEach(select=>select.addEventListener('change',async()=>{try{await adminReq(`/api/admin/leads/${encodeURIComponent(select.dataset.statusId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:select.value})});document.getElementById('admin-result').textContent='Status saved.';}catch(e){document.getElementById('admin-result').textContent=e.message;}}));
    }
    const form=document.getElementById('admin-login');
    form.addEventListener('submit',async e=>{e.preventDefault();const password=document.getElementById('admin-password').value;try{await adminReq('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});document.getElementById('admin-password').value='';dashboard();}catch(e){document.getElementById('admin-message').textContent=e.message;}});
    fetch('/api/admin/leads').then(async r=>{if(r.ok){let v=await r.json();renderAdmin(v.leads,v.events||[],v.stepEvents||[]);}}).catch(()=>{});
  }
})();
