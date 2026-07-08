# Setup & deploy — plain-language guide

This turns Decoder from files on your computer into a real website with Google sign-in. No developer background assumed — every click is spelled out, and where a technical word shows up, it's explained.

You'll create three free accounts along the way (Supabase, GitHub, Google Cloud) and one paid one only if you publish the browser extension ($5, optional). Do the steps top to bottom — each one uses something from the step before it.

**The path:** set up a database (Supabase) → paste two keys into the app → put the project on GitHub → publish it to the web → switch on "Sign in with Google" → connect Google to the database → test. The Chrome extension (Step 8) is separate and optional.

---

## How sign-in works in the app (so the steps make sense)

- **Looking up terms is free** — no account needed. Anyone can search and read.
- **Saving to a cheatsheet needs sign-in.** When a signed-out person taps *Save to my cheatsheet*, a "Sign in with Google" prompt appears.
- **Once signed in,** their saved terms are stored online and follow them to any device.
- Until you finish this guide, the app runs in **preview mode**: everything looks right, but the "Sign in with Google" button shows a little "not connected yet" message instead of actually signing in. That's expected — it starts working once you finish Step 6.

---

## Step 1 — Set up the database (Supabase)

**What this is:** Supabase is a free service that stores your data online and handles Google login for you, so you don't have to build a server.

1. Go to [supabase.com](https://supabase.com), click **Start your project**, and sign in (you can sign in with your GitHub or Google account).
2. Click **New project**. Give it a name (e.g. "decoder"), set a database password (save it somewhere), pick the closest region, and click **Create new project**. Wait a minute for it to finish setting up.
3. Set up the storage table. Open the SQL editor with this direct link: **`https://supabase.com/dashboard/project/_/sql/new`** — or just click **SQL Editor → New query** in the left sidebar (that always works). (The `_` in these links is a stand-in for your project code; if a link ever shows a 404, use the sidebar instead, or see the note in Step 6 about swapping in your project code.) Open the file `supabase/schema.sql` from this project in a text editor, copy everything in it, paste it into the big empty box in Supabase, and click **Run**. You should see "Success." (This creates the place your saved terms live, and switches on rules so each person can only see their own.)
4. Get your two keys. Click the green **Connect** button at the top of the Supabase dashboard — the pop-up shows your **Project URL** and a key. You need:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **Publishable key** — a long code starting with `sb_publishable_...` (if your project only offers older keys, the **anon** key works too; both are fine).
   - ⚠️ Do **not** use the **secret** key (`sb_secret_...`) or **service_role** key — those are private and must never go into the app.

   Copy both somewhere handy for Step 2.

## Step 2 — Paste your keys into the app

1. Open the file `web/index.html` (inside this project) in a text editor. Any works; a free one like [VS Code](https://code.visualstudio.com) is nicest, but Mac's built-in TextEdit is fine — if TextEdit opens it as a styled page, choose **Format → Make Plain Text** first.
2. Near the top you'll find this block. Paste your two values from Step 1 between the quote marks:

```js
window.DECODER_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_...."
};
```

3. Save the file. (These are safe to include — they're the public keys, protected by the rules you turned on in Step 1. Never paste the secret/service_role key here.)

## Step 3 — Put the project on GitHub

**What this does:** GitHub stores your code online. In the next step, the hosting service reads your project from GitHub to put it on the web. You do this once; after that, updates are one click.

You have a Mac, so I'd use **GitHub Desktop** — a normal app with buttons, no terminal needed.

### Option A — GitHub Desktop (recommended, no terminal)

1. Download **GitHub Desktop** from [desktop.github.com](https://desktop.github.com) and open it (it installs like any app).
2. When it opens, click **Sign in to GitHub.com**. No account yet? Click **Create your free account**, follow the prompts, then come back and sign in.
3. Top menu bar: **File → Add Local Repository…**
4. Click **Choose…** and select this folder: `Documents` → `Mitsu` → `AI Dictionary`, then click **Open**.
5. It'll say *"This directory does not appear to be a Git repository. Would you like to create a repository here instead?"* — click the **create a repository** link, then the **Create Repository** button (defaults are fine).
6. Click the big **Publish repository** button (top right). Name it `decoder`, leave **Keep this code private** checked (or uncheck to make it public), and click **Publish repository**.

Done — your code is on GitHub. (Changed a file later? GitHub Desktop shows it; type a short note in the "Summary" box, click **Commit to main**, then **Push origin**.)

### Option B — Terminal (only if you prefer commands)

1. Open the **Terminal** app: press **⌘ + Space**, type `Terminal`, press **Return**.
2. Create the empty repo online first: go to [github.com/new](https://github.com/new), name it `decoder`, **don't** check "Add a README," click **Create repository**, and leave the page open.
3. In Terminal, paste this (the quotes matter — the folder name has a space) and press Return:
   ```bash
   cd "/Users/shibbypills/Documents/Mitsu/AI Dictionary"
   ```
4. Paste these one block at a time, pressing Return after each. Replace `<your-username>` with your GitHub username:
   ```bash
   git init
   git add .
   git commit -m "Decoder: AI glossary, browser extension, and web app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/decoder.git
   git push -u origin main
   ```
5. The last command may open a browser to sign in to GitHub — approve it. If it says `git` isn't installed, macOS offers to install "command line developer tools" — click **Install**, wait, and re-run.

## Step 4 — Publish it to the web

This puts your app online and gives you its address (needed for Google sign-in). Pick one:

### Option A — Vercel (recommended; uses your GitHub from Step 3)

1. Go to [vercel.com/new](https://vercel.com/new) and sign in with your GitHub account.
2. Find your **decoder** repository in the list and click **Import**.
3. There's a setting called **Root Directory** — click **Edit** next to it and choose the **web** folder. (Your app lives in `web`, not at the top.) Leave everything else as-is.
4. Click **Deploy** and wait. When it's done, it shows your live address, like `https://decoder.vercel.app`. **Copy it** — you need it in Steps 5 and 6.

### Option B — Netlify Drop (fastest; skips GitHub entirely)

If GitHub felt like a hassle and you just want it live: go to [app.netlify.com/drop](https://app.netlify.com/drop), and drag your **web** folder onto the page. It uploads and gives you a live address to copy. (You can connect GitHub later for automatic updates.)

## Step 5 — Set up "Sign in with Google"

**What's happening here:** to offer Google sign-in, you register your app with Google once. Google asks you two questions — *which website is allowed to start a sign-in* (your app), and *where to send the person after they log in* (back to Supabase). You type the answers into a Google setup screen. It's fiddly but it's just filling in two boxes.

1. Open the **Google Auth Platform** and sign in: **`https://console.cloud.google.com/auth/overview`** . At the top of the page, pick a project or create a new one (any name).
2. If this is your first time, Google asks you to set up a consent screen: click **Get started**, enter an app name and your email, choose **External** for "Audience," add a contact email, and finish. Then, while it's still in "Testing" mode, open the **Audience** page — **`https://console.cloud.google.com/auth/audience`** — and under **Test users** add your own Google email (so Google lets you sign in during testing). (If Google asks for an app homepage or privacy-policy link, use your live site URL from Step 4 and that URL + `/privacy`.)
3. Open the **Clients** page — **`https://console.cloud.google.com/auth/clients`** — and click **Create client**. For "Application type" choose **Web application**, give it any name.
4. You'll see two boxes to fill in. Here's what each one means:

   **Box 1 — "Authorized JavaScript origins"** = *which website is allowed to start a Google sign-in.*
   Click **+ Add URI** and paste your live app address from Step 4, for example:
   `https://decoder.vercel.app`
   (Testing on your own computer too? Click **+ Add URI** again and add `http://localhost:3000`.)

   **Box 2 — "Authorized redirect URIs"** = *where Google sends the person back after they log in.*
   This is always your **Supabase** address (from Step 1) with `/auth/v1/callback` added on the end. For example, if your Supabase Project URL is `https://abcdefgh.supabase.co`, you'd paste:
   `https://abcdefgh.supabase.co/auth/v1/callback`
   - **Copy it exactly, the whole thing.** If you leave off the `/auth/v1/callback` part, sign-in later fails with an error reading `redirect_uri_mismatch` — that just means "the address didn't match."
   - Easiest way to avoid a typo: Supabase shows you this exact line on its Google settings page (Step 6), so you can copy it from there.

5. Click **Create**. A box pops up with two long codes — the **Client ID** and the **Client secret**. Keep it open (or copy both) for Step 6.

## Step 6 — Connect Google to Supabase

Now you hand Google's two codes to Supabase so they can talk. The links below use direct addresses so you don't have to hunt through menus.

> **About the `_` in these links:** it's a stand-in for your project's code. It only auto-fills when Supabase already knows which project you're in — in a fresh tab it can show a **404**. If that happens, replace the `_` with your own project code: it's the `abcdefgh` part of your Project URL from Step 1, and it's also visible in your browser's address bar whenever you're inside your project (`…/dashboard/project/`**`abcdefgh`**`/…`). Easiest trick: once you're on any Supabase page for your project, just edit the end of the address bar to the page you want.

1. Open the Google settings page:
   **`https://supabase.com/dashboard/project/_/auth/providers?provider=Google`** (replace `_` with your project code if it 404s)
   - Menu fallback: left sidebar **Authentication** (the lock/shield icon) → **Sign In / Providers** (older projects just say **Providers**) → find **Google** in the list.
2. Click **Google** to expand it, switch it **on**, and paste the **Client ID** and **Client secret** from Step 5 into their boxes. Click **Save**. (This same page shows the exact callback address from Step 5's Box 2 — a good spot to double-check you copied that correctly.)
3. Open the URL settings page:
   **`https://supabase.com/dashboard/project/_/auth/url-configuration`** (again, replace `_` with your project code if it 404s)
   - Menu fallback: left sidebar **Authentication** → **URL Configuration**.
   - Set **Site URL** to your live app address from Step 4 (e.g. `https://decoder.vercel.app`), and add that same address under **Redirect URLs**. Click **Save**. (Add `http://localhost:3000` too if you'll test on your computer.)

## Step 7 — Test it

Open your live address, click **Sign in with Google**, and pick your account. Then save a term and open **My cheatsheet** — it should be there. Reload the page; it should still be there. Open the same account on your phone to confirm it follows you across devices.

If sign-in fails with `redirect_uri_mismatch`, go back to Step 5 Box 2 and make sure the address ends in `/auth/v1/callback`.

## Step 8 — Publish the browser extension (optional, separate)

1. Zip the extension folder: in **Finder**, open your `AI Dictionary` folder, **right-click** the `extension` folder, and choose **Compress "extension"**. That makes `extension.zip`.
2. Go to the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) and register (a one-time $5 fee).
3. Click **Add new item**, upload the zip, and fill in the listing using the ready-made kit in `extension/STORE-LISTING.md` (all the text fields, permission justifications, and privacy answers are written out for you).
4. Icons are already made and bundled; promo tiles are in the `store-assets/` folder. The only thing you have to create yourself is **screenshots** (real pictures of the extension running) — `STORE-LISTING.md` explains exactly how.
5. **Privacy Policy field (required):** your policy is already built into your website as a page, so once you've deployed (Step 4) it's live at your site URL + `/privacy` — for example `https://decoder.vercel.app/privacy`. Paste that link into the store's Privacy Policy field. (Open it once to check it loads; to add your contact email, edit `web/privacy.html` near the bottom and re-deploy.) Then submit for review.

---

## Testing on your own computer first (optional)

Because sign-in bounces through Google, you need to open the app at a proper web address, not by double-clicking the file. The simplest local address is `http://localhost:3000`. Setting that up is a little technical (it needs a one-line terminal command), so skip it unless you want it — testing on the live site from Step 4 works fine. If you do want it: in Terminal, run `cd "/Users/shibbypills/Documents/Mitsu/AI Dictionary/web"` then `python3 -m http.server 3000`, and visit `http://localhost:3000`. For sign-in to work there, add `http://localhost:3000` in Step 5 (Box 1) and Step 6 (Redirect URLs).

## Still to do later

- **Extension sign-in:** the extension saves on your device only right now. Syncing it to the same Google account as the website is a future add-on.
- **Keeping term lists in sync:** the website and the extension each carry their own copy of the concept list; merging them into one shared source is a tidy-up for later.
- **"Get the extension" button** on the website — worth adding once the extension is live in the store and has a link.

## Sources

- [Login with Google — Supabase Docs](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Understanding API keys — Supabase Docs](https://supabase.com/docs/guides/getting-started/api-keys)
- [Redirect URLs — Supabase Docs](https://supabase.com/docs/guides/auth/redirect-urls)
