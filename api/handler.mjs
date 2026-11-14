// Vercel serverless API: independent of the local SQLite server.
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const env = process.env;
const connection = env.DATABASE_URL || env.STORAGE_URL || env.POSTGRES_URL;
const sql = connection ? neon(connection) : null;
const clean = (value, max=250) => String(value ?? '').trim().slice(0,max);
const safeEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
const now = () => new Date().toISOString();
const allowedServices = new Set(['lead-generation','appointment-setting','customer-support','crm-operations','technical-support','operations-support','other']);
const allowedEvents = new Set(['page_view','service_view','funnel_start','recruiter_form_open','funnel_step','question_completed','funnel_close','nudge_shown','nudge_clicked','nudge_dismissed','contact_submitted','cv_download','video_play']);
const cookie = (token, age=28800) => `admin_sid=${token}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
const respond = (res, code, data) => {res.setHeader('Content-Type','application/json; charset=utf-8');res.status(code).json(data);};
const error = (res, code, message) => respond(res,code,{error:message});
const csv = value => {const str=String(value ?? '');return '"'+(/^[=+@\-\t\r]/.test(str)?"'"+str:str).replace(/"/g,'""')+'"';};
const booking = type => {try{const u=new URL(type==='client'?env.CAL_CLIENT_URL:env.CAL_RECRUITER_URL);return u.protocol==='https:'&&['cal.com','www.cal.com'].includes(u.hostname)?u.toString():null;}catch{return null;}};
const escapeHtml = val => String(val??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let schemaPromise;
async function ensureSchema(){
  if(!sql)throw Object.assign(new Error('Neon database is not connected'),{status:503});
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await sql`CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,type TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,
        phone TEXT DEFAULT '',company TEXT DEFAULT '',intent TEXT DEFAULT '',services JSONB NOT NULL DEFAULT '[]'::jsonb,
        description TEXT DEFAULT '',engagement TEXT DEFAULT '',contact_consent BOOLEAN NOT NULL,
        whatsapp_consent BOOLEAN NOT NULL DEFAULT FALSE,source TEXT DEFAULT '',utm JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'new',event_uid TEXT DEFAULT '',booking_start TEXT DEFAULT '',
        meeting_url TEXT DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
      await sql`CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC)`;
      await sql`CREATE TABLE IF NOT EXISTS analytics (date DATE NOT NULL,event TEXT NOT NULL,page TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(date,event,page))`;
      await sql`CREATE TABLE IF NOT EXISTS webhook_log(signature_hash TEXT PRIMARY KEY,trigger TEXT NOT NULL,received_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
      await sql`CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,lead_id TEXT NOT NULL,channel TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,detail TEXT DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
      await sql`CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL DEFAULT 1,expires_at TIMESTAMPTZ NOT NULL)`;
    })().catch(e=>{schemaPromise=null;throw e;});
  }
  return schemaPromise;
}
function signSession(){
  const exp=Date.now()+8*60*60*1000;
  const payload=Buffer.from(JSON.stringify({exp,nonce:crypto.randomBytes(12).toString('hex')})).toString('base64url');
  const mac=crypto.createHmac('sha256',env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}
function authenticated(req){
  if(!env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET.length<32)return false;
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('admin_sid='))?.slice(10);
  if(!token || token.length>700)return false;
  const [payload,mac,...extra]=token.split('.');if(extra.length || !payload || !mac)return false;
  const expected=crypto.createHmac('sha256',env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
  const lhs=Buffer.from(mac),rhs=Buffer.from(expected);
  if(lhs.length!==rhs.length || !crypto.timingSafeEqual(lhs,rhs))return false;
  try{return Number(JSON.parse(Buffer.from(payload,'base64url').toString()).exp)>Date.now();}catch{return false;}
}
function sameOrigin(req){
  const origin=req.headers.origin;
  if(!origin)return true;
  try{return new URL(origin).host === (req.headers['x-forwarded-host'] || req.headers.host);}catch{return false;}
}
function parseBody(req){
  const body=req.body;
  if(Buffer.isBuffer(body))return JSON.parse(body.toString());
  if(typeof body==='string')return JSON.parse(body);
  if(body && typeof body==='object')return body;
  return {};
}
async function readRaw(req){
  if(Buffer.isBuffer(req.body))return req.body;
  if(typeof req.body==='string')return Buffer.from(req.body);
  const parts=[];for await(const part of req)parts.push(part);
  return Buffer.concat(parts);
}
async function logNotification(leadId,kind,result){
  await sql`INSERT INTO notifications(id,lead_id,channel,kind,status,detail) VALUES (${crypto.randomUUID()},${leadId},'email',${kind},${result.status},${result.detail||''})`;
}
async function sendEmail({to,subject,body}){
  if(!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL)return {status:'not_configured'};
  try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[to],subject,html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><h2>${escapeHtml(subject)}</h2>${body.split('\n').map(x=>`<p>${escapeHtml(x)}</p>`).join('')}</div>`})});
    const result=await response.json().catch(()=>({}));return {status:response.ok?'accepted':'failed',detail:response.ok?String(result.id||''):`Resend HTTP ${response.status}`};
  }catch(e){return {status:'failed',detail:clean(e.message,200)};}
}
function getRoute(req){
  const route=req.query?.route;
  if(typeof route==='string')return '/api/'+route.replace(/^\/+/, '');
  const pathname=new URL(req.url,'https://placeholder.invalid').pathname;
  return pathname.startsWith('/api/')?pathname:'/api';
}
async function throttle(req,purpose,limit,seconds){
  const ip=clean(req.headers['x-forwarded-for']?.split(',')[0]||'unknown',100);
  const key=crypto.createHash('sha256').update(purpose+':'+ip).digest('hex');
  const rows=await sql`INSERT INTO rate_limits(key,count,expires_at) VALUES (${key},1,now()+(${seconds} * interval '1 second')) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+(${seconds} * interval '1 second') ELSE rate_limits.expires_at END RETURNING count`;
  return rows[0].count<=limit;
}
const parseLead = row => ({...row,contact_consent:!!row.contact_consent,whatsapp_consent:!!row.whatsapp_consent,created_at:new Date(row.created_at).toISOString(),updated_at:new Date(row.updated_at).toISOString()});
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  const path=getRoute(req);
  try{
    if(path==='/api/health' && req.method==='GET')return respond(res,200,{ok:true,service:'adnan-funnel-vercel',databaseConfigured:!!sql});
    if(path==='/api/config' && req.method==='GET')return respond(res,200,{clientBookingEnabled:!!booking('client'),recruiterBookingEnabled:!!booking('recruiter'),introVideoUrl:env.INTRO_VIDEO_URL?.startsWith('/assets/')?env.INTRO_VIDEO_URL:''});
    if(!sameOrigin(req) && !path.startsWith('/api/webhooks/'))return error(res,403,'Cross-origin request denied');
    if(req.method==='POST' && Number(req.headers['content-length']||0)>32000)return error(res,413,'Payload too large');
    await ensureSchema();
    if(path==='/api/leads' && req.method==='POST'){
      if(!await throttle(req,'leads',7,900))return error(res,429,'Too many inquiries. Try again later.');
      const data=parseBody(req);if(data.website)return respond(res,200,{id:crypto.randomUUID(),bookingUrl:null});
      const type=['client','recruiter'].includes(data.type)?data.type:null;
      const name=clean(data.name,120),email=clean(data.email,254).toLowerCase(),company=clean(data.company,120),description=clean(data.description,2000),phone=clean(data.phone,25);
      if(!type || name.length<2 || !safeEmail(email) || data.contactConsent!==true)return error(res,400,'Name, valid email and consent are required.');
      if(phone && !/^\+?[0-9\s().-]{7,25}$/.test(phone))return error(res,400,'Invalid phone number');
      if(type==='recruiter' && (!company || description.length<8))return error(res,400,'Recruiter requests need a company and role details.');
      const services=Array.isArray(data.services)?data.services.filter(x=>allowedServices.has(x)).slice(0,7):[];
      const utm=Object.fromEntries(Object.entries(data.utm && typeof data.utm==='object' && !Array.isArray(data.utm)?data.utm:{}).filter(([key])=>['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].includes(key)).map(([key,val])=>[key,clean(val,120)]));
      const id=crypto.randomUUID(),intent=clean(data.intent,70),engagement=clean(data.engagement,70),source=clean(data.source,200);
      await sql`INSERT INTO leads(id,type,name,email,phone,company,intent,services,description,engagement,contact_consent,whatsapp_consent,source,utm,status) VALUES (${id},${type},${name},${email},${phone},${company},${intent},${JSON.stringify(services)}::jsonb,${description},${engagement},TRUE,FALSE,${source},${JSON.stringify(utm)}::jsonb,'new')`;
      if(env.CONTACT_EMAIL){
        const result=await sendEmail({to:env.CONTACT_EMAIL,subject:`New ${type} inquiry from ${name}`,body:`Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nCompany: ${company}\nServices: ${services.join(', ')}\nDetails: ${description}\nLog in to your admin dashboard to review.`});
        await logNotification(id,'owner_new_lead',result);
      }
      return respond(res,201,{id,recorded:true,bookingUrl:booking(type)});
    }
    if(path==='/api/events' && req.method==='POST'){
      if(!await throttle(req,'events',90,3600))return respond(res,202,{ok:true});
      const data=parseBody(req),event=clean(data.event,60);
      if(!allowedEvents.has(event))return error(res,400,'Unknown event');
      const page=clean(data.detail?.page||'/',130).replace(/[?#].*$/,'');
      await sql`INSERT INTO analytics(date,event,page,count) VALUES (CURRENT_DATE,${event},${page},1) ON CONFLICT(date,event,page) DO UPDATE SET count=analytics.count+1`;
      return respond(res,202,{ok:true});
    }
    if(path==='/api/admin/login' && req.method==='POST'){
      if(!await throttle(req,'admin_login',8,900))return error(res,429,'Too many sign-in attempts.');
      if(!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length<12 || !env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET.length<32)return error(res,503,'Admin access not configured');
      const supplied=Buffer.from(String(parseBody(req).password||'')),expected=Buffer.from(env.ADMIN_PASSWORD);
      if(supplied.length!==expected.length || !crypto.timingSafeEqual(supplied,expected))return error(res,401,'Invalid credentials');
      res.setHeader('Set-Cookie',cookie(signSession()));return respond(res,200,{ok:true});
    }
    if(path==='/api/admin/logout' && req.method==='POST'){
      res.setHeader('Set-Cookie',cookie('',0));return respond(res,200,{ok:true});
    }
    if(path.startsWith('/api/admin/')){
      if(!authenticated(req))return error(res,401,'Not authenticated');
      if(path==='/api/admin/leads' && req.method==='GET'){
        const leads=(await sql`SELECT * FROM leads ORDER BY created_at DESC LIMIT 1000`).map(parseLead);
        const events=await sql`SELECT event,SUM(count)::integer AS total FROM analytics GROUP BY event`;
        const stepEvents=await sql`SELECT page,SUM(count)::integer AS total FROM analytics WHERE event='question_completed' GROUP BY page`;
        return respond(res,200,{leads,events,stepEvents});
      }
      if(path==='/api/admin/export.csv' && req.method==='GET'){
        const cols=['id','type','name','email','phone','company','intent','services','description','engagement','contact_consent','whatsapp_consent','source','utm','status','event_uid','booking_start','created_at'];
        const rows=await sql`SELECT * FROM leads ORDER BY created_at DESC LIMIT 10000`;
        const output=[cols.map(csv).join(','),...rows.map(row=>cols.map(col=>csv(typeof row[col]==='object'?JSON.stringify(row[col]):row[col])).join(','))].join('\r\n');
        res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="adnan-leads.csv"');return res.status(200).send('\ufeff'+output);
      }
      const match=path.match(/^\/api\/admin\/leads\/([0-9a-f-]{36})$/);
      if(match && req.method==='PATCH'){
        const status=parseBody(req).status;
        if(!['new','contacted','qualified','booked','closed','cancelled'].includes(status))return error(res,400,'Invalid status');
        const result=await sql`UPDATE leads SET status=${status},updated_at=now() WHERE id=${match[1]} RETURNING id`;
        return result.length?respond(res,200,{ok:true}):error(res,404,'Lead not found');
      }
    }
    if(path==='/api/webhooks/cal' && req.method==='POST'){
      if(!env.CAL_WEBHOOK_SECRET)return error(res,503,'Cal webhook not configured');
      const raw=await readRaw(req);if(raw.length>32000)return error(res,413,'Payload too large');
      const sent=clean(req.headers['x-cal-signature-256'],200).replace(/^sha256=/,'');
      const expected=crypto.createHmac('sha256',env.CAL_WEBHOOK_SECRET).update(raw).digest('hex');
      const a=Buffer.from(sent,'hex'),b=Buffer.from(expected,'hex');
      if(a.length!==b.length || !crypto.timingSafeEqual(a,b))return error(res,401,'Webhook signature invalid');
      const event=JSON.parse(raw.toString('utf8'));const trigger=clean(event.triggerEvent,60);
      if(!['BOOKING_CREATED','BOOKING_CONFIRMED','BOOKING_RESCHEDULED','BOOKING_CANCELLED'].includes(trigger))return respond(res,200,{ignored:true});
      const hash=crypto.createHash('sha256').update(raw).digest('hex');
      const inserted=await sql`INSERT INTO webhook_log(signature_hash,trigger) VALUES (${hash},${trigger}) ON CONFLICT DO NOTHING RETURNING signature_hash`;
      if(!inserted.length)return respond(res,200,{ok:true,duplicate:true});
      const payload=event.payload||{};
      const email=clean(payload.attendees?.[0]?.email,254).toLowerCase();
      const leadId=clean(payload.metadata?.leadId||payload.responses?.metadata?.leadId,60);
      let matched=leadId?(await sql`SELECT * FROM leads WHERE id=${leadId} LIMIT 1`)[0]:undefined;
      if(!matched && email)matched=(await sql`SELECT * FROM leads WHERE email=${email} ORDER BY created_at DESC LIMIT 1`)[0];
      if(!matched)return respond(res,200,{ok:true,matched:false});
      const uid=clean(payload.uid,120),start=clean(payload.startTime,80),meetingUrl=clean(typeof payload.meetingUrl==='string'?payload.meetingUrl:(payload.metadata?.videoCallUrl||''),500);
      await sql`UPDATE leads SET status=${trigger==='BOOKING_CANCELLED'?'cancelled':'booked'},event_uid=${uid},booking_start=${start},meeting_url=${meetingUrl},updated_at=now() WHERE id=${matched.id}`;
      if(['BOOKING_CREATED','BOOKING_CONFIRMED'].includes(trigger) && matched.event_uid!==uid && env.RESEND_API_KEY && env.RESEND_FROM_EMAIL){
        const when=start?new Date(start).toUTCString():'scheduled time';
        if(env.CONTACT_EMAIL){const out=await sendEmail({to:env.CONTACT_EMAIL,subject:`New booking: ${matched.name}`,body:`${matched.name} (${matched.email}) booked a meeting for ${when}.`});await logNotification(matched.id,'owner_booking',out);}
        const out=await sendEmail({to:matched.email,subject:'Your call with Adnan Hamza is scheduled',body:`Hi ${matched.name},\nYour meeting is confirmed for ${when}. Check your Cal.com confirmation for joining and rescheduling details.`});await logNotification(matched.id,'visitor_booking',out);
      }
      return respond(res,200,{ok:true,matched:true});
    }
    return error(res,404,'Endpoint not found');
  }catch(e){console.error('Vercel API error:',e);return error(res,e.status||500,e.status?e.message:'Unexpected server error');}
}
