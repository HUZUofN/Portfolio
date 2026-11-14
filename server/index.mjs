import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SITE=path.join(ROOT,'site');
function loadEnv(file=path.join(ROOT,'.env')) {
  if(!fs.existsSync(file)) return;
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const match=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if(match&&!Object.hasOwn(process.env,match[1])){
      let v=match[2].trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);
      process.env[match[1]]=v;
    }
  }
}
loadEnv();
const env=process.env;
const port=Number(env.PORT||3000);
const dbFile=path.resolve(ROOT,env.DB_PATH||'./data/leads.db');
fs.mkdirSync(path.dirname(dbFile),{recursive:true});
const db=new DatabaseSync(dbFile);
db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS leads (
 id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
 phone TEXT DEFAULT '',company TEXT DEFAULT '',intent TEXT DEFAULT '',services TEXT DEFAULT '[]',
 description TEXT DEFAULT '',engagement TEXT DEFAULT '',contact_consent INTEGER NOT NULL,
 whatsapp_consent INTEGER NOT NULL DEFAULT 0,source TEXT DEFAULT '',utm TEXT DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'new',event_uid TEXT DEFAULT '',booking_start TEXT DEFAULT '',
 meeting_url TEXT DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE TABLE IF NOT EXISTS analytics (date TEXT NOT NULL,event TEXT NOT NULL,page TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(date,event,page));
CREATE TABLE IF NOT EXISTS webhook_log (signature_hash TEXT PRIMARY KEY,trigger TEXT NOT NULL,received_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY,lead_id TEXT NOT NULL,channel TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,detail TEXT DEFAULT '',created_at TEXT NOT NULL);
`);
const insertLead=db.prepare(`INSERT INTO leads(id,type,name,email,phone,company,intent,services,description,engagement,contact_consent,whatsapp_consent,source,utm,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?)`);
const sessions=new Map();
const rate=new Map();
const MAX_BODY=32_000;
const allowEvents=new Set(['page_view','service_view','funnel_start','recruiter_form_open','funnel_step','question_completed','funnel_close','nudge_shown','nudge_clicked','nudge_dismissed','contact_submitted','cv_download','video_play']);
const allowServices=new Set(['lead-generation','appointment-setting','customer-support','crm-operations','technical-support','operations-support','other']);
const clean=(v,max=250)=>String(v??'').trim().slice(0,max);
const now=()=>new Date().toISOString();
const reply=(res,status,data,headers={})=>{const body=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(body);};
const fail=(res,status,message)=>reply(res,status,{error:message});
const readRaw=async req=>{
  let size=0;const parts=[];
  for await (const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw Object.assign(new Error('Payload too large'),{status:413});parts.push(chunk);}
  return Buffer.concat(parts);
};
const readJson=async req=>{const bytes=await readRaw(req);try{return JSON.parse(bytes.toString('utf8'));}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}};
const sameOrigin=req=>{const origin=req.headers.origin;if(!origin)return true;try{const url=new URL(origin);const host=req.headers.host;return url.host===host;}catch{return false;}};
function throttle(req,purpose,limit,windowMs){
  const key=purpose+':'+req.socket.remoteAddress;
  const curr=Date.now();let q=rate.get(key)||[];q=q.filter(t=>t>curr-windowMs);
  if(q.length>=limit)return false;
  q.push(curr);rate.set(key,q);if(rate.size>12000)rate.clear();return true;
}
function authCookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('admin_sid='))?.slice(10)||'';}
function isAdmin(req){const token=authCookie(req);if(!token)return false;const expiry=sessions.get(token);if(!expiry)return false;if(expiry<Date.now()){sessions.delete(token);return false;}return true;}
const cookieFor=(value,age=8*3600)=>`admin_sid=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}${env.NODE_ENV==='production'?'; Secure':''}`;
const parseLead=row=>({...row,services:JSON.parse(row.services||'[]'),utm:JSON.parse(row.utm||'{}'),contact_consent:Boolean(row.contact_consent),whatsapp_consent:Boolean(row.whatsapp_consent)});
const safeEmail=email=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)&&email.length<=254;
function bookingFor(type){const key=type==='client'?'CAL_CLIENT_URL':'CAL_RECRUITER_URL';const val=env[key]||'';try{const url=new URL(val);if(url.protocol!=='https:'||!['cal.com','www.cal.com'].includes(url.hostname))return null;return url.toString();}catch{return null;}}
const safeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function writeNotification(leadId,channel,kind,status,detail=''){
  db.prepare('INSERT INTO notifications(id,lead_id,channel,kind,status,detail,created_at) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),leadId,channel,kind,status,clean(detail,1000),now());
}
async function sendEmail({to,subject,body}){
  if(!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL)return {status:'not_configured'};
  try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[to],subject,html:`<div style="font-family:Arial,sans-serif;color:#183626;line-height:1.7;max-width:620px"><h2>${safeHtml(subject)}</h2>${body.split('\n').map(p=>`<p>${safeHtml(p)}</p>`).join('')}<hr><small>Adnan Hamza · <a href="https://www.adnanhamza.online">adnanhamza.online</a></small></div>`})});
    const json=await response.json().catch(()=>({}));return response.ok?{status:'accepted',id:String(json.id||'')}:{status:'failed',detail:'Resend HTTP '+response.status};
  }catch(e){return {status:'failed',detail:e.message};}
}
async function emailOwner(lead){
  if(!env.CONTACT_EMAIL)return;
  const result=await sendEmail({to:env.CONTACT_EMAIL,subject:`New ${lead.type} inquiry from ${lead.name}`,body:`A new inquiry was saved.\nName: ${lead.name}\nEmail: ${lead.email}\nCompany: ${lead.company}\nPhone: ${lead.phone}\nServices: ${lead.services.join(', ')}\nRequest: ${lead.description}\nSource: ${lead.source}\nOpen the admin dashboard to review and manage this lead.`});
  writeNotification(lead.id,'email','owner_new_lead',result.status,result.detail||result.id||'');
}
async function sendWhatsApp(lead,dateTime){
  if(!lead.whatsapp_consent||!lead.phone)return {status:'not_consented'};
  if(!env.WHATSAPP_TOKEN||!env.WHATSAPP_PHONE_NUMBER_ID||!env.WHATSAPP_TEMPLATE_NAME)return {status:'not_configured'};
  const to=lead.phone.replace(/\D/g,'');
  // The approved template MUST have exactly 2 ordered body variables: contact name, meeting date/time.
  const body={messaging_product:'whatsapp',to,type:'template',template:{name:env.WHATSAPP_TEMPLATE_NAME,language:{code:env.WHATSAPP_TEMPLATE_LANG||'en_US'},components:[{type:'body',parameters:[{type:'text',text:lead.name},{type:'text',text:dateTime}]}]}};
  try{const resp=await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID)}/messages`,{method:'POST',headers:{Authorization:`Bearer ${env.WHATSAPP_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const json=await resp.json().catch(()=>({}));return resp.ok?{status:'accepted',detail:json.messages?.[0]?.id||'accepted'}:{status:'failed',detail:'WhatsApp HTTP '+resp.status};}
  catch(e){return {status:'failed',detail:e.message};}
}
function csvCell(v){let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function serveStatic(req,res,pathname){
  let decoded;try{decoded=decodeURIComponent(pathname);}catch{return fail(res,400,'Bad path');}
  if(decoded.includes('\0')||decoded.includes('\\'))return fail(res,400,'Bad path');
  let resolved=path.resolve(SITE,'.'+decoded);
  if(resolved!==SITE&&!resolved.startsWith(SITE+path.sep))return fail(res,403,'Forbidden');
  try{if(fs.statSync(resolved).isDirectory())resolved=path.join(resolved,'index.html');}catch{}
  if(!fs.existsSync(resolved)||!fs.statSync(resolved).isFile())return fail(res,404,'Page not found');
  const ext=path.extname(resolved).toLowerCase();
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8','.xml':'application/xml','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.mp4':'video/mp4','.webp':'image/webp','.png':'image/png'};
  const stat=fs.statSync(resolved);const headers={'Content-Type':types[ext]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':ext==='.html'?'public,max-age=300':(ext==='.pdf'?'public,max-age=3600':'public,max-age=1800'),'X-Content-Type-Options':'nosniff'};
  res.writeHead(200,headers);if(req.method==='HEAD')return res.end();fs.createReadStream(resolved).pipe(res);
}
async function handler(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; media-src 'self' https:; frame-src https://cal.com https://www.cal.com;");
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);const pathname=url.pathname;
  try{
    if(pathname==='/api/health'&&req.method==='GET')return reply(res,200,{ok:true,service:'adnan-funnel'});
    if(pathname==='/api/config'&&req.method==='GET')return reply(res,200,{clientBookingEnabled:!!bookingFor('client'),recruiterBookingEnabled:!!bookingFor('recruiter'),introVideoUrl:env.INTRO_VIDEO_URL?.startsWith('/assets/')?env.INTRO_VIDEO_URL:''});
    if(pathname.startsWith('/api/')&&req.method!=='GET'&&!pathname.startsWith('/api/webhooks/')&&!sameOrigin(req))return fail(res,403,'Cross-origin submission denied');
    if(pathname==='/api/leads'&&req.method==='POST'){
      if(!throttle(req,'leads',7,15*60*1000))return fail(res,429,'Too many inquiries. Please try again later.');
      const body=await readJson(req);if(body.website)return reply(res,200,{id:crypto.randomUUID(),bookingUrl:null}); // Honeypot: don't record bots.
      const type=body.type==='recruiter'?'recruiter':body.type==='client'?'client':null;
      const name=clean(body.name,120),email=clean(body.email,254).toLowerCase();
      if(!type||name.length<2||!safeEmail(email)||body.contactConsent!==true)return fail(res,400,'Name, valid email and consent are required.');
      const phone=clean(body.phone,25);if(phone&&!/^\+?[0-9\s().-]{7,25}$/.test(phone))return fail(res,400,'Invalid phone number');
      const company=clean(body.company,120),description=clean(body.description,2000);
      if(type==='recruiter'&&(!company||description.length<8))return fail(res,400,'Recruiter requests need a company and role details.');
      let services=Array.isArray(body.services)?body.services.filter(x=>allowServices.has(x)).slice(0,7):[];
      const intent=clean(body.intent,70),engagement=clean(body.engagement,70),source=clean(body.source,200);
      const utm=Object.fromEntries(Object.entries(typeof body.utm==='object'&&body.utm&&!Array.isArray(body.utm)?body.utm:{}).filter(([k])=>['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].includes(k)).map(([k,v])=>[k,clean(v,120)]));
      const id=crypto.randomUUID(),timestamp=now();const wConsent=body.whatsappConsent===true?1:0;
      insertLead.run(id,type,name,email,phone,company,intent,JSON.stringify(services),description,engagement,1,wConsent,source,JSON.stringify(utm),'new',timestamp,timestamp);
      const lead={id,type,name,email,phone,company,intent,services,description,engagement,source};
      // Independent notification; provider acceptance is recorded, never described as delivered.
      void emailOwner(lead).catch(e=>console.error('Email notification failed:',e.message));
      return reply(res,201,{id,recorded:true,bookingUrl:bookingFor(type)});
    }
    if(pathname==='/api/events'&&req.method==='POST'){
      if(!throttle(req,'events',90,60*60*1000))return reply(res,202,{ok:true});
      const body=await readJson(req);const event=clean(body.event,60);if(!allowEvents.has(event))return fail(res,400,'Unknown event');
      const page=clean(body.detail?.page||'/',130).replace(/[?#].*$/,'');
      db.prepare('INSERT INTO analytics(date,event,page,count) VALUES(?,?,?,1) ON CONFLICT(date,event,page) DO UPDATE SET count=count+1').run(now().slice(0,10),event,page);
      return reply(res,202,{ok:true});
    }
    if(pathname==='/api/admin/login'&&req.method==='POST'){
      if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<12)return fail(res,503,'Set ADMIN_PASSWORD (12+ characters) in your server environment first.');
      if(!throttle(req,'login',8,15*60*1000))return fail(res,429,'Too many sign-in attempts.');
      const body=await readJson(req);const a=Buffer.from(String(body.password||'')),b=Buffer.from(env.ADMIN_PASSWORD);
      if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return fail(res,401,'Invalid credentials');
      const token=crypto.randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600*1000);return reply(res,200,{ok:true},{'Set-Cookie':cookieFor(token)});
    }
    if(pathname==='/api/admin/logout'&&req.method==='POST'){sessions.delete(authCookie(req));return reply(res,200,{ok:true},{'Set-Cookie':cookieFor('',0)});}
    if(pathname.startsWith('/api/admin/')){
      if(!isAdmin(req))return fail(res,401,'Not authenticated');
      if(pathname==='/api/admin/leads'&&req.method==='GET'){
        const leads=db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 1000').all().map(parseLead);
        const events=db.prepare('SELECT event, SUM(count) AS total FROM analytics GROUP BY event').all();
        const stepEvents=db.prepare("SELECT page, SUM(count) AS total FROM analytics WHERE event='question_completed' GROUP BY page").all();
        return reply(res,200,{leads,events,stepEvents});
      }
      if(pathname==='/api/admin/export.csv'&&req.method==='GET'){
        const cols=['id','type','name','email','phone','company','intent','services','description','engagement','contact_consent','whatsapp_consent','source','utm','status','event_uid','booking_start','created_at'];
        const rows=db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 10000').all();
        const csv=[cols.map(csvCell).join(','),...rows.map(r=>cols.map(k=>csvCell(r[k])).join(','))].join('\r\n');
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="adnan-leads.csv"','Cache-Control':'no-store'});res.end('\ufeff'+csv);return;
      }
      const match=pathname.match(/^\/api\/admin\/leads\/([0-9a-f-]{36})$/);
      if(match&&req.method==='PATCH'){
        const body=await readJson(req);if(!['new','contacted','qualified','booked','closed','cancelled'].includes(body.status))return fail(res,400,'Invalid status');
        const info=db.prepare('UPDATE leads SET status=?, updated_at=? WHERE id=?').run(body.status,now(),match[1]);
        return info.changes?reply(res,200,{ok:true}):fail(res,404,'Lead not found');
      }
    }
    if(pathname==='/api/webhooks/cal'&&req.method==='POST'){
      if(!env.CAL_WEBHOOK_SECRET)return fail(res,503,'Cal webhook not configured');
      const raw=await readRaw(req);const signature=String(req.headers['x-cal-signature-256']||'').replace(/^sha256=/,'');
      const expected=crypto.createHmac('sha256',env.CAL_WEBHOOK_SECRET).update(raw).digest('hex');
      const supplied=Buffer.from(signature,'hex'),expectedBuffer=Buffer.from(expected,'hex');
      if(supplied.length!==expectedBuffer.length||!crypto.timingSafeEqual(supplied,expectedBuffer))return fail(res,401,'Webhook signature invalid');
      let event;try{event=JSON.parse(raw.toString('utf8'));}catch{return fail(res,400,'Invalid JSON');}
      const trigger=clean(event.triggerEvent,50);if(!['BOOKING_CREATED','BOOKING_RESCHEDULED','BOOKING_CANCELLED','BOOKING_CONFIRMED'].includes(trigger))return reply(res,200,{ignored:true});
      const sigHash=crypto.createHash('sha256').update(raw).digest('hex');
      const first=db.prepare('INSERT OR IGNORE INTO webhook_log(signature_hash,trigger,received_at) VALUES(?,?,?)').run(sigHash,trigger,now());
      if(!first.changes)return reply(res,200,{ok:true,duplicate:true});
      const payload=event.payload||{};const attendee=Array.isArray(payload.attendees)?payload.attendees[0]:null;
      const uid=clean(payload.uid,120),email=clean(attendee?.email,254).toLowerCase(),id=clean(payload.metadata?.leadId||payload.responses?.metadata?.leadId,60);
      // Prefer Cal metadata if present; fall back to most recent matching email.
      const lead=(id&&db.prepare('SELECT * FROM leads WHERE id=?').get(id))||(email&&db.prepare('SELECT * FROM leads WHERE email=? ORDER BY created_at DESC LIMIT 1').get(email));
      if(!lead)return reply(res,200,{ok:true,matched:false});
      const status=trigger==='BOOKING_CANCELLED'?'cancelled':trigger==='BOOKING_CONFIRMED'||trigger==='BOOKING_CREATED'?'booked':'booked';
      const start=clean(payload.startTime,80);
      const meetingUrl=clean(typeof payload.meetingUrl==='string'?payload.meetingUrl:(payload.metadata?.videoCallUrl||''),500);
      db.prepare('UPDATE leads SET status=?,event_uid=?,booking_start=?,meeting_url=?,updated_at=? WHERE id=?').run(status,uid,start,meetingUrl,now(),lead.id);
      if(trigger==='BOOKING_CREATED'||trigger==='BOOKING_CONFIRMED'){
        const parsed=parseLead(lead);
        if(!lead.event_uid || lead.event_uid!==uid){
          const label=start?new Date(start).toUTCString():'the scheduled time';
          // Provider acceptance is distinguished from actual message delivery.
          if(env.RESEND_API_KEY&&env.RESEND_FROM_EMAIL){
            const tasks=[{to:parsed.email,kind:'visitor_booking',subject:'Your call with Adnan Hamza is scheduled',body:`Hi ${parsed.name},\nCal.com confirmed your appointment for ${label} (UTC).\nCheck your Cal.com confirmation message for the exact local time, joining details and rescheduling instructions.`}];
            if(env.CONTACT_EMAIL)tasks.push({to:env.CONTACT_EMAIL,kind:'owner_booking',subject:`New confirmed booking: ${parsed.name}`,body:`${parsed.name} (${parsed.email}) booked a meeting for ${label} UTC.\nServices: ${parsed.services.join(', ')}\nRequest: ${parsed.description}`});
            for(const task of tasks){const out=await sendEmail(task);writeNotification(parsed.id,'email',task.kind,out.status,out.detail||out.id||'');}
          }
          const out=await sendWhatsApp(parsed,label);writeNotification(parsed.id,'whatsapp','visitor_booking',out.status,out.detail||'');
        }
      }
      return reply(res,200,{ok:true,matched:true});
    }
    if(!['GET','HEAD'].includes(req.method))return fail(res,405,'Method not allowed');
    return serveStatic(req,res,pathname);
  }catch(e){if((e.status||500)>=500)console.error('Server error:',e);return fail(res,e.status||500,e.status?e.message:'Unexpected server error');}
}
const server=http.createServer(handler);
server.listen(port,()=>{console.log(`Adnan funnel listening on http://localhost:${port}`);console.log('Admin access:',env.ADMIN_PASSWORD&&env.ADMIN_PASSWORD.length>=12?'configured':'disabled until ADMIN_PASSWORD is set');console.log('Cal.com client booking:',bookingFor('client')?'configured':'not configured');});
export {handler,db,server};
