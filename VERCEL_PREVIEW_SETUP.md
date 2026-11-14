# GitHub / Vercel Preview Setup — Adnan Hamza

**Do not upload to `master` until the preview passes real-world tests.**

## 1. Upload the site to GitHub's `website-upgrade` branch

Repository: `HUZUofN/Portfolio` (currently public).
Unzip this project; upload the CONTENTS of `website-upgrade/` to the repository root on the **website-upgrade** branch (not the ZIP itself). The top level must show `package.json`, `vercel.json`, `api/`, `scripts/`, and `site/`.

Exclude local secrets and data: `.env`, `.vercel`, `node_modules`, `data`, `.db` and SQLite sidecar files. These are ignored via `.gitignore`, but GitHub browser uploads DO NOT automatically honor `.gitignore`. Do NOT upload them.

You may leave the old `index.html.html` file in place during the preview; Vercel will instead use the new `public/` output.

## 2. Vercel → Project adnan-hamza → Settings → Environment Variables

Configure **Preview** only until approved for production:
- `STORAGE_URL` — supplied by the Neon integration (prefix `STORAGE` with suffix `_URL`). Confirm it is available to Preview. Alternatively configure `DATABASE_URL` using the Neon connection string. Never paste it in chat or GitHub.
- `CONTACT_EMAIL` — `nothinggamer03@gmail.com`
- `RESEND_FROM_EMAIL` — `Adnan Website Alerts <notifications@adnanhamza.online>`
- `RESEND_API_KEY` — new private Resend key, NOT the one disclosed in chat.
- `CAL_CLIENT_URL` — `https://cal.com/nothing-gamer-kk06zq/free-discovery-call`
- `CAL_RECRUITER_URL` — `https://cal.com/nothing-gamer-kk06zq/recruiter-interview`
- `ADMIN_PASSWORD` — generate a strong unique password of at least 16 characters.
- `ADMIN_SESSION_SECRET` — independent random string of at least 32 characters (e.g. generated with Node: `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`). Save it privately and do not share.
- `CAL_WEBHOOK_SECRET` — keep blank until you configure the Cal.com webhook for an appropriate preview or production URL and use a private matching secret.

No WhatsApp variables are needed. WhatsApp remains DISABLED.

## 3. Vercel build settings

Framework preset: Other. Root directory: repository root.
Use build command `npm run build:vercel` and output directory `public`, as already specified in `vercel.json`.
Vercel will install `@neondatabase/serverless` from `package.json` during deployment.
`api/handler.mjs` is the Vercel API route; `server/index.mjs` is a separate LOCAL SQLite development server and is not used on Vercel.

## 4. Verify the Preview deployment

Confirm `/api/health` returns `service: adnan-funnel-vercel` and `databaseConfigured: true`.
Confirm `/api/config` says both booking links are enabled.
Open `/admin/`, log in, submit a real test inquiry, and verify it appears in admin and sends a message to Gmail.
Test recruiter inquiry, CSV export, lead status editing, forms on mobile, privacy page, service pages, CV, and Cal.com booking links.

**Important:** Existing automated tests cover the original local SQLite implementation. The new Vercel/Neon API has passed syntax checks, but its behavior has NOT been tested against your live Neon connection or Resend account. A preview deployment and end-to-end tests are required before launch. Cal.com webhook delivery is not yet live/verified.

## 5. Do not switch production yet

Keep `master` untouched while testing. Deploy to `website-upgrade` branch and use the generated Vercel Preview URL. Only after passing tests merge the branch into `master`.
