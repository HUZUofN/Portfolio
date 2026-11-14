# Website audit, commercial strategy and decision log

> **Superseded (2026-11-14):** the concept evaluation and architecture sections are replaced by [STRATEGY.md](STRATEGY.md), which reflects the Nova redesign ("The Quiet Close"). The live-site audit below remains historically accurate as of 2026-11-12. Live-site role dates are known to conflict with the resume; the resume is the source of truth.

**Audit date:** November 12, 2026. **Source:** https://www.adnanhamza.online/ (public content), provided two-page resume and user project brief.

## Existing site

Public site displays an audience prompt (**Recruiter / Client**), general portfolio heading, professional background, six role count, core skills, 7 CRM/dialer platforms, experience sections and contact information. The resume lists seven roles and an alternative email address. No live booking confirmation, admin database, source code repository, hosting dashboard or authenticated integrations were accessible during the audit. A public HTML crawler does not establish absence of client-side functionality, so these features are described as **not independently verified**, not definitively absent.

**Preserved:** name, project/operations background, Computer Engineering education (National University of Technology, Jun 2024), five+ years experience, supported areas of work, familiar CRM/dialer tools, and both target audiences.

**Redesigned:** above-the-fold value messaging, service presentation, recruiter experience, contextual CTAs and conversion paths.

**Added in project:** full qualification flow, recruiter form, editable status pipeline, SQLite database, admin authentication, analytics, provider-verified calendar integration architecture, email/WhatsApp integration architecture, search-indexable service pages, structured data and sitemap.

**Not verified:** source repository stack and backend, production behavior, media assets, mobile performance/accessibility in a real browser, search ranking, existing provider accounts and deployment credentials.

## Positioning and target markets

- **Client audience:** business owners and teams seeking lead generation, appointment setting, customer support, CRM operations, basic technical/user support, and project coordination. Start with US and Canadian buyers, especially real estate, home services, healthcare administration, education and agencies.
- **Recruiter audience:** remote hiring teams seeking project/operations coordinators, customer support, technical support, CRM specialists and SDR/appointment-setting talent. US/Canada primary, UK/Australia secondary market hypotheses. Avoid claims about legal work eligibility and availability that are not in the resume.
- **Desired actions:** clients submit a qualified inquiry then select an actual Cal.com booking slot; recruiters review professional evidence, download the resume, and send a short interview request.

## Concepts evaluated (subjective strategy scoring)

| Criterion (10 each) | Audience gateway | Consultant-first | Dual-path value-first |
| --- | ---: | ---: | ---: |
| Immediate clarity | 7 | 9 | 9 |
| Professional credibility | 8 | 7 | 9 |
| Visual appeal | 8 | 8 | 9 |
| Client conversion potential | 7 | 9 | 9 |
| Recruiter usability | 7 | 5 | 10 |
| Mobile experience | 7 | 8 | 8 |
| Technical feasibility | 10 | 9 | 9 |
| Scalability | 9 | 9 | 9 |
| **Total / 80** | **63** | **64** | **72** |

**Selected:** dual-path value-first. One clear homepage communicates value before users commit to a path. The recruiter page stays separate from the client's qualification funnel.

## Architecture decisions

1. **Dependency-light Node 22 + HTML/CSS/JS + SQLite:** maintainable and runnable without package installation. Suitable for low-volume personal site with a persistent disk; re-evaluate managed database if scaling.
2. **Static indexable pages generated at build time:** bot-accessible content without depending on client-side JS or a complex framework. Canonical, title, descriptions, schema.org, sitemap.
3. **Cal.com for availability/booking:** avoids inventing availability and double-booking prevention. A signed booking webhook determines true status.
4. **Progressive qualification:** intent → service → brief (optional) → engagement → contact → live provider. A service CTA skips the first questions and preselects context.
5. **Recruiter flow independent:** short role request form plus CV and seven-role professional timeline.
6. **Opt-in messaging only:** lead consent separate from optional WhatsApp consent; no silent marketing subscriptions.
7. **Credibility constraint:** no fabricated testimonials, certifications, results, photos, videos or work arrangements.
8. **Production deployment:** staged cutover with backup. No existing hosting or repo has been changed.

## Missing user-provided assets and access

- Confirm whether the public email should be `nothinggamer03@gmail.com` (resume) or `nothinggamer03@gmail.com` (live site).
- Authentic headshot, personal introduction video and optional service videos; none fabricated.
- Real service scope and availability/hours, engagement terms and timezone constraints.
- Cal.com booking links and webhook secret, Resend sender/domain/API key, official WhatsApp provider credentials and approved template.
- Domain / hosting / repository access for staging and production deployment.
- Actual client outcomes, case studies and testimonials *only if legitimately documented and consented*.

## Source references

- Website: https://www.adnanhamza.online/
- Google Search Central SEO guide: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google AI features guidance: https://developers.google.com/search/docs/appearance/ai-features
- Cal.com embedding: https://cal.com/embed
- Cal.com signed webhooks: https://github.com/calcom/help/blob/main/webhooks.mdx
