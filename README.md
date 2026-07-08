# Decoder

A plain-language glossary for the language of AI. Look up any term in seconds, understand it with a real example, see whether it still matters — and save the ones you stumble on to your own cheatsheet.

Decoder is three things:

- **Web app** (`web/`) — a fast lookup tool with a ⌘K search, concept cards, an "explain it plainly / in practice / technically" toggle, and a personal cheatsheet. Optional Google sign-in syncs your cheatsheet across devices.
- **Browser extension** (`extension/`) — subtly underlines AI terms on any page; click one to understand it in place and save it.
- **The thinking** (`01-strategy/`) — the product doc behind it all.

## Quick start

**Web app:** open `web/index.html` in a browser. It works immediately in local-only mode (cheatsheet saved on-device). To turn on Google sign-in and cross-device sync, follow [`SETUP.md`](SETUP.md).

**Extension:** open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select the `extension/` folder. See [`extension/README.md`](extension/README.md).

## Structure

```
web/            Deployable web app (index.html) + hosting config
extension/      Chrome extension (Manifest V3)
supabase/       Database schema + row-level security for sign-in
01-strategy/    Product thinking doc
02-prototype/   Prototype snapshot + QA checklist
03-content/     (concept content — future)
04-design/      (mockups — future)
SETUP.md        Account setup: Supabase, Google OAuth, hosting, GitHub, Web Store
```

## Tech

No framework, no build step. The web app is a single self-contained HTML file (vanilla JS). Sign-in uses [Supabase](https://supabase.com) (Google OAuth + Postgres with row-level security). Hosting is static (Vercel or Netlify configs included).

## Status

Prototype / research preview. Concept data is bundled in-file; there's no live "currency" backend yet. See the roadmap notes in `SETUP.md`.

## License

MIT — see [`LICENSE`](LICENSE).
