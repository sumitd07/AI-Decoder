# Chrome Web Store submission kit

Everything needed to submit Decoder, organized by the tabs you'll see in the [Web Store developer dashboard](https://chrome.google.com/webstore/devconsole). Asset sizes verified against Chrome's current [image](https://developer.chrome.com/docs/webstore/images) and [listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) requirements (July 2026).

---

## 0. Before you start
- A Chrome Web Store **developer account** (one-time **$5** fee) with a **verified contact email** (set it under Account → verify email, or the item can't be published).
- The extension **zip**: in Finder, right-click the `extension` folder → **Compress "extension"** → `extension.zip`. (It already includes the icons.)

## 1. Graphic assets

**Already generated for you** (in the `store-assets/` folder, and icons inside `extension/icons/`):

| Asset | Size | File | Where it goes |
|---|---|---|---|
| Toolbar/store icon | 16, 32, 48, 128 px | `extension/icons/*.png` | In the zip (already wired into `manifest.json`) |
| Store icon | 128×128 | `store-assets/store-icon-128.png` | Dashboard → same as the 128 above; upload if asked |
| Small promo tile | 440×280 | `store-assets/small-promo-440x280.png` | Store listing → **Small promo tile** |
| Marquee promo tile | 1400×560 | `store-assets/marquee-1400x560.png` | Store listing → **Marquee** (optional) |

**You still need to provide** (I can't capture these — they must be real pictures of the extension running):

- **Screenshots — required, at least 1, up to 5, each 1280×800 px** (PNG or JPEG). Take them like this:
  1. Load the unpacked extension (see the extension `README.md`), open an article-heavy page, and let it underline some terms.
  2. Click a term so the explanation popover shows.
  3. Screenshot on Mac with **⌘ + Shift + 4**, then resize/crop to exactly **1280×800** (Preview → Tools → Adjust Size, or any editor).
  4. Good shots: (a) underlined terms in an article, (b) the click-to-explain popover open, (c) the toolbar cheatsheet popup.

## 2. Store listing tab

- **Item name:** `Decoder — AI terms, explained in place`
- **Summary** (max 132 chars): `Underlines AI jargon on any page. Click a term for a plain-language explanation and save it to your cheatsheet.`
- **Category:** Productivity
- **Language:** English
- **Description:**

  > Reading about AI and a term slides by that you're not quite sure about? Decoder quietly underlines AI jargon on any web page. Click one and get a plain explanation, an analogy, and a real example — right where you're reading, without leaving the page.
  >
  > Save the ones you stumble on to your own cheatsheet, so the terms that trip you up become a short list you can skim before a meeting.
  >
  > • Plain-language explanations, not textbook definitions
  > • Works on any page; the underlines are subtle and easy to ignore
  > • One click to understand a term, one click to save it
  > • Your saved terms stay on your device — no account, no tracking
  > • No data ever leaves your browser

- **Homepage URL** (optional): your website, if you have one.
- **Support URL** (optional): a contact page, or your GitHub repo's Issues page.

## 3. Privacy tab (this is where extensions usually get held up — fill every field)

- **Single purpose** (one sentence):
  `Decoder underlines known AI/technical terms on the page you're reading and shows a plain-language explanation when you click one, with an option to save terms to a personal on-device list.`

- **Permission justifications** — one per permission in the manifest:
  - **storage:** `Stores the user's saved cheatsheet (short term identifiers they chose to save) locally in the browser so it persists between visits. Nothing is transmitted.`
  - **Host permissions (access to all sites):** `The extension reads the visible text of the page the user is reading to detect and underline known AI terms. Because people read about AI on any website, it needs to run on the pages they visit. Page text is processed locally and is never collected or transmitted.`

- **Are you using remote code?** **No.** All code ships inside the package; the extension loads no external scripts and uses the system font.

- **Data usage / what you collect:** **Nothing leaves the device**, so you do not check any of the "data collected" categories. Then check the three certifications (all true for Decoder):
  - ✅ I do not sell or transfer user data to third parties (outside approved use cases)
  - ✅ I do not use or transfer user data for purposes unrelated to my item's single purpose
  - ✅ I do not use or transfer user data to determine creditworthiness or for lending

- **Privacy policy URL — required.** Already handled for you: the policy is a page built into your website (`web/privacy.html`), so it goes live automatically when you deploy the site in Step 4 of `SETUP.md`. Its address is your live site URL followed by `/privacy` (Vercel/Netlify strip the `.html`), for example:
  `https://decoder.vercel.app/privacy`
  Paste that into this field. Two small things first: open the page once to confirm it loads, and edit `web/privacy.html` to add your contact email (near the bottom), then re-deploy.

## 4. Distribution
- **Visibility:** Public (or Unlisted while you test).
- **Regions:** All, unless you want to limit.
- Save the draft, then **Submit for review**. First reviews typically take a few days.

---

## Heads-up on the broad permission (relevant to review)

Decoder requests access to **all sites** so it can underline terms automatically as you read. Broad host access gets extra reviewer scrutiny, so the single-purpose and justification text above is written to be clear and honest. If a reviewer pushes back, the alternative is to switch to an **`activeTab`**-based model (the extension only reads a page when you click the toolbar button) — that narrows the permission but changes the experience from "automatic" to "on demand." Ask me and I can make that change.
