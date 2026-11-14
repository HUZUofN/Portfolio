# Production configuration and integration runbook

## 1. Inspect and protect the current production website

- Export your existing hosting files, repo state, database (if any), current DNS and environment variables.
- Take a timestamped backup and save rollback instructions.
- Deploy this project to staging first, e.g. `staging.adnanhamza.online`, with a separate staging DB.
- Review the public resume / service content and replace placeholders. Do **not** overwrite the live site without verification.

## 2. Application runtime

Use Node.js >=22.13 with `node:sqlite` available. Run `npm run check && npm test && npm start`. Environment variables are loaded from `.env` if present and not already defined in the hosting process. Never check `.env` into git. Set HTTPS at your ingress/proxy. Keep `DB_PATH` on a persistent volume and back it up daily; confirm restore procedure. Configure `NODE_ENV=production`, public domain and `ADMIN_PASSWORD` (a unique strong secret of 16+ characters). Admin panel: `/admin/`.

## 3. Cal.com (necessary for actual appointments)

1. Create or access an authorized Cal.com account at https://cal.com/.
2. Connect the calendar account that holds Adnan's actual availability; set timezone, buffer, minimum notice, work hours, and reschedule/cancel policy.
3. Create a **Client discovery call** event type, e.g. 30 minutes, and a **Recruiter interview** event type, e.g. 30 minutes. These are examples; use the real event lengths.
4. Copy the two actual **HTTPS Cal.com booking links**, and configure `CAL_CLIENT_URL` and `CAL_RECRUITER_URL`.
5. Test the booking links on mobile, and confirm Cal.com is embedding correctly for your event type. The frontend displays the provider in an iframe and includes a direct-link fallback.
6. In Cal.com Settings → Developer → Webhooks (or the event type webhooks), add `https://www.adnanhamza.online/api/webhooks/cal` with triggers `BOOKING_CREATED`, `BOOKING_CONFIRMED` (if available), `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`.
7. Create a long random signing secret and set the *same* secret in Cal.com and the server's `CAL_WEBHOOK_SECRET`. The endpoint verifies `X-Cal-Signature-256` against raw JSON before changing a lead status.
8. Submit a **real test booking**. Confirm both the appointment in Cal.com and the corresponding `booked` status in `/admin/`. Test timezone, conflicts, cancellation and rescheduling. A local mock/signature test cannot replace this.
9. Use Cal.com Workflows for provider-managed reminder emails, optional reschedule/cancel communications and booking cancellation policies. Those workflows must be explicitly configured in the provider.

**Important:** Completion of the website's qualification form is **not** a confirmed booking. Only Cal.com's actual reservation acceptance and signed webhook event make it booked in this app.

Provider docs: https://cal.com/embed and https://cal.com/features/webhooks

## 4. Resend email (necessary for outbound website notifications)

1. Verify a sending domain and account at https://resend.com/.
2. Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (verified address), and `CONTACT_EMAIL` (recipient for new leads).
3. Test a lead submission with the owner notification and a real booking with guest/owner confirmation emails.
4. Review spam folder, logs and provider dashboards; API accepted is not proof of inbox delivery.
5. Distinguish Cal.com's own native calendar invitation from custom website notifications to avoid duplicate messaging.

The server stores accepted/failed/not-configured notification statuses internally; it does not pretend that an accepted API request equals delivered mail.

Provider docs: https://resend.com/docs/send-with-nodejs

## 5. Official WhatsApp Business Platform (DEFERRED; do not activate in this release)

1. Create/use a legitimate Meta WhatsApp Business account and phone number.
2. Obtain a suitable system-user access token and `WHATSAPP_PHONE_NUMBER_ID`; set `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`.
3. Submit and obtain approval for an **appointment confirmation** template with exactly **two body variables**: `{{1}}` = visitor name, `{{2}}` = meeting date/time (UTC label currently).
4. Set `WHATSAPP_TEMPLATE_NAME` and language code `WHATSAPP_TEMPLATE_LANG`.
5. The current release has no WhatsApp consent checkbox. Do not activate this integration without separately implementing and verifying an explicit WhatsApp opt-in, updating the privacy notice, and testing delivery. Never message contacts who did not opt in.
6. Set up message-status webhooks or provider reporting if delivery-level status is needed. Current app records API acceptance/failure, not confirmed handset delivery.

Official service: https://developers.facebook.com/docs/whatsapp/cloud-api/

## 6. SEO / visibility launch

- Connect Google Search Console to `https://www.adnanhamza.online/` with authorized domain ownership.
- Submit `/sitemap.xml` and monitor indexing and canonical URLs.
- Verify no `noindex` tag exists on public pages (the admin page **must** be noindex).
- Keep a separate page for each demonstrated service. Update titles/descriptions/FAQ content based on real Search Console query data and conversion outcomes.
- Make an actual transcript from Adnan's eventual intro video; never fabricate video content.
- Review the 80-keyword workbook before writing extra pages, using actual demand/competition data and eligibility by market.
- Monitor both **qualified leads** and **verified bookings**, not page views alone.

## 7. Test checklist prior to production cutover

- [ ] Confirm public email and phone.
- [ ] Review CV employment dates, skills and tools.
- [ ] Add real professional portrait and 30–60 sec intro video, with captions and poster.
- [ ] Configure separate Cal.com links, timezone and webhook secret.
- [ ] Book, reschedule and cancel with real Cal.com account.
- [ ] Configure and send real test email; check inbox and deliverability.
- [ ] Configure approved opt-in WhatsApp template; verify real delivery if enabled.
- [ ] Confirm form paths, validation, admin status updates and CSV exports.
- [ ] Run staging browser tests on desktop and mobile including keyboard / accessibility.
- [ ] Review privacy notice and data-retention practices.
- [ ] Back up original live site; verify staging and rollback; obtain explicit go-live approval.

## 8. Follow-up automation runner (reminders & post-meeting)

`scripts/followup-runner.mjs` sends appointment reminders and a post-meeting follow-up for leads that Cal.com has confirmed (`status='booked'` with a `booking_start`). It reads `config/followups.json` for workflow definitions.

1. Edit `config/followups.json`: enable/disable workflows, adjust `hoursBefore` / `hoursAfter`, `toleranceMinutes`, and the message templates. Respect consent: **email requires `contact_consent=1`; WhatsApp additionally requires `whatsapp_consent=1` and the approved opt-in template.**
2. The runner is **dry-run by default**. `npm run followups` prints exactly what it would send and logs `dry_run` rows in the `notifications` table — it sends nothing.
3. Verify a dry-run first, then wire it to cron/Task Scheduler (e.g. every 15–30 minutes) with `node scripts/followup-runner.mjs --send`.
4. Deliverability requires the Resend configuration from section 4; without credentials the runner logs `not_configured` and exits cleanly — it never pretends delivery happened.
5. De-duplication: a workflow does not re-send for the same lead once an `accepted` notification exists for that lead + kind. Failure rows (`failed`, `not_configured`) do not block later attempts.
6. Do not enable a workflow whose consent requirements are not met; no-show and post-meeting sequences must remain proportionate and non-spammy.
