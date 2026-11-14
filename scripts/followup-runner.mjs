#!/usr/bin/env node
/**
 * Follow-up automation runner — designed for cron / Task Scheduler.
 *
 *   node scripts/followup-runner.mjs          # dry-run: prints + logs 'dry_run' rows, sends NOTHING
 *   node scripts/followup-runner.mjs --send   # actually delivers via Resend / WhatsApp Cloud API
 *
 * Safety properties:
 *  - Only leads with status='booked' and a known booking_start are considered.
 *  - Email requires contact_consent=1; WhatsApp additionally requires whatsapp_consent=1.
 *  - A notification is logged to the `notifications` table for every attempt and outcome.
 *  - De-duplication: a workflow will not run twice for the same lead when an 'accepted'
 *    notification for the same lead_id + kind already exists.
 *  - Without provider credentials the runner logs 'not_configured' and exits 0 — it never
 *    pretends a message was delivered.
 *  - Dry-run is the default so previewing never spams a real person.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = !process.argv.includes('--send');

function loadEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !Object.hasOwn(process.env, match[1])) {
      let v = match[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[match[1]] = v;
    }
  }
}
loadEnv();
const env = process.env;
const dbFile = path.resolve(ROOT, env.DB_PATH || './data/leads.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new DatabaseSync(dbFile);
db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
  phone TEXT DEFAULT '',company TEXT DEFAULT '',intent TEXT DEFAULT '',services TEXT DEFAULT '[]',
  description TEXT DEFAULT '',engagement TEXT DEFAULT '',contact_consent INTEGER NOT NULL,
  whatsapp_consent INTEGER NOT NULL DEFAULT 0,source TEXT DEFAULT '',utm TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new',event_uid TEXT DEFAULT '',booking_start TEXT DEFAULT '',
  meeting_url TEXT DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY,lead_id TEXT NOT NULL,channel TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,detail TEXT DEFAULT '',created_at TEXT NOT NULL);`);
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'followups.json'), 'utf8'));

const now = () => new Date();
const iso = d => d.toISOString();
const safeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const render = (tpl, lead) => tpl
  .replaceAll('{{name}}', lead.name.split(' ')[0] || lead.name)
  .replaceAll('{{datetime}}', lead.booking_start ? new Date(lead.booking_start).toUTCString() : 'the scheduled time')
  .replaceAll('{{meeting_url}}', lead.meeting_url || '');
const hasAccepted = (leadId, kind) => db.prepare("SELECT 1 FROM notifications WHERE lead_id=? AND kind=? AND status='accepted' LIMIT 1").get(leadId, kind) !== undefined;
const logNotification = (leadId, channel, kind, status, detail = '') => db.prepare('INSERT INTO notifications(id,lead_id,channel,kind,status,detail,created_at) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(), leadId, channel, kind, status, clean(detail, 1000), iso(now()));

async function sendEmail({ to, subject, body }) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) return { status: 'not_configured' };
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [to], subject, html: `<div style="font-family:Arial,sans-serif;color:#183626;line-height:1.7;max-width:620px"><h2>${safeHtml(subject)}</h2>${body.split('\n').map(p => `<p>${safeHtml(p)}</p>`).join('')}<hr><small>Adnan Hamza · <a href="https://www.adnanhamza.online">adnanhamza.online</a></small></div>` }) });
    const json = await response.json().catch(() => ({}));
    return response.ok ? { status: 'accepted', id: String(json.id || '') } : { status: 'failed', detail: 'Resend HTTP ' + response.status };
  } catch (e) { return { status: 'failed', detail: e.message }; }
}
async function sendWhatsApp(lead, dateTime) {
  if (!lead.whatsapp_consent) return { status: 'not_consented' };
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_TEMPLATE_NAME) return { status: 'not_configured' };
  const to = String(lead.phone || '').replace(/\D/g, '');
  if (!to) return { status: 'no_phone' };
  try {
    const resp = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID)}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name: env.WHATSAPP_TEMPLATE_NAME, language: { code: env.WHATSAPP_TEMPLATE_LANG || 'en_US' }, components: [{ type: 'body', parameters: [{ type: 'text', text: lead.name }, { type: 'text', text: dateTime }] }] } }) });
    const json = await resp.json().catch(() => ({}));
    return resp.ok ? { status: 'accepted', detail: json.messages?.[0]?.id || 'accepted' } : { status: 'failed', detail: 'WhatsApp HTTP ' + resp.status };
  } catch (e) { return { status: 'failed', detail: e.message }; }
}

const leads = db.prepare("SELECT * FROM leads WHERE status='booked' AND booking_start != '' AND contact_consent=1").all();
let due = 0, acted = 0;
for (const lead of leads) {
  const start = new Date(lead.booking_start);
  if (Number.isNaN(start.getTime())) continue;
  for (const wf of config.workflows) {
    if (!wf.enabled) continue;
    if (hasAccepted(lead.id, wf.kind)) continue;
    const tolerance = (wf.toleranceMinutes ?? 45) * 60_000;
    let match = false;
    if (wf.hoursBefore != null) { const target = start.getTime() - wf.hoursBefore * 3_600_000; match = Math.abs(now().getTime() - target) <= tolerance; }
    else if (wf.hoursAfter != null) { const target = start.getTime() + wf.hoursAfter * 3_600_000; match = Math.abs(now().getTime() - target) <= tolerance; }
    if (!match) continue;
    due++;
    const body = render(wf.template, lead);
    const channel = wf.channel || 'email';
    if (DRY_RUN) {
      console.log(`[dry-run] ${wf.id} → ${lead.email} (${lead.name})\n${body}\n`);
      logNotification(lead.id, channel, wf.kind + '_dryrun', 'dry_run', 'Runner in dry-run mode');
      acted++;
      continue;
    }
    const result = channel === 'whatsapp' ? await sendWhatsApp(lead, lead.booking_start ? new Date(lead.booking_start).toUTCString() : '') : await sendEmail({ to: lead.email, subject: wf.subject, body });
    logNotification(lead.id, channel, wf.kind, result.status, result.detail || result.id || '');
    console.log(`[send] ${wf.id} → ${lead.email}: ${result.status}${result.detail ? ' (' + result.detail + ')' : ''}`);
    acted++;
  }
}
console.log(`Follow-up runner complete. Mode: ${DRY_RUN ? 'DRY-RUN (nothing sent)' : 'SEND'}. Booked leads scanned: ${leads.length}. Workflows due: ${due}. Actions: ${acted}.`);
db.close();
