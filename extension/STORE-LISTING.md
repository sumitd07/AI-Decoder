# Chrome Web Store submission kit

Everything needed to submit Decoder, organized by the tabs you'll see in the [Web Store developer dashboard](https://chrome.google.com/webstore/devconsole). Asset sizes verified against Chrome's current [image](https://developer.chrome.com/docs/webstore/images) and [listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) requirements (July 2026).

---

## 0. Before you start
- A Chrome Web Store **developer account** (one-time **$5** fee).
- **A verified publisher contact email — required, or nothing can be published.** On the dashboard's **Account** page (left sidebar, person/gear icon): enter your **Contact email**, Save, then click **Verify** — Google emails you a link; open it and click. Refresh the dashboard afterward. (This is an account-level step, separate from your extension. The email may show publicly as the publisher contact.)
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
  > • One click to understand a term
  > • Optional sign-in saves terms to your account and syncs them with the Decoder web app
  > • No ads, no tracking — page text is read on your device to find terms

- **Homepage URL** (optional): `https://aidecoder.app`
- **Support URL** (optional): a contact page, or your GitHub repo's Issues page.

## 3. Privacy tab (this is where extensions usually get held up — fill every field)

- **Single purpose** (one sentence):
  `Decoder underlines known AI/technical terms on the page you're reading and shows a plain-language explanation when you click one, with an option to sign in and save terms to your cheatsheet.`

- **Permission justifications** — the manifest now declares four items to justify (the "all sites" access is still *optional* and won't appear here):
  - **storage:** `Holds the user's sign-in session on the device so they stay logged in between visits.`
  - **scripting:** `Injects the highlighter into a page after the user turns Decoder on, and registers it to run on pages they visit once they've opted in.`
  - **identity:** `Used only to let the user sign in with Google (via the browser identity API) so their saved cheatsheet syncs with their account. No Google profile data beyond sign-in is accessed.`
  - **host access to `https://*.supabase.co/*`:** `The extension reads and writes the user's saved cheatsheet to their Supabase account. This is a single specific backend domain, not broad web access.`

- **Are you using remote code?** **No.** All code ships inside the package; the extension loads no external scripts and uses the system font. (It makes data requests to the Supabase backend, but does not load or run remote code.)

- **Data collected — this changed now that saving syncs to an account.** Core highlighting collects nothing. **If the user signs in to sync their cheatsheet**, disclose in the Data-collection form:
  - ✅ **Personally identifiable information** — the user's **email address** (to create/identify their account).
  - ✅ **User activity** — the list of term IDs the user chooses to save.
  - Purpose: **App functionality** (account + sync). Not for ads, analytics, personalization, or resale.
- Then check the three certifications (all true for Decoder):
  - ✅ I do not sell or transfer user data to third parties (outside approved use cases)
  - ✅ I do not use or transfer user data for purposes unrelated to my item's single purpose
  - ✅ I do not use or transfer user data to determine creditworthiness or for lending

- **Privacy policy URL — required.** Already handled for you: the policy is a page built into your website (`web/privacy.html`), so it goes live automatically when you deploy the site in Step 4 of `SETUP.md`. Its address is your live site URL followed by `/privacy` (Vercel/Netlify strip the `.html`), for example:
  `https://aidecoder.app/privacy`
  Paste that into this field. Two small things first: open the page once to confirm it loads, and edit `web/privacy.html` to add your contact email (near the bottom), then re-deploy.

## 3b. Test instructions tab (notes for the Google reviewer)

This tab has three inputs: **Username**, **Password**, and **Additional instructions** (max 500 characters). The **core feature needs no login**, so:

- **Username / Password:** leave both **blank**.
- **Additional instructions:** paste the text below (it fits the 500-char limit). **Important:** highlighting is opt-in, so the reviewer must click "Enable on all sites" in the popup first — otherwise they'll see nothing and may reject it as non-functional.

```
No login needed to review the core feature.
1) Open the Decoder toolbar popup and click "Enable on all sites", approve the Chrome prompt.
2) Open a page about AI, e.g. https://en.wikipedia.org/wiki/Large_language_model — known AI terms get a dotted underline.
3) Click a term to see the in-page explanation.
Saving is OPTIONAL and requires signing in with Google (it syncs the cheatsheet to the user's account) — not needed to evaluate highlighting. Page text is read locally; only signed-in saves are sent to the account backend.
```

## 4. Distribution
- **Visibility:** Public (or Unlisted while you test).
- **Regions:** All, unless you want to limit.
- Save the draft, then **Submit for review**. First reviews typically take a few days.

---

## Note on permissions (why there's no broad-permission warning)

Decoder does **not** request access to all sites at install time. Instead, "all sites" is an **optional** permission that the user grants at runtime by clicking **Enable on all sites** in the popup. Because the broad permission isn't in the required manifest, the Web Store shouldn't show the "Broad Host Permissions / in-depth review" warning at submission. After the user opts in, the extension auto-underlines terms on the pages they read, just like an always-on extension would — the difference is the user chose it explicitly. (This is the same pattern Chrome recommends for extensions that could otherwise trigger the broad-permission review.)
