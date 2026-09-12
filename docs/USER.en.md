# VprGrid.SYS · Weekly album radar — User guide

[English](USER.en.md) · [中文](USER.md)

VprGrid.SYS answers one question: **what new albums are worth hearing this week?** It builds a week view from two layers:

- **Reference standard**: a taste baseline merged from **multiple subscription sources** — a built-in default (364 hand picks) plus any mix of NetEase Cloud Music playlists, RYM / AOTY lists, RSS feeds, artist follows, and pasted lists. Reference albums stay pinned and are never filtered out. Artists in the pool are boosted on the auto radar.
- **Auto radar**: this week’s new releases from public catalogs (ListenBrainz / MusicBrainz / Bandcamp Discover), scored against your taste, with mass-production pipelines and low-signal noise filtered out. The Bandcamp pool covers a lot of experimental / ambient / improv that only exists there. AOTY’s new-release page is pulled into the scan pool on launch (no taste filter). RYM’s new-release pages are often blocked on the server — after you log in in the browser, use **Import RYM / AOTY new releases** next to the week nav, or the **Import this page’s new releases into the radar** button on those sites.

No account. Settings live on your machine: one copy in the browser, plus an automatic backup on the computer running the app (clearing browser data does not wipe it — see **Install & export → Local backup**).

## Starting after you close the terminal or reboot

The full app does not start with the OS or the editor. Leave the process running. When the terminal prints `Local`, open http://127.0.0.1:8080 and confirm it is not a blank page. The extension looks for that address by default. You need Node.js LTS from [nodejs.org](https://nodejs.org).

From a clone of this repo:

```bash
npm install
npm run dev
```

On a Mac you can also double-click `快速启动.command` in the project root.

**Demo zip (1.5.14+, with an `app/` folder):** `cd` into `app`, run `npm install` once, then `npm run dev`. Mac users can double-click **打开完整应用.command** inside the zip. The old 1.5.10 zip is extension-only — installing just that gives a grey screen. Use a newer pack.

## Language (中 / EN)

The globe button in the header (EN / 中) switches the whole UI — buttons, panels, settings, toasts — and remembers the choice. Album titles, artist names, and genre tags stay in their original language.

## Browse by week

- Header arrows move one week; the dropdown jumps to any week in 2026.
- **Earlier** is the leftover bucket for reference albums released before 2026 (reissues, older work).
- After you leave the current week, **Back to this week** jumps home.
- **Rescan** next to the week nav: for whichever week you are on (including past weeks), bypass cache and deep-crawl MusicBrainz registrations (up to 6000 rows, about a minute). Use it when an older week feels thin.
- **Artist-genre fallback**: many strong new albums have no genre tags yet and would be dropped if we only looked at the release. The radar adds an artist-genre layer — first the artist’s profile, then a roll-up of that artist’s past releases. Releases whose *artist* genres fit your taste still get in (reason: artist genre fits taste; slightly less weight than a release-level hit). The profile accumulates on each refresh and rescan.
- Rows marked **pick** are reference selections. The **Auto radar** block below is ranked by composite score.

## Listen

- Each reference pick has a **representative track** button to the NetEase Cloud Music song page.
- Rows and the detail drawer look up Apple Music / Spotify / NetEase / Bandcamp album links.
- Click any album for the detail drawer: release info, genre tags, score reasons, catalog jumps (MusicBrainz / Discogs / AOTY / RYM).

## Search (whole catalog, any year or genre)

The header search box takes **artist / album / representative track** and searches two layers:

- **Reference pool**: every entry, across weeks — you see which week it belongs to even if you are parked elsewhere.
- **Web search**: two or more characters query **MusicBrainz + iTunes + Deezer** in parallel (plus Discogs if the host set a token). Any era, any genre; results are de-duplicated and labeled by source. Artist names are matched exactly, so names like `/f` or `!!!` still list a full discography. RYM / AOTY have no public API; the search area links into their on-site search.

Web results have **Add to reference**. That pins the album into your reference set (filed by release week). The auto-radar detail drawer has the same button. Manual adds live under **Reference → Manual picks** and can be removed one by one.

## Taste

**Taste A–Z**: **27 families, 500+ subgenres** (RYM / AOTY tree, with the genre-note library folded into existing families — ambient, electroacoustic, improv, jazz, noise, hip-hop, metal, club, regional, pop spectrum…). Toggles apply immediately. You can add your own families / subgenres (marked **custom**); those score too.

Presets (chips next to **Reference** on the home page, and at the top of the taste sheet):

- **All**: every built-in subgenre (the default).
- Any manual change becomes **Custom**. The home page only shows enabled family cards; the rest collapse into a dashed “N more families off” card.

**My tastes**: **Save this taste** names the current set. Click a chip to restore it (the number is how many subgenres are on). The chip lights up when the live selection matches that save. Saving under the same name overwrites. The trash can deletes the save, not the current checkboxes. Saved tastes go into the local backup.

## Reference (taste follows what you subscribe)

The list icon in the header (or **Reference** on the reference block) opens the sheet. The standard is a stack of **sources**. Each can be toggled, synced, or deleted. Adding or syncing a source **reads its genres into your taste**. Artists in those sources are boosted on the auto radar and skip pipeline filters — the taste moves with whatever you feed it.

Supported sources:

- **URL subscribe** (kind is detected):
  - **NetEase Cloud Music playlist**: full track list (cap 1000); first track of an album is the representative song.
  - **AOTY user page**: ratings / collection / wishlist URLs; walks **every page**, tags the reference type; later **Sync** or refresh-on-open only appends.
  - **RYM URL** (own import path): first import still uses the extension one-click or paste CSV. After that, **Sync** or refresh-on-open. New items append; old rows stay. The server is usually blocked by RYM; the app then queues the browser extension to open the real URL in the background (extension installed, app running).
  - **RSS / Atom** (Bandcamp artist or label feeds): with refresh-on-open, each launch pulls new items.
- **Follow artist**: type a name (including `/f`-style names); the full album / EP catalog becomes reference. Later releases rank high and skip every filter; refresh on open.
- **Add one album**: `Artist - Album (year)` goes into **Manual picks** — same sink as **Add to reference** from search.
- **Paste** (RYM / AOTY fallback): official RYM **Export your data** CSV, or one `Artist - Album (year)` per line. Multi-page pastes de-duplicate.

You can stack many sources. The sheet has **select all / none**. Each card has **this source only** for a temporary A/B. Everything stays in the local browser. Turn off **built-in default** to run entirely on your own pool; you can turn it back on later.

The pool also builds a **genre portrait**: styles that show up more often give a larger bonus to matching new albums. Two people can both enable ambient and still get different charts if one pool leans drone and the other IDM.

## Ranking and filters (gear, top right)

- **Four weight sliders**: genre fit / artist signal / catalog signal / artwork — re-rank instantly.
- **Taste hits only**: turn off to see the whole week.
- **Skip high-output pipelines**: drops short-cycle mass releases and serial titles (daily ambient dumps, etc.). Reference picks are exempt.
- **Skip thin high scores / rough covers**: drops high ratings with almost no raters, and entries without a real sleeve.
- Album / EP can be toggled separately.

## AI: read the cover (optional)

**Read cover** in the detail drawer scores the sleeve 0–100, gives a short aesthetic line, and two notes. That score feeds the artwork ranking dimension. Configure the endpoint under **AI settings**; if it is empty the button says unavailable and nothing else breaks. Cap: 8 reads per session.

## AI: artist background (optional)

**Artist background** in the detail drawer fills four public-info slots: **works** (notable releases + years), **lineage** (scene / history), **achievements** (labels, press), **similar artists / groups**. If the model is unsure who the name is, or a slot has no reliable source, that slot stays empty — nothing is invented. Cached locally per artist. Needs **AI settings**.

## AI: taste profile (optional)

The **AI taste profile** card at the top of Taste A–Z. **Generate** reads your reference pool (frequent artists + 120 albums sampled across the pool) and the current genre toggles, then returns:

- **Profile**: 2–3 sentences (scene / era / texture / attitude).
- **Keywords**: up to 8.
- **Suggested on / off subgenres**: only real ids from the library, plus **apply suggestions**.
- **Artists to follow**: still-active names close to the pool — subscribe under **Reference → Follow artist**.

Uncertain slots stay empty. Uses your own endpoint (below).

## AI settings (bring your own key)

The ✦ icon opens **AI settings**: API key, base URL, model name. Cover / artist / taste calls then use that OpenAI-compatible `/chat/completions` endpoint. **Test connection** checks the trio. **Clear** only wipes what you typed; there is no built-in default service.

The key lives in your browser (`localStorage`). Calls go through this app’s server to *your* provider — not stored in a database, not sent to a third party we pick. A new browser or cleared site data means you re-enter it.

## Skins

The palette icon switches 11 skins: **Matrix (default) / Cyber Neon / Grainy Blur / Red Alert / Y2K Futurism / Utopian Virtual / Metalheart / Liminal Space / Frutiger Aero / Indie Kid / Custom**. Only color, type, and material change. The choice is remembered. Each skin has a live backdrop (Matrix rain, neon city, grain blooms, command-room grid, chrome orbs, and so on). Motion sits under the content; **Reduce motion** freezes it.

**Custom palette**: pick background / text / accent (the rest is derived), optional image URL as a full-bleed backdrop (a dark veil keeps type readable), plus a texture (none / grain / grid / glow). Any edit switches to **Custom** immediately.

## Saves, lists, hide

- Bookmark icon on a row; **Saved** in the header collects them (reference picks stay visible across weeks).
- On **Lists**, **Album wall** lays a list into a grid: near-square, max 20 × 20; title, columns, background, gap; **Download PNG**. **12 × 12 or smaller** can also build Topsters import data (`.topster` file or copied text). Checked albums only, if any are checked.
- The crossed-eye icon (row, or hover on a grid cover) hides an album from results; the toast can **undo**. Same switch in the detail drawer. Reference picks cannot be hidden.

## Install & export

**Install & export**:

- **Install as a local app**: Chrome / Edge install icon in the address bar, or Safari **File → Add to Dock**.
- **Offline HTML / JSON / CSV** for the current week.
- **Calendar reminder**: an ICS that pings you on Fridays.
- **Local backup** at the bottom of the panel. Imported sources, lists, saved tastes, and prefs write to `.data/vault.json` on the machine running the app (not in the browser). If the browser is empty on launch, the app restores from that file. **Backup now** and **Restore from backup** (restore overwrites; second click confirms).

Phones work (responsive) and support Add to Home Screen.

## Browser extension (new-tab wall + RYM / AOTY import)

Chromium extension in `extension/` (Chrome / Edge / Arc):

- **New tab**: themed Google mark + search box; a frosted **stacked sliding wall** of covers (hover lifts a sleeve and shows artist / title; reference picks marked **pick**). Widgets above the wall: **period stats** (reference count, scan pool, passed, pipeline — ellipses if that week/month has not been scanned), **music news** (Pitchfork headlines), **genre note** (random unused entry from the library: era, feel, one exemplar; ‹ › to step; reshuffles only after the whole set). Bottom bar: status + **four sliders** (wall width, wall height / cover size, frame vertical position, frame height — remembered; frame stays centered) + **This week / Refresh / Full app / Settings**. Search width is fixed. A header pill switches **album wall ↔ full app**.
- **Theme follow**: the extension ships the same motion themes. While the app is running it pushes theme / taste / reference pool over a direct channel; the next new tab already matches. Custom themes sync colors and the static backdrop plus motion.
- **中 / EN** on the new tab and popup (independent from the app language).
- **Toolbar popup**: mini wall.
- **One-click import**: on an RYM collection or AOTY user page, **Import to radar** walks every page and creates a reference source (year ratings / all ratings / wishlist).
- **Taste sync (no copy)**: if the app is running, the extension pulls the latest taste / pool / theme on open. **Copy sync code** remains as a backup for offline use.

Install: `chrome://extensions` → Developer mode → Load unpacked → `extension/`, then set the app URL in options. See `extension/README.md` if present.

## FAQ

**Grey screen / extension cannot reach the app?** The full app is not running, or you have the old 1.5.10 extension-only zip. Use 1.5.14+ and start the app as above.

**Why is this week’s auto radar empty?** Fresh ListenBrainz harvest covers about the last three weeks; MusicBrainz date queries backfill zero-listener releases for the current week. Older weeks mostly show reference picks.

**Will my saves vanish?** Sources, lists, tastes, and theme write to `.data/vault.json` on the machine running the app. Clearing cookies / site data and reopening restores from that file. To move machines, use **Backup now** and **Download JSON** under **Install & export**.

**Where does the score come from?** Open any auto-radar album: the drawer lists each plus/minus (taste hit, artist weight, rater count, artwork, …).
