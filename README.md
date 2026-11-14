# Adnan Hamza — Opportunity Funnel

A complete, runnable dual-audience professional website for **adnanhamza.online**, with separate flows for **business clients** and **recruiters**. This is the **source project**; the existing production website was **not changed**.

Current visual system: **Midnight Navy + Electric Teal** — navy `#0B1220` backgrounds, deep blue cards `#152338`, teal `#38D9C0` accents and high-contrast light text; Fraunces display serif + Inter body. The strategy documents retain the earlier design history. See [docs/STRATEGY.md](docs/STRATEGY.md) for the audit, research, concept evaluation and architecture decisions.

## What is built

- Conversion-oriented homepage: value-proposition hero with above-the-fold primary CTA ("Book a free discovery call") and recruiter CTA, proof strip, industry credibility bar, services grid, approach band, sectors, personal band, and a one-time, subtle engagement nudge (idle-timer based, dismissible, session-scoped, reduced-motion aware).
- Intro video component in the hero. It is an **honest placeholder** — it only reveals a notice until a real first-party video is configured (`INTRO_VIDEO_URL=/assets/intro.mp4` in `.env`). Never generates or invents video content.
- Six individually indexable service pages; every service CTA preselects its context in the booking flow.
- Progressive multi-step client qualification (intent → services → brief → engagement → contact → live scheduling provider), one question per screen, progress indicator, back navigation without data loss.
- Separate, minimal recruiter interview form — never routed through the client funnel — plus a factual seven-role professional timeline, CV download at `/assets/Adnan-Hamza-CV.pdf`.
- Secure lead capture: server-side validation, optional phone collection, explicit contact permission, honeypot, IP rate limiting, SQLite persistence, UTM capture, aggregate privacy-conscious analytics including **per-step funnel events** and an admin **funnel drop-off view**.
- Password-protected `/admin/` dashboard: stats, drop-off bars, pipeline statuses, CSV export.
- **Cal.com integration-ready** inline scheduling and authenticated webhook; booking status flips to `booked` **only** on a signature-verified Cal.com event.
- **Resend integration-ready** email notifications; **Meta WhatsApp Cloud API code present but intentionally disabled** pending production setup and explicit opt-in.
- **Follow-up automation runner** (`scripts/followup-runner.mjs` + `config/followups.json`): 24h / 1h reminders and post-meeting follow-up. Dry-run by default; consent-checked; enable via cron/Task Scheduler.
- SEO/AEO/GEO groundwork: canonical URLs, sitemap, robots.txt, schema.org Person/Service/ProfilePage, `llms.txt`, SVG favicon and social card.
- 11 automated integration tests (`node:test`); Lighthouse (local): **Accessibility 100 · Best Practices 100 · SEO 100**.

## Quick start — no npm dependencies

Prerequisite: **Node.js >=22.13** (uses `node:sqlite` built into recent Node versions).

```bash
cd adnan-funnel
cp .env.example .env
# Edit .env (minimum: set a strong ADMIN_PASSWORD of 16+ characters to use the dashboard)
npm start
```

Browse `http://localhost:3000`. A brand-new local SQLite database is initialized at `./data/leads.db`.

```bash
npm run check      # Syntax checks
npm test           # Automated API tests
npm run build      # Regenerate all static pages from scripts/build-pages.mjs
npm run backup     # Consistent SQLite backup; DB_PATH can be passed via environment
npm run followups  # Follow-up runner (DRY-RUN — prints what would be sent, sends nothing)
npm run followups -- --send  # Actually send due follow-ups (requires provider credentials)
```

The website and forms run **without calendar, email or WhatsApp credentials**. In that state an inquiry is saved, and the visitor is explicitly informed that **no appointment is booked**. The admin dashboard requires `ADMIN_PASSWORD` (at least 12 characters; 16+ recommended).

## Essential production setup

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for each provider, environment variable and the follow-up runner's cron setup. At minimum:

1. Verify the public contact email, professional profile, service claims, media, and privacy notice.
2. Set `NODE_ENV=production`, `PUBLIC_SITE_URL`, `ADMIN_PASSWORD` and a persistent `DB_PATH` on a host with HTTPS.
3. Create two real Cal.com event types (client discovery call, recruiter interview). Add `CAL_CLIENT_URL`, `CAL_RECRUITER_URL`, and a matching `CAL_WEBHOOK_SECRET`.
4. Register `https://www.adnanhamza.online/api/webhooks/cal` with Cal.com for booking created, rescheduled, confirmed and canceled notifications.
5. Configure Resend with a verified sending domain for email confirmations/notifications.
6. Optionally configure Meta WhatsApp Business Platform with an **approved** template and documented consent.
7. Test the production booking end-to-end, both email destinations, and WhatsApp provider acknowledgment before calling those systems operational.
8. Back up the existing site and deploy to a staging hostname; only then switch the production site. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project map

| Directory | Role |
| --- | --- |
| `site/index.html` | Homepage (generated) |
| `site/services/*/index.html` | Six search-indexable service pages |
| `site/recruiters/index.html` | Dedicated hiring-team journey |
| `site/assets/style.css` | Design system "Midnight Navy + Electric Teal" |
| `site/assets/main.js` | Funnel, nudge, reveals, admin UI, video placeholder logic |
| `site/assets/favicon.svg`, `site/assets/og-image.svg` | Brand assets |
| `server/index.mjs` | HTTP server, database, auth, APIs, Cal.com webhooks, notifications |
| `scripts/build-pages.mjs` | Content source + static page generator |
| `scripts/followup-runner.mjs` + `config/followups.json` | Consent-checked appointment follow-ups (cron) |
| `seo/` | Keyword research seed, search/AEO/GEO plans |
| `docs/` | Audit (STRATEGY.md), decisions, setup, QA status, final report |
| `tests/` | Automated endpoint and booking-security tests |

## Important distinctions

- **Implemented and tested (locally):** content pages, lead capture, consent, SQLite persistence, admin auth/statuses/export, funnel drop-off analytics, webhook signature verification, status updates, engagement nudge.
- **Implemented but not provider-configured:** Cal.com live schedule, Resend email, official WhatsApp templates. The site behaves honestly without them (no fake confirmations).
- **Not yet done:** introduction video recording, professional headshot, production domain cutover, Google Search Console verification, real delivery tests, external security review, legal/privacy review, real-device visual QA at all sizes.
- **Never asserted:** fabricated certifications, case studies, client testimonials, sales results, search volume or guaranteed AI-search rankings.

## Personal information to confirm

The preferred public contact and notification inbox is `nothinggamer03@gmail.com`, explicitly confirmed by Adnan. The CV lists +92 320 0202045; verify whether the phone number should be public before deployment.

The resume includes seven jobs; the live site publicly summarized six with different dates. This build follows the resume and lists all seven. The current role is Maverick ConnectX (from March 2026) as supplied in the resume. Availability, portrait, videos, proof of performance, booking hours and work authorization were **not invented**.

## Privacy and security basics

All admin API routes require an HTTP-only session cookie. Cross-site form submissions are blocked, write endpoints use simple IP-based rate limiting, and database writes are parameterized. Webhook signatures use HMAC-SHA256 and a raw-body constant-time comparison. Additional deployment controls are still necessary: TLS, backups, monitoring, regular updates, log scrubbing and a reviewed privacy policy. WhatsApp is disabled by default; the frontend does not offer a WhatsApp opt-in. The optional phone field is for contact relevant to the inquiry, not blanket marketing consent. Analytics are aggregate counts — no per-visitor persistent tracking.

## AEO / GEO expectations

`llms.txt` is an optional machine-readable summary, **not** an AI-ranking mechanism. Google does not require special technical files to appear in AI Overviews. The main work is clear, accurate, crawlable service and recruiter content plus legitimate structured data. SEO/AEO/GEO is a continuing content and measurement discipline, not an integration switch.

## Docker deployment

Copy `.env.example` to `.env`, configure a strong admin password and provider credentials, then run `docker compose up -d --build`. The included compose file binds only to localhost port 3000; place a TLS-enabled reverse proxy in front of it. The named volume `adnan-leads` preserves SQLite files across container rebuilds; back up that volume regularly.
