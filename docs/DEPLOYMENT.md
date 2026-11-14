# Deployment & cutover plan — adnanhamza.online

**Do not run these steps until the owner has explicitly approved a go-live window.** The live website at `https://www.adnanhamza.online/` was left untouched throughout this project.

## 1. Backup (before anything else)

- Export the current production site: full file tree, any database, server config (nginx/Apache), environment variables, DNS zone, TLS certificate details.
- Timestamp the backup, store it off-box, and write a rollback procedure (restore + DNS unchanged = instant rollback).
- Confirm you can restore it: restore once into a scratch directory or staging host.

## 2. Staging first

- Deploy this project to a staging host/subdomain (e.g. `staging.adnanhamza.online`) with its **own** `leads_staging.db` and `NODE_ENV=production`.
- Put a TLS reverse proxy in front (nginx, Caddy, or platform equivalent). Do not expose port 3000 directly.
- Verify: pages render (desktop/tablet/mobile), admin login works, funnel completes end-to-end, Cal.com booking works with a real event, emails arrive, WhatsApp template acknowledges (if enabled), webhook flips a test lead to `booked`, CSV export and `/admin/` behave.

## 3. Content sign-off gate

- [ ] Public email confirmed (`nothinggamer03@gmail.com` resume vs `nothinggamer03@gmail.com` live) — used everywhere including privacy page and CV.
- [ ] CV employment dates and roles match the resume (they currently do).
- [ ] Headshot and intro video (with captions/transcript) supplied and wired as `/assets/intro.mp4`.
- [ ] Claims review: no invented stats, testimonials, logos or certifications anywhere.
- [ ] Privacy notice reviewed against actual processing and jurisdiction.

## 4. Cutover

1. Announce nothing externally yet.
2. Point production DNS at the new host (or swap the origin in the proxy).
3. Keep TTLs low in advance (300 s) so rollback is quick.
4. Immediately verify production by hand: homepage, hero CTA, one test booking (cancel it after), admin log-in, CV download, `/sitemap.xml`.
5. Request re-indexing/verification in Google Search Console; submit sitemap.

## 5. Rollback trigger & procedure

Trigger on any of: broken booking flow, 5xx errors, email mis-sends, or broken layout on production.

- Restore the backed-up production files/origin.
- DNS remains pointing at the same edge; restore the origin in minutes.
- Diagnose offline, fix, redeploy to staging, and cut over only after re-verification.

## 6. Ongoing operations

- Daily SQLite backup (`npm run backup`) or managed-volume snapshot; test restore monthly.
- Weekly: review `/admin/` (new leads, statuses), export CSV if needed.
- Monthly: check Resend/WhatsApp provider dashboards, Cal.com webhook health, and error logs.
- Before scaling beyond one process: move from SQLite to a shared managed database.
- Privacy retention: purge leads that never converted beyond the agreed business window; honor deletion requests at the `nothinggamer03@gmail.com` inbox.

## 7. Known risks

- **Provider lock-in drift:** Cal.com webhook payload fields can change — capture failing webhooks in `webhook_log` (already logged) and reconcile after provider updates.
- **SQLite on a single node:** fine for personal volume; not for multi-instance or spiky traffic.
- **Legal:** the privacy page is an initial disclosure, not legal advice; review with qualified counsel.
- **Deliverability:** SPF/DKIM/DMARC must be configured for `RESEND_FROM_EMAIL`'s domain before announcing launch.
