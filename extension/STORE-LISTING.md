# Chrome Web Store — listing draft

Copy/paste starting points for the store submission. Tighten to taste.

**Name:** Decoder — AI terms, explained in place

**Summary (132 char max):**
Underlines AI jargon on any page. Click a term to understand it in seconds and save it to your cheatsheet.

**Category:** Productivity

**Description:**
Reading about AI and a term slides by that you're not quite sure about? Decoder quietly underlines AI jargon on any web page. Click one and get a plain explanation, an analogy, and a real example — right where you're reading, without leaving the page.

Save the ones you stumble on to your own cheatsheet, so the terms that trip you up become a short list you can skim before a meeting.

- Plain-language explanations, not textbook definitions
- Works on any page; underlines are subtle and easy to ignore
- One click to understand a term, one click to save it
- A cheatsheet that builds itself from what you actually read
- No account needed; your saves stay in your browser

**Permissions justification (for review):**
- `storage` — to save your cheatsheet locally in the browser. No data leaves your device; there is no remote server.
- Host access (`<all_urls>`) — the extension reads visible page text to find and underline known AI terms. It does not collect, transmit, or store page content.

**Privacy:** No personal data is collected or transmitted. Saves are stored locally via `chrome.storage`.

## Before submitting
- Add icons: 16×16, 48×48, 128×128 PNGs, referenced via an `icons` block in `manifest.json` and `action.default_icon`.
- Add 1–2 screenshots (1280×800) showing an underlined term and the popover.
- Zip the folder: `cd extension && zip -r ../decoder-extension.zip . && cd ..`
