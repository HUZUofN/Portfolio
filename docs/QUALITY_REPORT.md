# Implementation & QA status — 14 November 2026

Supersedes the 12 November snapshot. Environment: local Windows workstation, Node v26.13.1 (LTS), project served at `http://localhost:3000`.

## Test matrix

| Capability | State | Evidence / limitation |
| --- | --- | --- |
| All pages build & serve | Tested | `npm run build` regenerates 10 files; HTTP 200 verified for `/`, `/recruiters/`, services, CV, robots.txt, sitemap.xml, llms.txt |
| Homepage hero + video component | Verified in browser | Hero renders; "Watch the introduction" reveals the honest "recording in progress" notice; no autoplay, no fake media |
| Engagement nudge (3.5 s idle) | Verified in browser | Shows only when idle; hides on interaction/CTA/dismiss; session-scoped via `sessionStorage`; hidden on `/admin/` |
| Client funnel end-to-end | Verified in browser | Intent → services → brief → engagement → contact (validation + double-entry consent) → submit → honest "not booked yet" screen with email fallback |
| Per-step funnel analytics | Verified in browser | `question_completed` events recorded for all five steps; admin renders drop-off bars |
| Recruiter journey | Verified in browser | CV download, interview-request button, 7 roles rendered, direct mailto path |
| Service pages | Verified in browser | CTAs preselect the correct `data-service`; 6 indexable pages |
| Admin dashboard | Verified in browser | Login, stats, drop-off view, lead table with status dropdown; test DB deleted afterward |
| Automated tests | Tested | `npm test` → 11/11 pass. (Prior intermittent Windows temp-dir EPERM fixed: tests now wait for child exit and retry cleanup.) |
| Lighthouse (local, homepage) | Verified | **Accessibility 100 · Best Practices 100 · SEO 100** (client-rendered page; scores re-verified after fixes) |
| Cal.com scheduling / double-booking | Provider architecture only | Requires real event links, connected calendar and provider E2E test |
| Resend emails | Integration code only | Requires provider account/domain/API key and real delivery test |
| WhatsApp confirmations | Integration code only | Requires approved opt-in template, provider token, consented test |
| Follow-up runner | Dry-run verified | `npm run followups` prints scheduled sends and writes `dry_run` log rows; no message sent without `--send` |
| Headshot / intro video | Placeholder (honest) | Monogram avatar; video card marked "Recording in progress — coming soon" |
| Tablet/mobile visual QA | Partially verified | Rendered correctly at ~721 px viewport; no findings; **true device pass still recommended** |
| Keyboard/screen-reader manual pass | Partial | Focus styles, Escape/Tab trapping in dialog, reduced-motion support; manual SR audit still needed |
| Live staging / production deployment | Not done | Blocked on hosting credentials + backup + explicit go-live approval (see docs/DEPLOYMENT.md) |
| Search indexing / AI visibility | Not measured | Requires Search Console verification post-cutover; no rankings claimed |

## Automated checks

- `npm run check` — all syntax checks pass (server, funnel JS, page generator, follow-up runner).
- `npm test` — 11/11 pass.
- Lighthouse — 100/100/100 (a11y / best practices / SEO) on the local homepage.

## Security notes verified

- Admin routes 401 without cookie; cookie is `HttpOnly; SameSite=Strict` (+`Secure` in production); timing-safe password comparison; 8-hour sessions; rate-limited login.
- Write endpoints: same-origin enforcement + IP rate limiting + honeypot; parameterized SQL.
- Cal webhook: HMAC-SHA256 signature on raw body, constant-time compare, replay de-duplication via `webhook_log`.
- Static server blocks path traversal (403) and serves only files inside `site/`; `/admin/` is `noindex` and disallowed in robots.txt; CSP/Referrer-Policy/Permissions-Policy headers set.

## Known limitations

1. Cal.com iframe requires the event's embed permission in the provider; iframe height is fixed (430 px) with a direct-link fallback.
2. SQLite is single-node; back it up daily and restore-test it. Multi-instance deployments need a shared managed database.
3. Cal.com webhook matching prefers `leadId` metadata, falls back to latest lead by attendee email — confirm against your exact provider payload version.
4. Notification rows record provider **acceptance**, not handset/inbox delivery; configure provider delivery callbacks for ground truth.
5. Aggregate analytics do not de-duplicate visitors across sessions; they are directional for funnel ratios.
6. Assets are versioned with a manual `assetVersion` constant in `scripts/build-pages.mjs`; bump it when CSS/JS releases change to bust browser caches (current: `2026-11-14-b`).
7. `og-image` is SVG; most social scrapers prefer 1200×630 PNG — export the SVG to PNG before marketing pushes.
8. Legal privacy review and retention policy need counsel sign-off before production data collection.

## Launch gate

Do not call production operational until: real scheduling, signed webhook, email delivery, consented WhatsApp (if enabled), admin security verification, backups, responsive device QA, privacy review, and a rehearsed rollback have all been verified by the owner on the live/staging environment.

## Addendum — 14 Nov 2026 (SEO/AEO pass)

- Visible, factual FAQ sections added: homepage (2 questions), each of the 6 service pages (1 question), recruiters page (2 questions) — the 10 questions from the AEO strategy are now all answered on-page.
- `FAQPage` JSON-LD added to those pages (questions + answers match visible content). `Service`, `ProfilePage` and `Person` schema retained.
- Lighthouse re-verified after the change: **A11y 100 · Best Practices 100 · SEO 100**, `npm test` 11/11, single-file site and both ZIP packages regenerated.
- NOT done and not claimable: Search Console verification, sitemap submission, ranking/indexing measurement, keyword validation (the 80-phrase workbook is an unvalidated seed), content marketing, `sameAs`/citations, AI-citation monitoring. These require the owner and the live-domain cutover.
