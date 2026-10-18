# Postmortem — Extension Stopped Highlighting and Decoding (2026-09-15)

**Status:** Fixed in code (v1.1.1), not yet shipped. Store upload and a real-Chrome pass are pending.
**Severity:** Extension-only. The web app, `/api/explain` and Supabase stayed up the whole time.

## Summary

Users reported that Decoder stopped underlining AI terms and stopped offering Decode on highlighted sentences. Both features load through one content script, so the likely failure is that the script was not running in the tabs people were using. The backend was never involved: when the complaints came in, aidecoder.app returned 200, `/api/explain` returned a correct decode in 2.3s, and Supabase answered.

The code had not changed since Aug 27. Chrome's handling of the extension had. The store began serving v1.1.0, which reached users as an automatic update, and Chrome reloads extensions on its own schedule. The extension could not recover from either on its own.

On Sumit's machine it recovered without intervention at 17:07–17:10 IST, when Chrome reopened the whole profile and every extension restarted. After that, 105 terms were underlined on the Wikipedia RAG article.

## Timeline (IST)

| When | What |
|---|---|
| Aug 27 | v1.1.0 committed and packaged. It adds Decode, so the content script goes from 2 files to 4. |
| by Sep 3 | Store serves v1.1.0. Sumit's Chrome (Profile 4) installs it fresh at 22:06. |
| Sep 9 | Chrome updates itself to 152.0.7977.83 (08:29) and relaunches (12:33). |
| Sep 15, afternoon | User complaints. On Sumit's machine: no underlines, no Decode pill. |
| 17:07:36, 17:10:18 | Every extension in Profile 4 reopens its storage, meaning the profile restarted. Decoder works again afterwards. |
| 17:13 | Confirmed working in Sumit's Chrome: 105 terms underlined. |

Sources: Chrome's own profile files (`Secure Preferences` install/update times, LevelDB `LOG` open times per extension, the stored dynamic-script registration), the store page, and live probes of the site, API and Supabase.

## Root Cause

The content script is registered dynamically, because the all-sites permission is optional and granted from the popup. That registration's lifecycle had four gaps.

1. **Nothing repaired a missing registration.** Chrome clears dynamic content scripts on every extension update. `sync()` put the registration back only on install/update, browser startup, or a permission change. Anything that left it missing outside those events stayed broken until the next browser restart.
2. **Open tabs were never covered.** A registered script only reaches pages loaded after it is registered. Every tab open during an install, a store auto-update, or an opt-in got nothing until the reader reloaded it; the popup injected only into the active tab. After the 1.0.4 → 1.1.0 auto-update, the old copy in each open tab kept running with a dead extension context. Clicks, saves and Decode failed there, and the Decode pill never appeared because `explain.js` was never loaded into those tabs.
3. **A stale registration was trusted.** `sync()` checked that a registration existed without checking its contents. A registration left by 1.0.4 (no `explain.js`) would have been kept indefinitely.
4. **Every failure was silent.** Registration and injection errors were caught and discarded, and there is no telemetry, so user complaints were the first signal.

**What is not confirmed:** the specific trigger on Sumit's machine before 17:07. Chrome does not keep extension errors on disk, and the registration stored on disk was correct (all 4 files) the whole time. So the likely failure is on the runtime side, in the loaded profile or in tabs opened before the most recent reload. The failure modes above can each produce exactly the reported symptoms, and a profile restart clears all of them. That fits "broken, then fixed itself." Live users' machines cannot be inspected from here.

## Fix — v1.1.1

`decoder-extension-v1.1.1.zip`, repo root. No new permissions, so no store permission warning.

- **Self-healing registration** (`extension/background.js`). `sync()` runs on every service-worker start. The worker wakes for any event or message, so a missing registration comes back the next time Decoder is used instead of at the next browser restart. It compares the registered file list against the current build and replaces a stale one. Calls are serialised so the wake-up call and `onInstalled` cannot collide on the script id.
- **Open tabs light up without a reload** (`injectOpenTabs()`). On install, update and permission grant, the scripts are injected into every open web tab. Discarded tabs, non-web pages, and tabs still holding a pre-1.1.1 copy are skipped; injecting beside that last kind would show two popovers per click, so those tabs recover on their next reload.
- **Orphaned copies step aside** (`extension/content.js`, `extension/explain.js`). Only a copy with a live extension context counts as loaded. A new copy fires a `decoder:retire` DOM event, and any dead copy removes its underlines, observer and listeners. A `data-decoder` attribute marks copies that can retire, which is what the worker checks before injecting.

Because 1.1.1 is itself an update, shipping it applies the fix to every open tab on the users' machines the moment it lands.

## Verification

- **Tests:** 99/99 pass. There are 7 new tests in `tests/background-sync.test.js`, which runs the real worker file with `chrome.*` stubbed. They cover: re-registration on worker start with no event, a 1.0.4 registration replaced, an up-to-date one left alone, no id collision, unregistering without the grant, open-tab injection with its skip rules, and opt-in covering every tab.
- **Browser (1b harness):**
  - Re-injecting beside a live copy changes nothing (12 underlines, none nested).
  - Orphaning the running copy and injecting a new build leaves 12 underlines, 0 nested, exactly 1 popover per term click, exactly 1 Decode pill, and 0 console errors.
- **Not verified:** Chrome's own side of this. That covers clearing scripts on update, an orphan's `runtime.id` reading undefined, and `tabs.query` URL filtering under the all-sites grant with no `tabs` permission. It needs a real-Chrome unpacked pass (below).

## Action Items

| # | Action | Owner |
|---|---|---|
| 1 | Real-Chrome pass: load 1.1.0 unpacked, grant all sites, open 3 article tabs, swap in 1.1.1 and reload the extension. All 3 tabs should underline without a page reload, with one popover per click and a Decode pill on selection. | Sumit |
| 2 | Upload `decoder-extension-v1.1.1.zip` to the Chrome Web Store. | Sumit |
| 3 | Reply to affected users: reloading the tab or restarting Chrome restores it today, and the next update prevents a repeat. | Sumit |
| 4 | Add a failure signal: record registration/injection errors in `chrome.storage` and show a "Decoder isn't running on pages — Repair" row in the popup that calls `sync()`. This turns the next silent failure into a visible one. | Next session |
| 5 | Treat every store publish as a production change: after a version goes live, run an update-path check (old version installed, tabs open, update applied). | Process |
