# Growth plan — 3 → ~1,000 installs in 8 weeks

Constraints: organic + paid only (no influencers, no PR). Paid budget under $100/mo (~$200 total). Starting point: 3 installs, 15 glossary terms, listing not yet SEO-optimized, v1.0.2 not yet uploaded.

## The honest math

$200 of ads at realistic $1–2 per click buys 100–200 clicks → maybe 40–80 installs. Paid cannot carry this. Organic has to deliver 900+, and organic at this scale means two things: launch spikes (Product Hunt, Hacker News, Reddit — 200–500 installs each when they land) and store search (slow but compounding). If both launches flop, expect 300–500 by week 8, with SEO carrying you past 1,000 in month 3–4. Plan accordingly, don't panic at week 4.

## The four levers, in priority order

**1. Fix the store listing and ship v1.0.2 (week 1).** Store search is the #1 discovery channel for extensions, and nobody owns "AI dictionary" there yet. The SEO-optimized listing is done (`extension/STORE-LISTING.md`). Still needed from you: real screenshots (at least 3 of the 5 slots — underlined article, open popover, saved-terms popup), upload the new zip, paste the new name/summary/description into the dashboard. An extension with 3 installs and no screenshots converts near zero regardless of traffic.

**2. Expand the glossary 15 → 60+ terms (weeks 1–3).** This is the highest-leverage work in the whole plan. It makes the extension actually fire on real pages (more underlines = more "wow" moments = better weekly-active numbers, which the store ranks by more than raw installs), and it feeds lever 3. Batch-write 10–15 terms per session in the existing voice.

**3. Turn aidecoder.app into the SEO engine (weeks 2–4, pays off weeks 6+).** One static page per term targeting "what is RAG in simple terms", "what does MCP mean" — queries with real volume and weak competition. Every page ends with the same CTA: "See this explained on any page you read — get the extension." 60 terms = 60 long-tail landing pages. Add a sitemap, submit to Search Console. This is the only channel that keeps growing after the two months are up.

**4. Launches and community (weeks 3–6).** These are organic community launches, not PR:
- **Product Hunt** (week 3 or 4, Tuesday–Thursday): position as "an AI dictionary that lives where you read."
- **Show HN** (a different week than PH): the "status: Core/Rising/Fading/Historical" angle is genuinely novel — lead with it. "Show HN: I built an AI dictionary that tells you which jargon is already dying" is a clickable, honest headline.
- **Reddit**: r/SideProject and r/chrome_extensions (maker posts welcome), r/InternetIsBeautiful (works well for "click a thing, get delight" tools). Post as a maker sharing a free tool, not as an ad. One subreddit per week, not a blast.
- **Ongoing**: when someone asks "what does X mean" in AI subreddits, answer the question properly first, mention the tool second, or not at all — the profile link does the work.

## Paid ($100/mo, weeks 4–8 only)

Don't spend before the listing has screenshots and the glossary is bigger — you'd pay to send traffic to a page that doesn't convert. Then: Google Search ads, exact/phrase match on ultra-long-tail only ("ai dictionary chrome extension", "ai jargon explained", "what does rag mean ai"), $3–4/day, pointing at the store listing. Kill anything above ~$1.50 per install. Side benefit: the ads tell you within days which keywords convert, which then informs the SEO pages.

## Week by week

| Week | Focus | Cumulative target |
|---|---|---|
| 1 | Upload v1.0.2 + new listing + screenshots; fix OAuth redirect in Supabase; glossary → 30 terms | 15 |
| 2 | Glossary → 45; ship per-term pages + sitemap; first Reddit post (r/SideProject) | 40 |
| 3 | Glossary → 60; Product Hunt launch | 200–350 |
| 4 | Show HN; start Google Ads | 350–500 |
| 5 | r/InternetIsBeautiful; 2 new term pages/week ongoing; iterate ads | 500–650 |
| 6 | r/chrome_extensions; check Search Console — double down on pages getting impressions | 650–800 |
| 7 | Second PH-adjacent push (e.g. a "state of AI jargon" page that's inherently shareable); ads at best CPI | 800–900 |
| 8 | Review; SEO pages should now contribute daily installs | ~1,000 |

## What to measure (weekly, 10 minutes)

Installs and weekly users (Chrome dashboard), store-listing impressions → installs conversion rate, Search Console impressions/clicks on term pages, cost per install on ads. If conversion rate is under ~15%, the listing/screenshots are the problem, not traffic.

## What NOT to do

Don't buy installs or reviews (store ban risk). Don't blast 10 subreddits in one week (accounts get flagged, posts get removed). Don't spend the ad budget in week 1. Don't touch review-exchange groups.
