# Chrome Web Store submission kit — v1.1.0

Everything needed to submit Decoder, organized by the tabs in the [Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).

**Live store version: 1.0.4. This package: 1.1.0.** The difference is Explain This 1b — highlight a
sentence, click Decode, get it in plain English. That one feature sends page-derived text off the
device, which is why this submission is not a routine re-upload: it changes what the Privacy tab
has to say and, under the policy that took effect **1 August 2026**, what the public description
has to say too.

Checked against Chrome's current [image](https://developer.chrome.com/docs/webstore/images),
[listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing),
[update](https://developer.chrome.com/docs/webstore/update) and
[program policy](https://developer.chrome.com/docs/webstore/program-policies) docs, plus the
[2026 policy updates](https://developer.chrome.com/blog/cws-policy-updates-2026) — August 2026.

---

## 0. What changed since the 1.0.4 listing — read this first

Four things, in the order they'll bite you.

**1. The description now has to mention decoding.** Under the Limited Use policy, an extension may
collect web browsing activity only "to the extent required for a user-facing feature described
prominently in the Product's Chrome Web Store page." Decoding a sentence is exactly that kind of
feature. The 1.0.4 description talks only about underlining terms, so shipping 1.1.0 against it
would put the product out of policy on its own store page. §2 has the rewritten copy.

**2. Existing users have to be told.** The Disclosure Requirements policy tightened on 1 August
2026: developers must now notify users when data handling changes *after* install. Everyone on
1.0.4 installed an extension that sent nothing off-device, and `FEATURE_DEFAULTS` in `popup.js`
turns Decode **on** for them at upgrade. Nothing transmits until they select text and click the
pill, which is a real defence — but the policy asks for the notice, not the defence. See §5.

**3. The Privacy tab gains one data type.** **Website content**, user-initiated, purpose App
functionality. §3.

**4. No permission changes.** The manifest is correct as it stands — details and the reasoning in
§6, along with one code bug worth fixing before you zip.

---

## 1. Versioning

- **Format:** one to four dot-separated integers, each 0–65535, no leading zeros, not all zero.
  `1.1.0` is valid.
- **Every upload must be numerically higher than the published version.** Comparison is
  left-to-right, missing places count as zero, so 1.1 and 1.1.0 are the same version — a package
  at 1.1.0 will be accepted over 1.0.4 and rejected over 1.1.
- **If review rejects this package**, fix and re-upload at 1.1.0; the rejected build was never
  published, so the number is still free. Only bump to 1.1.1 if 1.1.0 actually went live.
- **`version_name` is optional** and display-only. Decoder doesn't use it. Skip it.
- Bump `version` in `extension/manifest.json` and nowhere else — nothing in the code reads it.
- The zip must contain **every** file, changed or not. Re-compress the whole `extension/` folder;
  don't upload a diff.
- Listing metadata, privacy answers and distribution settings each trigger re-review on their own,
  so the description rewrite in §2 needs a submission even though it isn't code.
- Review is typically a few days and can run to a few weeks. Past three weeks, contact developer
  support. New permissions, big code changes and broad host access all slow it down — Decoder adds
  none of those this time, which is the main argument for keeping the manifest as-is.

## 2. Store listing tab

- **Item name:** `Decoder — AI Dictionary: AI Terms Explained`
  *(The title is the strongest ranking field. "AI dictionary" is the head keyword, "AI terms
  explained" is the phrase people type. 43 chars, under the ~45-char sweet spot. Unchanged from
  1.0.4 — decoding is a second feature, not a second product, and the name still earns its rank.)*

- **Summary** (max 132 chars) — **changed**:

  `Free AI dictionary. Click any AI term for a plain-English explanation, or highlight a sentence to decode it.`

  *(107 chars. The old summary described only the highlighter. Both features now appear.)*

- **Category:** Productivity
- **Language:** English

- **Description** — **changed. The second paragraph is the policy-relevant part; keep it above
  the fold and don't cut it.**

  > Decoder is an AI dictionary for your browser. It underlines AI jargon — RAG, MCP, embeddings, context window, hallucination and more — on any web page, and explains each term in plain English when you click it. You get a simple explanation, an analogy, and a real example, right where you're reading, without leaving the page.
  >
  > When a whole sentence is the problem, not a single word, highlight it and click Decode. That sentence is sent to our server and on to Google's Gemini API, which writes a plain-English explanation that appears in place. This only happens on your click — highlighting alone sends nothing, the rest of the page and the page address stay on your device, and you can switch decoding off in the popup and keep the highlighter.
  >
  > Save the terms you stumble on, so the ones that trip you up become a short list you can skim before a meeting. Signed-in saves sync with the Decoder web app.
  >
  > • Plain-language explanations, not textbook definitions
  > • Decode any sentence you highlight — one click, explained in place
  > • Each term shows its status — Core, Rising, Fading or Historical — so you know what's still worth learning
  > • Works on any page; the underlines are subtle and easy to ignore
  > • Separate switches for highlighting and decoding — run either one alone
  > • Optional sign-in saves terms to your account and syncs them with the Decoder web app
  > • No ads, no tracking — terms are matched on your device; the only thing that ever leaves it is a sentence you ask us to decode

- **Homepage URL:** `https://aidecoder.app/#how-it-works` — the live demo of both features. A
  reviewer or a visitor can try decoding without installing anything.
- **Support URL:** a contact page, or the repo's Issues page.

### Graphic assets

Already in `store-assets/`, unchanged and still correctly sized:

| Asset | Size | File | Where it goes |
|---|---|---|---|
| Toolbar/store icon | 16, 32, 48, 128 px | `extension/icons/*.png` | In the zip, already wired into `manifest.json` |
| Store icon | 128×128 | `store-assets/store-icon-128.png` | Dashboard, if asked |
| Small promo tile | 440×280 | `store-assets/small-promo-440x280.png` | Store listing → Small promo tile |
| Marquee promo tile | 1400×560 | `store-assets/marquee-1400x560.png` | Store listing → Marquee (optional) |

**Screenshots need re-shooting.** The three on the live listing show only the highlighter, which
now under-describes the product on the page where the description has to be complete. Required:
at least 1, up to 5, each exactly **1280×800** (PNG or JPEG).

Shoot these four, in this order — the decode shot should be second so it survives a truncated
carousel:

1. Underlined terms in a dense AI article.
2. **A decoded sentence — the answer panel open under a highlighted sentence.** New, and the one
   that matters.
3. The term popover open on a click.
4. The toolbar popup showing both switches.

Load the unpacked extension (see `README.md`), capture with ⌘⇧4, then resize to exactly 1280×800
in Preview → Tools → Adjust Size. `https://aidecoder.app/#how-it-works` will do in a pinch, but at
least one shot must be the real extension on a real page.

## 3. Privacy tab

This is the tab that changes, and the one that holds submissions up. Fill every field.

- **Single purpose** (one sentence):

  `Decoder explains AI and technical language on the page you're reading — it underlines known terms and shows a plain-language card when you click one, and explains a sentence you highlight and choose to decode.`

  *(Rewritten from 1.0.4. Both surfaces are one purpose — explaining language in place — which is
  what the Limited Use audit turns on: the sentence you decode is necessary to the disclosed
  purpose, not collected alongside it. Sign-in is a convenience on top and is described in the
  data section, not the purpose sentence, so it can't be read as a second purpose.)*

- **Permission justifications** — four entries. Optional host access doesn't appear on this form.

  - **storage:** `Holds the user's sign-in session and their two feature switches on the device, so both survive a browser restart.`
  - **scripting:** `Registers and injects the term highlighter and the sentence decoder into pages after the user turns Decoder on from the popup. Nothing is injected before that.`
  - **identity:** `Used only for optional Google sign-in via the browser identity API, so saved terms sync with the user's account. No Google profile data beyond sign-in is read.`
  - **host access to `https://*.supabase.co/*`:** `Reads and writes the user's saved terms to their account, and reads public glossary card content by ID. One specific backend domain, not broad web access.`

  If the form asks about `tabs`: it isn't requested. `popup.js` calls `chrome.tabs.query` only to
  get the active tab's `id` so the highlighter can start without a reload — that works without the
  permission, and the URL and title are never read. Say so if a reviewer raises it.

- **Remote code:** **No.** Every executable file ships in the package. The extension loads no
  external scripts and uses the system font stack. It makes data requests to its backend and
  fetches a JSON glossary refresh, but JSON is data, not code, and nothing fetched is evaluated.

- **Data collection — this is the material change from 1.0.4.** Tick:

  - ✅ **Website content** — *new for 1.1.0.* One sentence, only when the user highlights it and
    clicks Decode. Sent to `aidecoder.app` and on to Google's Gemini API, which writes the
    explanation. Not stored, not tied to an account, carries no page URL or identifier, not used
    for training. Highlighting alone sends nothing. Purpose: **App functionality**.
  - ✅ **Personally identifiable information** — the user's **email address**, only if they sign
    in, only to identify their account. Purpose: **App functionality**.
  - ✅ **User activity** — the IDs of terms the user chooses to save, only if signed in. Purpose:
    **App functionality**.

  Not for ads, analytics, personalization or resale. If the user neither signs in nor decodes,
  nothing is collected or transmitted.

- **Certifications** — all three still hold, tick all three:
  - ✅ I do not sell or transfer user data to third parties outside approved use cases
  - ✅ I do not use or transfer user data for purposes unrelated to my item's single purpose
  - ✅ I do not use or transfer user data to determine creditworthiness or for lending

- **Privacy policy URL:** `https://aidecoder.app/privacy`

  Three things to fix on that page before you paste the URL:

  1. **Add the Limited Use sentence.** Decoder uses `identity` for Google sign-in, so the policy
     must state, in the policy text itself: *"Decoder's use of information received from Google
     APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use
     requirements."* It isn't there yet. Reviewers grep for it.
  2. **Contact email — already done on the web page** (`sumitd0704@gmail.com`). Only the reference
     copy `extension/PRIVACY.md` still has the `[add your contact email here]` placeholder. Mirror it.
  3. **Confirm the page is live and current.** It already describes the extension's decode call
     correctly — that went out with the site. Open it once and check.

  `extension/PRIVACY.md` is a reference copy. `web/privacy.html` is what's published and what the
  reviewer reads. Fix 1 and 2 in both.

## 4. Test instructions tab

**Username / Password:** leave blank. The core features need no login.

**Additional instructions** (max 500 chars) — paste this. Highlighting is opt-in and decoding needs
a text selection, so a reviewer who is told neither will see an empty page and may reject it as
non-functional:

```
No login needed.
1) Open the Decoder popup, click "Enable on all sites", approve the prompt.
2) Open an AI page, e.g. en.wikipedia.org/wiki/Large_language_model — known terms get a dotted underline.
3) Click a term for the explanation.
4) Highlight a full sentence, then click the "Decode" button that appears — it is explained in place.
Each feature has its own switch in the popup. Saving is optional (Google sign-in). Terms match on-device; only a sentence you Decode leaves it.
```

*(481 characters. The 1.0.4 version of this block was 608 and would have been silently truncated at 500 — check the count if you edit it.)*

## 5. The upgrade notice — required before you submit

1.0.4 users installed something that sent nothing off-device. `FEATURE_DEFAULTS = { highlight:
true, decode: true }` turns Decode on for them the moment 1.1.0 lands. The 1 August 2026
Disclosure Requirements policy says data-handling changes have to be surfaced to users who already
have the extension, and the store description alone doesn't reach someone who isn't shopping.

The lighter of the two fixes, and the one that keeps the feature discoverable:

> `chrome.runtime.onInstalled` receives a `details.reason`, but the listener in `background.js`
> currently takes no argument and throws it away. Take it, and on `reason === "update"` set a
> `decoder.upgradeNotice` flag in storage; `popup.js` renders a
> dismissible strip above the switches — *"New in 1.1.0: highlight a sentence and click Decode to
> get it in plain English. That sentence is sent to aidecoder.app to be explained. Switch it off
> below any time."* — and clears the flag on dismiss.

The heavier alternative is defaulting `decode` to `false` for upgrades and `true` for fresh
installs. It's unambiguously compliant and it buries the feature. The notice is the better trade,
provided it actually ships in this package — if it doesn't, take the default change instead.

Either way the popup's existing opt-in copy already says a decoded sentence leaves the device, so
the in-UI disclosure for **new** installs is done.

## 6. Permissions — what stays, and one bug to fix first

**Nothing in the manifest needs to change.** The decoder posts to `https://aidecoder.app/api/explain`
from the service worker, and `aidecoder.app` is inside the same optional `<all_urls>` grant the
highlighter already needs. Promoting `https://aidecoder.app/*` to a required host would change the
install-time permission prompt and buy no capability the extension doesn't already have — and a
new required host is one of the signals that lengthens review. D34 stands.

The broad-permission position also stands: `<all_urls>` is **optional**, requested at runtime from
the popup, so the manifest carries no broad host permission and the submission shouldn't draw the
in-depth broad-host review. That is worth more now than it was in July — it's the difference
between a few days and a few weeks.

**One bug to fix before you zip.** `refreshConcepts()` in `background.js` fetches
`https://aidecoder.app/concepts.json` from `onInstalled` and `onStartup`, unconditionally. At that
point on a fresh profile no host grant exists, and `web/vercel.json` sets no
`Access-Control-Allow-Origin`, so the fetch fails and the catch swallows it — the glossary refresh
silently never runs until the user clicks "Enable on all sites". It isn't a policy problem, but it
is an undisclosed network call at install time on a build a reviewer is about to inspect. Gate it
the way `explainSentence` already gates itself:

```js
let granted = false;
try { granted = await chrome.permissions.contains({ origins: ["https://aidecoder.app/*"] }); } catch (e) {}
if (!granted) return;
```

and call `refreshConcepts()` from `chrome.permissions.onAdded` as well, so it runs the moment the
grant arrives. Do not fix this by adding a required host permission.

## 7. Distribution

- **Visibility:** Public.
- **Regions:** All.
- Save the draft, then **Submit for review**.
- Deferred publishing gives you 30 days after approval to publish manually; miss it and the
  submission reverts to draft.

---

## Submission order

The privacy policy live today is already correct about decoding, Gemini and the contact email —
verified against the live page. The one thing missing is the Limited Use sentence, and that is
something a reviewer checks on the URL you hand them. So:

1. Add the Limited Use sentence to `web/privacy.html`, mirror it plus the contact email into `extension/PRIVACY.md`, deploy.
2. Fix the `refreshConcepts()` gate in `background.js`.
3. Add the upgrade notice (§5).
4. Load unpacked, run the seven-step pass in `CHANGELOG-1B.md` CTA 2.
5. Re-shoot the four screenshots at 1280×800.
6. Compress `extension/` → upload as 1.1.0.
7. Update the Store listing tab (§2), the Privacy tab (§3) and the Test instructions tab (§4).
8. Submit.
