# Setup & deploy

This covers the parts that need your own accounts. The steps are in strict order — each one only depends on the ones before it, so just go top to bottom.

**The dependency chain:** Supabase project → keys in the app → GitHub → deploy (gives you a live URL) → Google OAuth (needs that URL) → connect Google to Supabase → test. The Chrome Web Store (step 8) is independent and can be done anytime.

## How sign-in works in the app (what users see)

- **Looking up terms is free** — no account needed. Search (⌘K), browse the shelf, open any card.
- **Saving requires sign-in.** When a logged-out user taps **Save to my cheatsheet**, a sign-in prompt appears. The **My cheatsheet** tab and a card at the bottom of the shelf also invite sign-in.
- **Signed in:** the cheatsheet reads/writes to Supabase and syncs across devices. On first sign-in, any terms saved locally are merged up automatically.
- Until you finish these steps, the app runs in **preview mode**: the gated UI is fully visible, but "Sign in with Google" shows a "not connected yet" toast instead of signing in. This lets you review the design before wiring the backend.

---

## Step 1 — Create the Supabase project (database)

1. Create a free project at [supabase.com](https://supabase.com) → **New project**. Choose a name and a strong database password.
2. When it's ready, open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates the `cheatsheet_items` table with row-level security so each user only sees their own saves.
3. Get your **Project URL** and a **client key**. The dashboard was reorganized recently, so the quickest path is the **Connect** button in the top bar — that dialog shows both. Otherwise:
   - **Project URL** — looks like `https://<project-ref>.supabase.co`. Shown in the **Connect** dialog, or under **Settings → Data API**.
   - **Client key** — **Settings → API Keys** → copy the **Publishable key** (starts with `sb_publishable_...`). If your project only shows the older keys, use the **anon public** key from the **Legacy API Keys** tab instead — either one works for the browser client.
   - ⚠️ Do **not** use the **Secret key** (`sb_secret_...`) or the legacy **service_role** key — those are server-only and must never ship in the browser.

   You'll paste both into the app in step 2.

## Step 2 — Put the keys in the app

Open [`web/index.html`](web/index.html), find the `window.DECODER_CONFIG` block near the top of the `<body>`, and paste the two values from step 1.3:

```js
window.DECODER_CONFIG = {
  SUPABASE_URL: "https://<project-ref>.supabase.co",
  // Paste your Publishable key (sb_publishable_...) OR the legacy anon key — either works:
  SUPABASE_ANON_KEY: "sb_publishable_..."
};
```

This publishable/anon key is designed to ship in the browser — access is protected by the row-level security policies from step 1. (Never paste the `sb_secret_...` or `service_role` key here.)

## Step 3 — Put the project on GitHub

**What this does:** GitHub stores your code online. In the next step, the hosting service reads your project from GitHub to put it on the web. You do this once; after that, updates are one click.

You have a Mac, so I'd use **GitHub Desktop** — a normal app with buttons, no terminal needed.

### Option A — GitHub Desktop (recommended, no terminal)

1. Download **GitHub Desktop** from [desktop.github.com](https://desktop.github.com) and open it (it lands in your Applications folder like any app).
2. When it opens, click **Sign in to GitHub.com**. If you don't have a GitHub account yet, click **Create your free account** and follow the prompts, then come back and sign in.
3. In GitHub Desktop's top menu bar: **File → Add Local Repository…**
4. Click **Choose…** and select this folder:
   `Documents` → `Mitsu` → `AI Dictionary`, then click **Open**.
5. It will say *"This directory does not appear to be a Git repository. Would you like to create a repository here instead?"* — click the **create a repository** link, then click the **Create Repository** button (the defaults are fine).
6. Now click the big **Publish repository** button (top right). In the box that appears, name it `decoder`, leave **Keep this code private** checked (or uncheck it to make it public), and click **Publish repository**.

That's it — your code is on GitHub. (If you ever change files, GitHub Desktop shows them; type a short note in the "Summary" box, click **Commit to main**, then **Push origin**.)

### Option B — Terminal (if you prefer commands)

1. Open the **Terminal** app: press **⌘ (Cmd) + Space**, type `Terminal`, press **Return**. A window opens where you type commands and press Return after each.
2. First create the empty repo online: go to [github.com/new](https://github.com/new), name it `decoder`, **don't** check "Add a README" (we already have one), and click **Create repository**. Leave that page open — you'll need the URL it shows.
3. In Terminal, paste this to move into the project folder (the quotes matter because of the space in the name), then press Return:
   ```bash
   cd "/Users/shibbypills/Documents/Mitsu/AI Dictionary"
   ```
4. Paste these lines one block at a time, pressing Return after. Replace `<your-username>` with your GitHub username:
   ```bash
   git init
   git add .
   git commit -m "Decoder: AI glossary, browser extension, and web app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/decoder.git
   git push -u origin main
   ```
5. The `git push` may open a browser window asking you to sign in to GitHub — approve it. (GitHub no longer accepts your password typed in the terminal; the browser sign-in handles it.)
   - If `git` isn't installed, macOS pops up a box offering to install the "command line developer tools" — click **Install**, wait, then re-run the command.

Either way, `.gitignore` already keeps out junk files. Your Supabase publishable/anon key is safe to include; never include the secret/service_role key.

## Step 4 — Deploy (Vercel — recommended)

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** to `web`. No build command — it's a static site (`vercel.json` is included).
3. Deploy. **Copy the live URL** it gives you (e.g. `https://decoder.vercel.app`) — you need it in steps 5 and 6.

*Netlify alternative:* import the repo, set **Publish directory** to `web` (already in `netlify.toml`), deploy, and copy the URL.

## Step 5 — Create the Google OAuth client

Now that you have a live URL, set up Google sign-in.

1. In [Google Cloud Console](https://console.cloud.google.com), create or select a project → **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name and your support email, and (while in testing) add your Google account under **Test users**.
2. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
3. **Authorized JavaScript origins:** add your live URL from step 4 (and `http://localhost:3000` if you'll test locally).
4. **Authorized redirect URIs:** add your Supabase callback, copied in full:
   `https://<project-ref>.supabase.co/auth/v1/callback`
   ⚠️ **Most common mistake:** dropping the trailing `/auth/v1/callback`. If sign-in later fails with `redirect_uri_mismatch`, this is almost always why.
5. Click **Create**, then copy the **Client ID** and **Client secret** for step 6.

## Step 6 — Connect Google to Supabase

1. In Supabase: **Authentication → Providers → Google** → enable it, paste the Client ID and secret from step 5, and **Save**. (The exact callback URL you needed in step 5.4 is shown right here on this page, if you want to double-check it.)
2. In Supabase: **Authentication → URL Configuration** → set **Site URL** to your live URL from step 4, and add it to **Redirect URLs** (add `http://localhost:3000` too if testing locally).

## Step 7 — Test sign-in

Open your live URL, click **Sign in with Google**, and confirm you can save a term and see it in **My cheatsheet**. Reload — it should persist. Open the same account on another device to confirm sync.

## Step 8 — Chrome Web Store (independent — anytime)

1. Zip the extension from the project root: `cd extension && zip -r ../decoder-extension.zip . && cd ..`
2. Register a developer account at the [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 fee).
3. **Add new item**, upload the zip, and fill in the listing using the draft in [`extension/STORE-LISTING.md`](extension/STORE-LISTING.md).
4. Add 128/48/16px icons first — see the note in the extension README.
5. Submit for review.

---

## Local testing (optional)

Because sign-in uses a redirect, open the site over `http://localhost`, not `file://`. From the project root:

```bash
cd web && python3 -m http.server 3000
# then visit http://localhost:3000
```

For local sign-in to work, `http://localhost:3000` must be in Google's Authorized origins (step 5.3) and Supabase's Redirect URLs (step 6.2).

## Follow-ups (not done yet)

- **Extension sign-in:** the extension keeps its cheatsheet on-device (`chrome.storage`). Syncing it to the same Google account needs `chrome.identity.launchWebAuthFlow` + the same Supabase project.
- **Shared concept source:** `extension/concepts.js` and the web app's concept list are maintained separately; a single shared JSON is a sensible next refactor.
- **Extension download CTA** on the Lookup page — add once the Web Store URL exists.

## Sources

- [Login with Google — Supabase Docs](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Redirect URLs — Supabase Docs](https://supabase.com/docs/guides/auth/redirect-urls)
