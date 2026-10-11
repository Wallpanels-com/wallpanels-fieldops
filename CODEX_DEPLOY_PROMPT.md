# CODEX TASK — WALLPANELS FIELDOPS: DEPLOY, VERIFY, DEBUG

You are an experienced full-stack engineer, Telegram Mini App integrator, QA engineer and responsible production DevOps engineer. I have attached `wallpanels-fieldops.zip`, which contains a ready-to-test project and SQL migration. **Use the supplied source as the base.** Your job is to audit it, fix every found blocker, deploy into ONLY the target CORPORATE resources and return a testable Telegram Mini App.

## Hard boundaries — never cross

- **DO NOT TOUCH ANY OF MY PERSONAL GitHub / Supabase / Railway projects or repositories.** Do not even run migrations, create services or write environment variables in personal workspaces. Read current account/workspace context first, identify the proper corporate scope and stop to request confirmation if the corporate scope cannot be unambiguously selected.
- Authorized GitHub target: corporate organization **`Wallpanels-com`**, existing repository **`wallpanels-fieldops`**. Remote HTTPS: `https://github.com/Wallpanels-com/wallpanels-fieldops.git`. Do not create alternative repositories. Only work in this repo.
- Authorized Supabase target: existing corporate project named **`wallpanels-fieldops`**. Verify its project reference by comparing project URL in the Desktop document `Fields` against the connected Supabase project before any SQL. **Never create another Supabase project.** Never run destructive SQL outside this empty/new project's scoped migration. Never touch SCORE or other projects.
- Authorized Railway target: corporate WallPanels workspace, create only a new service/project `wallpanels-fieldops` there. **Do not touch existing services or personal Railway resources.** If no corporate Railway workspace is available, pause deployment and ask for scoped authorization. A personal workspace is NOT an acceptable fallback.
- Credentials shown in a previous screenshot are exposed. **First instruct me to rotate all previously shared Telegram bot tokens, Supabase secret keys, and the Supabase database password.** Do not deploy using those exposed values. Do not print any actual secret or password in chat, commit logs, CLI history, screenshots, tracing, `.env` under git, or build artifacts.
- The local Desktop file is named **`Fields`** (possibly `Fields.docx` or another Word-compatible extension). Search exact filenames under `~/Desktop` without dumping its contents. Open locally only if workspace permissions allow. Values may be read to match the target project URL, but **use NEW rotated credentials** for production Railway Variables. Never commit the file or copy it into the repo. If you cannot access the file or rotated keys, ask me to add the values directly via Railway Variables / secure connector.
- You may push commits to the corporate repo, run SQL in the verified corporate Supabase project and deploy only in the verified corporate Railway workspace. Do not change BotFather settings outside this project's Telegram bot.

## Product vision and design (preserve)

- This is a responsive, polished Telegram Mini App for WallPanels / Verona Home installation teams.
- The design reference is minimalist premium task-management UI: **Poppins** font, off-white/soft-grey background, bright white rounded cards, lavender/purple accents (`#704FEB`), 18–28px corner radii, spacious layouts, bottom navigation, restrained shadows. Current CSS implements this direction; refine only where visually necessary.
- Installer sees assigned projects → stages → photos/videos per specific stage, with multiple uploads, checklist and progress. PM sees all own projects, issues, team assignments and acceptance. **Do not overload workers with corporate policy text or dozens of unrelated screens.**
- Reference documentation: seven WallPanels PDFs were interpreted in `docs/requirements-map.md`. **Strict photos/videos BEFORE and AFTER**, company flags/signs in initial photos, floors/walls/furniture, site protection, during installation, before/after cleanup, quality inspection, end-of-day safety, client form signed or refused. All missing evidence must block completion (except specifically PM-approved N/A where company policy permits).
- Final state requires PM review. PM review is tentative organizational model; keep roles easy to adjust.

## Single-user acceptance mode

- I will initially be the **only tester**, and must be able to test both **Installer** and **Project Manager** from one Telegram account.
- Server has `BOOTSTRAP_ADMIN_TELEGRAM_ID`: ONLY this numeric Telegram account may bootstrap as admin; `/start` on bot returns a user ID. The Profile UI includes two viewing modes (PM / Installer) exclusively for admin. Never implement frontend-controlled server privilege escalation.
- Make fake test project, upload real photos/videos from iPhone/Android, check every stage, daily report, issue, N/A request, PM approval and correction loop. Do not simulate successful uploads in production.
- All other accounts are **invitation-only**, and cannot access project data without project membership. PM may invite installers by Telegram ID and assign them to projects.

## Repo audit BEFORE deployment

1. Unzip and inspect `README.md`, `CODEX_DEPLOY_PROMPT.md`, `server/`, `public/`, `supabase/migrations/`, `docs/`, `tests/`.
2. Run `npm test` and `npm run check` (Node 22+, no npm dependencies). Confirm no credentials appear anywhere in code, git history, configs or logs. Never commit `.env`.
3. Perform detailed code review for bugs in Telegram initData HMAC, `auth_date` and sessions, identity bootstrap, invite-only accounts, server-side RBAC, storage reads, secure streamed upload, MIME/size checks, URL paths, Supabase REST service-key authorization and schema consistency.
4. **Use the NEW Supabase secret API key on the `apikey` header — not as an `Authorization: Bearer` JWT.** Confirm against current official Supabase docs. Confirm Storage upload, signed reads, bucket storage limits, HEIC/HEIF/MOV behavior and RLS.
5. Check SQL migration ordering, FK, triggers, `storage.buckets` creation, all PostgREST select/insert/update responses; simulate schema from scratch. Fix any defects before applying migration. Ensure project creation is atomic or rolls back partial inserts on failures.
6. Test files in a real browser at widths **375 / 390 / 430 / 768 / 1280 px**, including Telegram iOS and Android WebViews if available. Confirm no layout overflow, buttons accessible, color contrast readable, photo grid usable, modal forms scroll properly and bottom nav avoids native safe-area. Fix CSS/UX defects while preserving the reference style.
7. Test all frontend interactions (including modals, file category dropdown, camera/gallery, errors/retry, project creation, assignment, daily checks, exceptions, printed report) against actual API. Correct bugs; do not leave inert controls or inaccurate success indicators.
8. For any uncertain API/requirement do not invent results; test it, read official documentation or ask a targeted question.

## Supabase only in the verified corporate project

1. Verify target Supabase project name AND project-ref URL match.
2. Apply `supabase/migrations/001_fieldops.sql` once (or create tracked Supabase CLI migration if necessary) to the empty dedicated corporate project. Confirm all tables and RLS are present; confirm bucket `fieldops-media` is **private**.
3. Set up production database schema, check new project creation, stage creation, media insert, daily reports and audit log triggers through real API.
4. Validate storage uploads & signed downloads end to end using a test file. Files must be attached to correct project/stage/day/issue. Check that a different Telegram account cannot obtain media belonging to another project.
5. Do not disable RLS or expose any server-only key to the browser.

## GitHub only in the verified corporate repo

1. Inspect remote branch/history. If empty, initialize appropriate default branch and commit all source **EXCEPT** `.env`, tokens and document `Fields`.
2. Do not force-push or overwrite others' work without approval.
3. Commit organized, clear changes. Confirm GitHub tree shows source and SQL migration. Supply commit SHA and repository URL.

## Railway only in corporate workspace

1. Create/choose corporate project `wallpanels-fieldops`, link only `Wallpanels-com/wallpanels-fieldops`.
2. Use Node 22+; `npm start`; **one replica** while bot uses Telegram long polling; healthcheck `/api/health`. Generate HTTPS domain.
3. Set Variables from freshly ROTATED values: `NODE_ENV=production`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET` (generate random >=40 characters), `BOOTSTRAP_ADMIN_TELEGRAM_ID` (my numeric ID), `APP_BASE_URL` (generated `https://...up.railway.app`). Railway provides `PORT` automatically.
4. Check connection to Telegram and Supabase, logs free of secrets, and `/api/health` returns healthy.
5. Make the Telegram bot menu button open the live HTTPS Mini App and `/start` respond with my numeric ID. Test embedded Telegram WebApp `initData` authorization and session refresh behavior.
6. If Railway integration is not connected or corporate workspace ambiguous, **ask me to connect/confirm it** instead of using another account. Never use my personal resources as fallback.

## Mandatory real smoke tests (use only safe test projects and test images)

- Unauthorized browser `GET /api/projects` => 401. Telegram access denied for non-invited ID.
- My verified Telegram ID logs in as admin, with PM / Installer view switch in Profile; both modes actually usable.
- As PM: create a project, invite/assign worker, see statuses, review issues, approve N/A if policy permits, return report for fixes, approve a full report.
- As Installer: list assigned projects, take photos in iPhone camera and choose 2/5/10 gallery files, upload BEFORE photos, company flags, floors/walls/furniture, before VIDEO, protection photos, progress, after installation and AFTER VIDEO, before/after cleanup, detail/quality photos.
- Photo originals appear with previews after successful storage confirmation. If upload fails, no false success; user can retry.
- New daily report records day-specific photo and safety checklist. Report submitted then PM approved/returned.
- An issue of type `damage` is reported with evidence photo; PM resolves, keeping history. Client requested changes cannot automatically authorize new work.
- Project cannot submit when any **mandatory** evidence, required checklist, daily report, unresolved issue, or client sign-off/refusal is absent.
- N/A request requires a reason and PM approval. Confirm whether company policy forbids exceptions for strict before/after videos; if so disable such exceptions and note decision.
- Client signed paper form uploaded as photo OR documented refusal with a reason. Final submission goes through PM approval. Complete project becomes immutable for installer edits.
- Validate that an installer cannot impersonate a PM via frontend JS, pass another project's stage ID, obtain an unauthorized image or modify another project via API.
- Verify print/save-as-PDF includes stage media and checks and notes the presence of videos.

## Final report to me

Produce concise Russian report containing: GitHub commit + link, corporate Supabase project ref (not secrets), Railway public URL, Telegram bot username, confirmation of setup and which tests passed/failed, any limitations/known issues, what I must do to open the app on my phone and test as both roles. **Do not claim a test passed if it was not executed.** Never disclose tokens, passwords or full environment variables.

If any blocker is encountered, do all safely possible independent work first, then ask only for the missing authorization/rotation/ID. Do not alter unrelated systems.
