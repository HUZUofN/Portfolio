# Phase 0–1 — Audit, Research, Concept Selection and Architecture

**Date:** 14 November 2026 · **Status:** Completed · **Live site:** https://www.adnanhamza.online/ (audited 14 Nov 2026, unchanged)

---

## 1. Audit of the current state

There are **three different artifacts** in play. Do not confuse them:

| Artifact | What it is | Condition |
| --- | --- | --- |
| Live site `adnanhamza.online` | Dark, Netflix-style portfolio behind a **"Who's watching? Recruiter / Client"** gate dialog. Shows six role dates that **conflict with the resume** (e.g. "Datafied 05/2025–08/2026 · 15 mo" vs resume "05/2025–03/2026") and uses the unverified `nothinggamer03@gmail.com`. | Dated, factually unreliable, not conversion-oriented. Not backed by this codebase. |
| Local project `./adnan-funnel` (extracted from delivered zip) | Node HTTP server + generated static site, zero npm dependencies, SQLite lead capture, admin dashboard, Cal.com webhook architecture, SEO pages. | Functionally solid, honest, but visually flat ("paper + lime" editorial) and missing conversion mechanics (no above-fold video, no engagement nudge, weak hero hierarchy). |
| This engagement | Redesign + rebuild of the local project into the conversion system described in the brief. | In progress — see this document and the final report. |

### 1.1 What the live site gets wrong

- **Forced gate with no value exchange.** A first-time visitor must answer "Who's watching?" before seeing any value — a dark pattern when the visitor has no context yet. It also repels undecided visitors.
- **Dated, inaccurate content.** Role dates differ from the resume; building trust on a factual error is fatal for a recruiter audience.
- **No booking path, no services as offers, no video, no lead capture** visible in the audit crawl.
- Visual identity is generic dark-template, not a premium personal brand.

### 1.2 What the local project gets right (preserved)

- Zero-dependency Node server, server-side validation, parameterized SQL, HMAC-verified Cal.com webhook, consent-gated WhatsApp, honeypot, rate limiting, httpOnly admin session, CSV export, privacy-conscious analytics, indexable service pages, resume-accurate content, honest "not booked yet" behaviour when providers are unconfigured.
- Resume used as single source of truth; all seven roles; no invented outcomes.

### 1.3 What must change (this redesign)

1. Visual system → premium, warm, editorial-luxury (see §4).
2. Hero → true above-the-fold value proposition, primary CTA with microcopy, secondary recruiter CTA, **intro video component in the hero** (honest placeholder until recording is supplied).
3. New **one-time, subtle engagement nudge** after ~3.5 s of zero interaction (dismissible, never blocks, never repeats in-session, respects reduced motion).
4. Funnel gains **per-step analytics** (`question_completed` per step, `funnel_close`, nudge events) so drop-off between stages is measurable.
5. Admin dashboard gains a **funnel drop-off view**.
6. Favicon + social card assets; service pages get per-service "problems → capabilities → tools → CTA" rhythm refined; recruiter page strengthened (CV + interview request + factual timeline).
7. **Follow-up automation runner** (`scripts/followup-runner.mjs`) with templates + dry-run default, designed for cron — the missing piece between "lead saved" and "call happened".
8. Docs: deployment/cutover plan, decision log, final gap list.

### 1.4 Genuinely missing information / credentials (owner to provide)

- Professional headshot (hero currently uses a styled monogram — **not** a fake photo).
- 30–60 s introduction video (component built; plays only a real first-party `/assets/intro.mp4` when supplied).
- Public email confirmation: resume `nothinggamer03@gmail.com` (current default) vs live-site `nothinggamer03@gmail.com`.
- Cal.com event links + webhook secret; Resend API key/verified sender; WhatsApp Business Cloud API credentials + approved template.
- Hosting/domain deploy access for staged cutover; work authorization and hours statements (never invented).

---

## 2. Research findings (what actually drives conversion)

Sources: conversion-design.com, lovepixelagency.com, instapage.com, meritsonly.com, Formstack/Heyflow benchmark reporting, semicolonweb.com, NN/g progressive-disclosure guidance (2024–2026). Key principles applied:

1. **Multi-step forms beat single forms.** Formstack-reported ~13.9% vs 4.5% completion; Instapage A/B: +21.4% when a long form is split into paced steps with the same fields. → Keep and polish the one-question-at-a-time funnel.
2. **Progressive disclosure + momentum.** Show only the current question, a progress indicator, and an easy back path; preselect context from the CTA the visitor clicked (service-specific CTAs). Already implemented; preserved and instrumented.
3. **Value above the fold, before identity questions.** Lead with outcome and proof, CTA first, booking embedded or one tap away. → Hero rewrite; video in hero; no identity gate.
4. **Embedded scheduling removes the last friction.** Cal.com inline embed with prefilled name/email and lead metadata; status only flips to `booked` on a signature-verified webhook — never on optimistic UI.
5. **Honest capacity > fake urgency.** A visible "Open to projects & remote roles" signal and a reply-time microcopy ("Reply within 24h") outperform countdown timers for a services business.
6. **Step-level analytics.** Aggregate page views cannot find the leak; per-step completion events can. → Added.
7. **One clear accent + typographic hierarchy** beats decorative noise; reserve the single accent for CTAs.
8. **Trust without fabricated proof.** Verified CV, roles, tools, education and availability framing; zero invented testimonials/logos/stats.

---

## 3. Three concepts

| Criterion (10) | A. Editorial Dossier (evolve current light build) | B. Dark Authority (evolve live-site dark gate) | C. The Quiet Close (premium warm-ink funnel) — **selected** |
| --- | ---: | ---: | ---: |
| Immediate clarity | 9 | 7 | **10** |
| Professional credibility | 9 | 7 | **9** |
| Visual appeal | 7 | 9 | **9** |
| Client conversion potential | 7 | 8 | **9** |
| Recruiter usability | 9 | 6 | **10** |
| Mobile experience | 9 | 8 | **9** |
| Technical feasibility | 10 | 8 | **9** |
| Long-term scalability | 9 | 8 | **9** |
| **Total / 80** | **69** | **61** | **74** |

**Concept A** — calm paper/serif/editorial; lovely to read, but passive: no urgency to act, hero lacks a reason to book *now*.
**Concept B** — immersive dark; strong first impression, poor recruiter scan-ability, conflicts with live-site perceptions and ages badly; the gate pattern demonstrably frustrates.
**Concept C** — warm ivory canvas, deep pine-ink surfaces, burnished brass accent, Fraunces display serif + Inter body. Hero sells the **outcome** ("More qualified conversations. Fewer missed opportunities."), proof strip is resume-accurate, one accent colour is reserved for CTAs, the whole funnel is one tap from anywhere. Recruiter journey is visually equal but factually fast (CV → timeline → interview request).

**Why C wins:** highest clarity (10) and recruiter usability (10) with no trade-off on appeal; it keeps A's structural honesty and B's confidence while adding genuine funnel mechanics (video-first hero, engagement nudge, per-step analytics). Feasible inside the existing architecture.

---

## 4. Information architecture & journeys

**Primary (client):** Hero CTA / service CTA / nav → funnel (preselected service) → intent → services → brief (optional) → engagement → contact + consent → live Cal.com embed → confirmation → webhook-verified `booked` → Resend + optional WhatsApp confirmations.

**Secondary (recruiter):** Hero recruiter CTA / nav "For recruiters" → `/recruiters/` (facts: summary, CV download, timeline, tools, education) → "Request an interview" (name, company, email, role, preferred window) → saved as recruiter lead → owner notification. Never routed through client qualification.

**Information architecture:** `/` home · `/services/{lead-generation,appointment-setting,customer-support,crm-operations,technical-support,operations-support}/` · `/recruiters/` · `/privacy/` · `/admin/` · assets.

## 5. Technical architecture (unchanged where sound)

Zero-dependency Node ≥22.13 server · generated static SEO pages · SQLite (`node:sqlite`) · HMAC Cal.com webhook · Resend email · Meta WhatsApp Cloud API template · httpOnly admin session · IP rate limiting · honeypot · consent-separated WhatsApp opt-in · privacy-conscious aggregate analytics · **new**: per-step funnel events + admin drop-off view · **new**: `scripts/followup-runner.mjs` cron-invoked reminder system (dry-run by default) · **new**: favicon + OG card · deployment via staged cutover (backup → staging → DNS) — live site untouched.

## 6. Decision log

1. Keep live domain untouched; ship to local project + docs; production only with backup & staged plan. — 2026-11-14
2. Keep Node/SQLite architecture; no framework rewrite (rule 9 in brief). — 2026-11-14
3. Cal.com (not Google Calendar API) for availability — manages double-booking/timezones natively; status `booked` only via verified webhook. — 2026-11-14
4. No fake media: portrait monogram until headshot supplied; video component honest; plays only configured first-party asset. — 2026-11-14
5. Resume is the only content source of truth; live-site role dates disregarded. — 2026-11-14
6. Engagement nudge: one-time, dismissible, sessionStorage-scoped, reduced-motion aware. — 2026-11-14
7. Email default = resume address; flagged for owner confirmation. — 2026-11-14
8. Follow-ups implemented as consent-checked, dry-run-default runner + templates; not a hosted queue (avoids new infrastructure). — 2026-11-14
