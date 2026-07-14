# Decoder

Before doing anything, read `PROJECT-STATE.md` (compact snapshot) — don't re-scan every file.

Quick rules:
- The extension is approved and live on the Chrome Web Store — extension code can be edited freely. Remember: store versions only update after a re-zip + upload to the dashboard (user's job).
- The saved collection is called **"saved terms"**, never "cheatsheet".
- Tone: simple, direct, minimal formatting; avoid AI-slop phrasing.
- No browser/Supabase in this environment — verify code with `node --check` and static checks; visual/OAuth testing is the user's job.
- Live app: https://aidecoder.app · Supabase project `ivyfvwnxjkqyicbjzqoz`.
- After making changes, always end with a GitHub-ready summary: a one-line commit message + short bullet list of what changed (user commits via Git web app).
