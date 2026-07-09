# Privacy Policy — Decoder (Chrome extension)

> **Note:** the *published* privacy policy that goes live with your website is `web/privacy.html` (it covers both the website and the extension). Edit your contact email there. This markdown file is just a plain-text reference copy.

_Last updated: 8 July 2026_

Decoder is a browser extension that underlines known AI/technical terms on web pages and shows a plain-language explanation when you click one, with the option to save terms to a personal list.

## What the extension does with data

- **Access is opt-in.** The extension has no access to any page until you turn it on (a one-time permission granted from its popup), and you can turn it off at any time.
- **Page text is read locally, never collected.** Once enabled, to find and underline terms the extension looks at the visible text of the page you're on, in your browser. This happens entirely on your device. Page content is **not** stored, logged, sent to us, or shared with anyone.
- **Saving is optional and uses the same account as the web app.** If you sign in with Google inside the extension, the terms you save are stored in your account (via Supabase) so they appear in the Decoder web app and sync across devices. If you don't sign in, you can't save from the extension and nothing is sent anywhere.

## Data we collect

- **Only if you sign in:** your **email address** (to identify your account) and the **identifiers of the terms you save** (e.g. `rag`). These are stored in our Supabase project so your saved terms sync across the extension and the web app.
- **If you don't sign in:** nothing is collected or transmitted.
- We never sell or share your data, and we run no ads, analytics, or tracking.

## Permissions and why they're needed

- **storage** — to hold your sign-in session on the device.
- **scripting** — to add the highlighter to a page after you enable it.
- **identity** — to let you sign in with Google (only used for sign-in).
- **Access to your Supabase backend (`https://*.supabase.co`)** — to read and save your saved terms to your account.
- **Access to pages you visit — optional** — granted only when you click "Enable on all sites," so it can read page text locally to underline terms.

## Changes

If this policy changes, the "Last updated" date above will change and the new version will be posted at this URL.

## Contact

Questions about this policy: **[add your contact email here]**
