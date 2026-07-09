# How to test Decoder

A plain walk-through to confirm everything works end to end. Your live site is:
**https://aidecoder.app**

Work top to bottom. Each check says what you should see. If something's off, the "If it's wrong" note tells you the likely cause.

---

## Part A — The website, signed out (works even before sign-in is set up)

1. **It loads.** Open the site. You should see the "Understand any AI term in seconds" heading and a grid of term cards.
2. **Search.** Press **⌘K** (or click "Search a term…"). A search box opens. Type `rag` — it filters to the RAG card. Press **Return** to open it. Press **Esc** to close.
3. **A card.** Click any card. A panel opens with a plain explanation, an analogy, and an example.
4. **Go deeper.** In that panel, click **Go deeper**. The technical text should slide open smoothly, and **Hide details** slides it closed.
5. **Plain / In practice / Technical.** Click those three buttons — the one-line explanation should swap between them.
6. **Dark mode.** Click the ☾ moon (top right). The whole page flips to dark; click again to go back.
7. **Saving asks you to sign in.** Click **Sign in to save** (or the Save button). A "Sign in with Google" prompt should pop up instead of saving. Close it.
8. **Cheatsheet tab.** Click **My cheatsheet** (top). Signed out, it should show a "Sign in to start your cheatsheet" panel.
9. **Phone check.** Open the same URL on your phone. The header should collapse neatly (search becomes a small icon), and cards stack in one column.

*If it's wrong:* if the page looks like an older version (no "Sign in" buttons anywhere), your last deploy didn't include the latest code — push again from GitHub Desktop and wait for Vercel to rebuild.

## Part B — Signing in (needs Supabase + Google steps 1–6 finished)

> If you haven't finished the Supabase/Google setup yet, the "Sign in with Google" button will show a small "not connected yet" message. That's expected — do Steps 1–6 in `SETUP.md` first, then come back.

1. **Sign in.** Click **Sign in with Google**, pick your account. You should be sent to Google, then bounced back to the site, now **signed in** — your email/initial shows in the top-right.
2. **Save a term.** Open any card and click **Save to my cheatsheet**. You should see a small "Saved to my cheatsheet" confirmation.
3. **It's in your cheatsheet.** Click **My cheatsheet** — the term you saved is there.
4. **It sticks.** Reload the page. You're still signed in and the saved term is still there.
5. **Remove.** In the cheatsheet, click the **×** on a term — it disappears, and the little count on the tab drops.
6. **Cross-device.** On your phone, open the site and sign in with the **same Google account**. Your saved terms should already be there — that's the sync working.
7. **Sign out.** Click your email → **Sign out**. The cheatsheet goes back to the "sign in" panel.

*If it's wrong:*
- Sign-in fails with **`redirect_uri_mismatch`** → the redirect address in Google is missing the `/auth/v1/callback` ending (SETUP Step 5, Box 2).
- Clicking sign-in does nothing / "not connected" → your two Supabase keys aren't in `web/index.html`, or you didn't redeploy after adding them (SETUP Steps 2–4).
- Signs in but saving doesn't stick → the database table wasn't created (SETUP Step 1.3), or the Site URL/Redirect URLs aren't set (Step 6.3).

## Part C — The browser extension

1. **Load it.** In Chrome go to `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**, and choose the `extension` folder. The Decoder "d" icon appears in your toolbar.
2. **Opt in.** Click the Decoder icon and press **Enable on all sites**; approve Chrome's prompt. (This is the one-time permission grant — before it, nothing highlights, which is by design.)
3. **It highlights.** Open a news or blog article about AI. Known terms (RAG, agents, hallucination, etc.) get a faint dotted underline. (If you opened the article before opting in, reload it.)
4. **Click to explain.** Click an underlined term — a small card appears right there with the explanation.
5. **Sign in (needed to save).** Click the Decoder icon → **Sign in with Google**, pick your account. (Requires the Step 8b setup: keys in `config.js` + the extension's redirect URL added to Supabase.) Before signing in, a term's card says "Sign in from the Decoder toolbar to save."
6. **Save.** With a term's card open, click **＋ Save to my cheatsheet** — it changes to "Saved · remove."
7. **Sync check (the whole point).** Open the web app, sign in with the **same** Google account, and open **My cheatsheet** — the term you saved in the extension is there. Save one on the website; it appears in the extension popup. One shared cheatsheet.
8. **The popup.** Click the Decoder icon — it shows your account, your saved terms, and "Highlighting is on for every site."
9. **Turn off.** In the popup, click **Turn off**. Reload the article — no underlines. Re-enable to bring them back.

*If it's wrong:*
- Nothing underlines on a page that was already open → reload it. Some pages (browser settings, the Web Store, blank tabs) are off-limits to extensions by design.
- Sign-in fails or the popup shows a red error → check `config.js` has the keys, and that `https://<extension-id>.chromiumapp.org/` is in Supabase's Redirect URLs (Step 8b). The extension ID is on its `chrome://extensions` card.
- Signed in but a saved term doesn't appear in the web app → confirm both are the **same** Supabase project and the **same** Google account.

## Part D — Privacy page
- Open **https://aidecoder.app/privacy** — it should show the policy with your email (sumitd0704@gmail.com) at the bottom.

---

**For fine-grained UI checks** (every animation, empty state, keyboard shortcut), there's a more detailed list in `02-prototype/QA-checklist.md`. This file is the quick end-to-end pass.
