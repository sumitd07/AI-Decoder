# Privacy Policy — Decoder (Chrome extension)

> **Note:** the *published* privacy policy that goes live with your website is `web/privacy.html` (it covers both the website and the extension). Edit your contact email there. This markdown file is just a plain-text reference copy.

_Last updated: 21 August 2026_

Decoder is a browser extension that underlines known AI/technical terms on web pages and shows a plain-language explanation when you click one, with the option to save terms to a personal list. It can also explain a whole sentence you highlight, in plain English.

## What the extension does with data

- **Access is opt-in.** The extension has no access to any page until you turn it on (a one-time permission granted from its popup), and you can turn it off at any time.
- **Page text is read locally, never collected.** Once enabled, to find and underline terms the extension looks at the visible text of the page you're on, in your browser. This happens entirely on your device. Page content is **not** stored, logged, sent to us, or shared with anyone.
- **Decoding a sentence sends that sentence, and only when you ask.** If you highlight a sentence and click Decode, that one sentence is sent to `aidecoder.app` and on to Google's Gemini API to be explained. Highlighting alone sends nothing — the request happens on the click. The page address, your account and the rest of the page stay on your device, and the sentence is not stored. Both surfaces have their own switch in the popup, so the highlighter can run with decoding off.
- **Saving is optional and uses the same account as the web app.** If you sign in with Google inside the extension, the terms you save are stored in your account (via Supabase) so they appear in the Decoder web app and sync across devices. If you don't sign in, you can't save from the extension and nothing is sent anywhere.

## Data we collect

- **Only if you sign in:** your **email address** (to identify your account) and the **identifiers of the terms you save** (e.g. `rag`). These are stored in our Supabase project so your saved terms sync across the extension and the web app.
- **If you decode a sentence:** the sentence itself, sent to Google's Gemini API to be explained and not retained by us. No account or page identifier travels with it.
- **If you don't sign in and don't decode:** nothing is collected or transmitted.
- We never sell or share your data, and we run no ads, analytics, or tracking.

## Permissions and why they're needed

- **storage** — to hold your sign-in session on the device.
- **scripting** — to add the highlighter to a page after you enable it.
- **identity** — to let you sign in with Google (only used for sign-in).
- **Access to your Supabase backend (`https://*.supabase.co`)** — to read and save your saved terms to your account.
- **Access to pages you visit — optional** — granted only when you click "Enable on all sites," so it can read page text locally to underline terms and reach `aidecoder.app` for a sentence you decode.

## Google API Services

Decoder's use of information received from Google APIs will adhere to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use), including the Limited Use requirements.

## Changes

If this policy changes, the "Last updated" date above will change and the new version will be posted at this URL.

## Contact

Questions about this policy: **sumitd0704@gmail.com**
