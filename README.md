# WallPanels FieldOps — Telegram Mini App

A lightweight, no-third-party-dependencies Telegram Mini App for WallPanels installation evidence, worker checklists, daily reports and PM approval. Built to deploy as **one Node 22 service** on Railway and use **one dedicated corporate Supabase project**.

## Important status

- The source code and Supabase migration are included, and syntax/unit tests are provided.
- **This archive is NOT deployed or connected to your corporate accounts.** Codex must run real integration/end-to-end tests before anyone uses it on a client site.
- Current credentials are read only from the user-approved local source and must never be copied into code, GitHub, logs or chat. Rotate immediately if any value is exposed.
- The mobile visual style follows the selected soft lavender, white-card, rounded Poppins reference. Structure is purpose-built for installation.

## What is included

- `public/index.html`, `public/styles.css`, `public/app.js`: responsive mobile-first UI with PM/Installer views, stage checklists, photo/video upload, daily reports, issues, invitations, client sign-off, printable report.
- `server/index.js`, `server/auth.js`, `server/supabase.js`, `server/templates.js`: Node HTTP server, Telegram signature validation, signed 12h sessions, server-side RBAC, private Supabase REST/Storage, Telegram notifications and menu bot.
- `supabase/migrations/001_fieldops.sql`: tables, indexes, private storage bucket, RLS and immutable audit-log events.
- `CODEX_DEPLOY_PROMPT.md`: step-by-step instructions and limits on account access.
- `tests/`: offline auth, template and validation tests.
- `.env.example`, `railway.json`: safe deployment templates.

## Local design preview — no tokens, no accounts, no database

Requires Node.js 22+, no `npm install` required:

```bash
npm run preview
```

Open `http://localhost:3000/?preview=1` in desktop or mobile browser. Sample project is preloaded. This is only a visual sandbox: changes are in memory. It must never be used as production authorization.

## Production deployment summary

1. Create or confirm **corporate** GitHub repository `Wallpanels-com/wallpanels-fieldops`.
2. Use only the pre-created **corporate** Supabase `wallpanels-fieldops` project. **Do not create another**. Use SQL Editor or a connected CLI to run `supabase/migrations/001_fieldops.sql`. Confirm bucket `fieldops-media` is private, tables have RLS enabled.
3. Read current credentials only from the approved local source and set them as Railway service Variables, never in code. Also set `SESSION_SECRET` (random >=40 chars), `BOOTSTRAP_ADMIN_TELEGRAM_ID` (numeric, your own Telegram ID), `SUPABASE_URL`, `APP_BASE_URL` and `TELEGRAM_BOT_USERNAME`.
4. Deploy GitHub repo on **corporate** Railway workspace. Node 22, single replica (bot uses long polling), `npm start`, healthcheck `/api/health`, enable HTTPS domain. Set `APP_BASE_URL` to that domain and redeploy. Bot configures its menu button on startup.
5. Telegram `/start` replies with numeric Telegram ID. The bootstrap administrator is automatically created at first successful Mini App Telegram login if that ID matches the Railway variable.
6. On Profile, admin can switch **Installer / Project Manager** interface views for single-user testing, without altering privileges in the database. Normal installers cannot switch or self-promote.
7. First do a complete fake project walkthrough (preflight → before photo/video → protection → progress → after photo/video → cleanup → client confirmation → daily report → final PM approval).

### Required server variables

| Key | Notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Railway provides automatically |
| `TELEGRAM_BOT_TOKEN` | Current token — server only |
| `TELEGRAM_BOT_USERNAME` | Username without `@` |
| `SUPABASE_URL` | Dedicated corporate project URL |
| `SUPABASE_SECRET_KEY` | Current `sb_secret_...`, server only |
| `SESSION_SECRET` | Random 40+ chars, e.g. `openssl rand -hex 40` |
| `BOOTSTRAP_ADMIN_TELEGRAM_ID` | Your Telegram numeric ID only |
| `APP_BASE_URL` | Railway public HTTPS URL |

Note: `sb_secret` is sent in an `apikey` header. It is not a JWT. Publishable API key is not needed in this architecture because the browser talks to the authorized Node server only.

## Functional model

1. PM creates a project (Installation / Repair / Punch List) and assigns pre-invited installers using their Telegram IDs.
2. Crew sees only its assigned projects; photos and videos can be attached to separate stages, with unlimited entries within storage/service quotas.
3. Every required photo/video type and required checklist must be present (or explicitly approved N/A) before project submission.
4. Distinct daily reports (one per project/date) require end-of-day photo, site tidy, no hazards, tools collected, PM notified.
5. Report damage/quality/change requests. PM must document a resolution; damage and quality issues require photographic evidence to close the entire project.
6. Record client signed confirmation with image of signed document, or refusal with explanation.
7. PM approves or requests changes. Non-admin PM cannot approve a report they themselves submitted. A single bootstrap admin can self-approve for testing.
8. Once in review / completed, routine edits are locked. After request for changes, installer may fix and resubmit.

## Security / operational controls

- Server validates Telegram `initData` HMAC and freshness, never trusts `initDataUnsafe` or frontend roles.
- Invite-only users, project membership checks on every protected API request.
- Private storage bucket with temporary signed read links. Secret API key only on server.
- File upload is streamed through Node to Supabase, no per-file RAM buffering. Supports JPEG/PNG/WEBP/HEIC/HEIF and MP4/MOV/WEBM. Single-image max 15MiB, video max 50MiB. **Resumable large uploads / true offline queue are future improvements.**
- Immutable audit trail captures database row changes. Project creation is atomic, cross-project references are blocked by database constraints, and no media deletion is exposed to installers.
- Telegram notifications are best effort. Client data still persists if Telegram delivery fails.
- The background bot uses polling: keep Railway replicas at **1**. For HA/multi-replica, migrate to validated webhook with single consumer.
- Signed photo URLs last 1 hour and should not be shared externally.
- Production run requires testing on actual iOS/Android Telegram WebViews. Camera capture and HEIC/MOV behavior can vary.

## Acceptance test commands

```bash
npm test
npm run check
```

Run smoke test on deployed domain: `GET /api/health` must respond with `{ "ok": true }`. Unauthorized `GET /api/projects` must respond `401`. Verify Telegram login, invite, file upload, photo preview and status progression in real Supabase. Validate responsive design at 375px / 430px / tablet.

## Exclusions and limitations

- No GoHighLevel sync in v1. No AI, facial tracking, geolocation validation, client e-signature canvas, EXIF proof, true offline sync, background retry queue or native video transcoding.
- Print report uses browser `Print → Save as PDF`, not generated server PDF. Videos are listed by filename in printed report.
- Corporate project checklists are code-defined defaults and N/A can be approved by a PM. In-app visual checklist template editing is a future feature.
- PM can add additional project-specific photo/video categories with configurable required/optional flags, but cannot remove strict BEFORE/AFTER videos or signage requirements.
- An HTML proof-of-concept and offline tests alone do **not** establish production readiness. Codex is explicitly asked to verify integration and fix deployment blockers.

## Requirement mapping

See `docs/requirements-map.md` for traceability to the seven WallPanels training documents.
