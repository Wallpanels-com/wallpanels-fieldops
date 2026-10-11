# Security rules

- Never commit `.env`, screenshots of credentials, `Fields.docx`, BotFather tokens, `sb_secret` or a database password.
- Telegram `initData` is cryptographically verified by the server; the frontend display mode never grants permissions.
- All projects and media are authorize-scoped per request; entire Supabase bucket is private.
- If any token or password is exposed, rotate and replace in Railway Variables immediately. Prior values should be treated as compromised.
- The bootstrap admin ID is a deployment secret; check numeric Telegram ID through a trusted channel.
- After production launch, restrict project management and invite users carefully; audit access, restore procedures, signed URL exposure and evidence retention policies.
- Never test with client-sensitive photos until access and media permissions are verified.
