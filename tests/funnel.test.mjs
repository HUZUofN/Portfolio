import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';

async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});s.on('error',reject);});}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'adnan-funnel-test-'));
const port=await freePort();
const env={...process.env,PORT:String(port),NODE_ENV:'development',DB_PATH:path.join(dir,'test.db'),ADMIN_PASSWORD:'long-admin-test-password',CAL_WEBHOOK_SECRET:'unit-test-cal-secret',CAL_CLIENT_URL:'',CAL_RECRUITER_URL:'',RESEND_API_KEY:'',WHATSAPP_TOKEN:'',CONTACT_EMAIL:''};
const server=spawn(process.execPath,['server/index.mjs'],{cwd:path.resolve('.'),env,stdio:['ignore','pipe','pipe']});
let stdlog='';server.stdout.on('data',x=>stdlog+=x);server.stderr.on('data',x=>stdlog+=x);
const root=`http://127.0.0.1:${port}`;
for(let i=0;i<70;i++){try{const r=await fetch(root+'/api/health');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const call=(url,opts={})=>fetch(root+url,opts);
const post=(url,body,opts={})=>call(url,{method:'POST',headers:{'Content-Type':'application/json',...(opts.headers||{})},body:JSON.stringify(body)});
const recruit={type:'recruiter',name:'Taylor Example',email:'taylor@example.org',company:'Recruiting Example',description:'Operations Coordinator role, 20 hours per week, interview next week.',contactConsent:true,source:'/recruiters/'};
const client={type:'client',name:'Jordan Example',email:'jordan@example.org',phone:'+1 404 555 0130',company:'Example Studio',intent:'specific-service',services:['appointment-setting','lead-generation'],description:'Need an appointment setter.',engagement:'ongoing',contactConsent:true,whatsappConsent:false,source:'/services/appointment-setting/',utm:{utm_source:'google'}};
let leadId='',cookie='';
try{
 await test('Serves public pages, static resume and SEO routes',async()=>{
  for(const url of ['/','/recruiters/','/services/appointment-setting/','/sitemap.xml','/robots.txt','/llms.txt','/assets/Adnan-Hamza-CV.pdf']){
   const r=await call(url);assert.equal(r.status,200,url);assert.ok((await r.arrayBuffer()).byteLength>10,url);
  }
  const page=await (await call('/')).text();assert.match(page,/Book a free discovery call/);assert.match(page,/For recruiters/);
 });
 await test('Rejects invalid lead contact details and missing consent',async()=>{
  const r=await post('/api/leads',{...client,email:'not an email'});assert.equal(r.status,400);
  const noConsent=await post('/api/leads',{...client,contactConsent:false});assert.equal(noConsent.status,400);
 });
 await test('Client submission persists lead but does not invent a booking',async()=>{
  const r=await post('/api/leads',client);assert.equal(r.status,201);const j=await r.json();assert.equal(j.recorded,true);assert.equal(j.bookingUrl,null);assert.ok(j.id);leadId=j.id;
 });
 await test('Recruiter submission is accepted separately',async()=>{
  const r=await post('/api/leads',recruit);assert.equal(r.status,201);const j=await r.json();assert.ok(j.id!==leadId);
 });
 await test('Analytics endpoint accepts privacy-conscious funnel events',async()=>{
  const r=await post('/api/events',{event:'funnel_step',detail:{page:'/services/appointment-setting/'}});assert.equal(r.status,202);
  assert.equal((await post('/api/events',{event:'invalid'})).status,400);
 });
 await test('Dashboard API denies anonymous access',async()=>{assert.equal((await call('/api/admin/leads')).status,401);});
 await test('Admin authenticates with httpOnly cookie and receives saved records',async()=>{
  const bad=await post('/api/admin/login',{password:'bad'});assert.equal(bad.status,401);
  const r=await post('/api/admin/login',{password:'long-admin-test-password'});assert.equal(r.status,200);
  cookie=r.headers.get('set-cookie').split(';')[0];assert.ok(cookie.startsWith('admin_sid='));assert.match(r.headers.get('set-cookie'),/HttpOnly/);
  const data=await (await call('/api/admin/leads',{headers:{Cookie:cookie}})).json();assert.ok(data.leads.some(x=>x.id===leadId));assert.equal(data.leads.length,2);
 });
 await test('Invalid Cal.com webhook signature is rejected',async()=>{
  const r=await post('/api/webhooks/cal',{triggerEvent:'BOOKING_CREATED',payload:{attendees:[{email:client.email}]}});assert.equal(r.status,401);
 });
 await test('Signed Cal.com event confirms existing appointment (not before)',async()=>{
  const event={triggerEvent:'BOOKING_CREATED',payload:{uid:'cal-test-booking-456',startTime:'2026-12-10T12:00:00Z',attendees:[{email:client.email}],metadata:{leadId}}};
  const raw=JSON.stringify(event);const signature=crypto.createHmac('sha256','unit-test-cal-secret').update(raw).digest('hex');
  const res=await call('/api/webhooks/cal',{method:'POST',headers:{'Content-Type':'application/json','x-cal-signature-256':signature},body:raw});assert.equal(res.status,200);assert.equal((await res.json()).matched,true);
  const all=await (await call('/api/admin/leads',{headers:{Cookie:cookie}})).json();
  const row=all.leads.find(x=>x.id===leadId);assert.equal(row.status,'booked');assert.equal(row.event_uid,'cal-test-booking-456');
  const again=await call('/api/webhooks/cal',{method:'POST',headers:{'Content-Type':'application/json','x-cal-signature-256':signature},body:raw});assert.equal((await again.json()).duplicate,true);
 });
 await test('Admin may update pipeline statuses and export data',async()=>{
  const r=await call(`/api/admin/leads/${leadId}`,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({status:'contacted'})});assert.equal(r.status,200);
  const csv=await call('/api/admin/export.csv',{headers:{Cookie:cookie}});assert.equal(csv.status,200);assert.match(await csv.text(),/Jordan Example/);
 });
 await test('Traversal and unknown paths do not expose server data',async()=>{
  assert.equal((await call('/.env.example')).status,404);
  assert.equal((await call('/missing-page')).status,404);
 });
}finally{
  server.kill('SIGTERM');
  // Wait for the child to exit before removing the temp dir (Windows holds file locks).
  await new Promise(r=>{ if(server.exitCode!==null) return r(); server.once('exit',r); setTimeout(r,4000); });
  for(let attempt=0; attempt<5; attempt++){
    try{ fs.rmSync(dir,{recursive:true,force:true}); break; }catch(e){ if(attempt===4){ console.warn('Could not remove test dir:',dir); break; } await new Promise(r=>setTimeout(r,250)); }
  }
}
