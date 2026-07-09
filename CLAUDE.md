# Decoder

Before doing anything, read `PROJECT-STATE.md` (compact snapshot) — don't re-scan every file.

Quick rules:
- **The extension is under review. Never make changes that affect the extension** — do not edit anything in `extension/` (incl. `extension/concepts.js`) or change its behavior. This is a standing, universal rule until the user says otherwise. Web + Supabase work is fine.
- The saved collection is called **"saved terms"**, never "cheatsheet".
- Tone: simple, direct, minimal formatting; avoid AI-slop phrasing.
- No browser/Supabase in this environment — verify code with `node --check` and static checks; visual/OAuth testing is the user's job.
- Live app: https://aidecoder.app · Supabase project `ivyfvwnxjkqyicbjzqoz`.
