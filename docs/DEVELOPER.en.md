# VprGrid.SYS · Weekly album radar — Developer notes

[English](DEVELOPER.en.md) · [中文](DEVELOPER.md)

A 2026 weekly new-release sieve for experimental listeners. Taste baseline is **multi-source reference settings** (built-in default: 364 albums, 100% hard recall; plus any number of NetEase / RYM / AOTY / RSS / artist sources). On top of that, ListenBrainz and other public catalogs are harvested and grouped by ISO week. Companion Chromium extension in `extension/`: new-tab + toolbar thumbnail wall, and one-click import from RYM / AOTY list pages.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | React 19 + TanStack Start (SSR + server functions) |
| Routing / data | TanStack Router + TanStack Query |
| Style | Tailwind CSS v4 (token-driven multi-theme) |
| Components | Radix UI + wrappers in `src/components/ui/` |
| State | zustand (persist to localStorage; no app database) |
| Build | Vite 8, Vercel target (nitro preset) |
| QA | Playwright smoke scripts + node:test |

**Node 22+**. No database, no accounts. User data (taste, lists, theme, …) lives in the browser under persist key `grain-friday-v4`.

## Quick start

```bash
npm install
npm run dev          # 0.0.0.0:8080
npm run typecheck
npm run build        # writes .vercel/output
npm run lint
node --test scripts/gold-recall.test.mjs
```

## App tree

```
src/
├── routes/
│   ├── __root.tsx            # document shell: fonts, theme boot script, providers
│   └── index.tsx             # home loader (fetch for the current ISO week)
├── components/
│   ├── grain-app.tsx         # main UI: week nav, reference block, auto radar, search, import bridge, auto-refresh
│   ├── ref-sheet.tsx         # reference sheet (sources / URL / artist / paste / sync code)
│   ├── album-sheet.tsx       # album drawer (rep track, listen links, AI cover)
│   ├── taste-sheet.tsx       # Taste A–Z (custom families, saved tastes)
│   ├── theme-sheet.tsx       # skins
│   ├── vault-panel.tsx       # local backup (last write / backup now / two-step restore)
│   └── sleeve.tsx            # covers (CAA / NetEase)
└── lib/
    ├── store.ts              # zustand + persist
    ├── vault.ts              # local vault: snapshot / write / blank check / restore
    ├── themes.ts             # THEMES + applyTheme
    ├── export.ts             # CSV / JSON / ICS / offline HTML
    └── catalog/
        ├── gold-2026.json    # ★ built-in default reference (364 rows; generated — do not hand-edit)
        ├── gold.ts           # buildReference (week bucketing, dup keys) for any entry set
        ├── sources.ts        # ★ source types / merge / paste parse / import-bridge codec / URL detect
        ├── import-sources.ts # ★ server functions: artist (MB pages) / RSS / RYM·AOTY fetch / Apple
        ├── playlist-import.ts # server function: NetEase playlist → reference
        ├── api.ts            # getWeekCatalog: ListenBrainz + MB date fill + artist window counts
        ├── search.ts         # server function: MB / iTunes / Deezer / Discogs search
        ├── score.ts          # score / rank / filters (including pipeline rules)
        ├── genres.ts         # 27 families (genre-note library folded in); default = all
        ├── artists.ts        # experimental artist roster (artist weight)
        ├── analyze.ts        # ★ AI: cover reading
        ├── artist-ai.ts      # ★ AI: artist background (four slots; empty if unsure)
        ├── listen.ts         # Apple / Spotify / NetEase / Bandcamp links
        ├── week.ts           # Friday / ISO date helpers
        └── weeks.ts          # ISO week (Mon–Sun) grouping + format
```

`scripts/`, `server/`, and `public/__grok/` are platform scaffolding — **do not delete or rewrite them**.

## Data flow

A week’s list = **pinned reference block + auto-radar supplement**:

1. **Reference (authoritative)** — merged from the persisted `refSources` list (`mergeSourceEntries` in `sources.ts`, de-dupe on `artist||title`): built-in default (`gold-2026.json`, bundled at build) plus any NetEase / RYM / AOTY / RSS / artist / paste / manual sources. Each source can be toggled, synced, or deleted. `buildReference(entries)` in `gold.ts` files each album into an ISO week (`weekKeyOf` in `weeks.ts`); pre–2026-W01 rows go to the `earlier` bucket. **No filter touches reference rows** — hard recall. The default set is guarded by `scripts/gold-recall.test.mjs`. Old single-playlist fields (`refPlaylist` / `refExtras`) migrate to sources in persist `migrate` (version 2).

2. **Auto radar (live)** — home loader / week change calls server function `getWeekCatalog({ friday, weekStart, weekEnd, deep? })`. In parallel:
   - **ListenBrainz fresh-releases** (21-day window, 30 min memory cache)
   - **MusicBrainz date fill** (`loadMbWeek`: `firstreleasedate` range, up to 2000 rows/week, 1 req/s, 503 retry, 15s budget — this is how zero-listener releases get in)
   Compilations / soundtracks are dropped; tags and popularity hydrate in parallel; **per-artist release counts in the window** (`artistWindowReleases`) drive the pipeline rule.

   `deep: true` (UI **Rescan**, any week) skips both cache layers, raises the cap to **6000 / 60s**, and writes back into the react-query cache.

   Third parallel path: **Bandcamp Discover** (`loadBandcampWeek`: robots-allowed `POST /api/discover/1/discover_web`, 12 genre facets × 2 pages / 4 on deep scan). Window hits become synthetic `bc-` ids, merged by artist|title against MB/LB. Emoji-only titles and <3-track dumps are dropped. Covers and links stay on Bandcamp (not CAA). Zero-follower self-releases get a mild −10; `hydrate` skips synthetic ids so they do not pollute MBID batch calls.

   **AOTY via pre-scraped JSON**: the whole site is behind Cloudflare; only a real Chromium gets through (~4s). Embedding a headless browser in the web process stalls every cache miss and Vercel has no browser, so `scripts/scrape-aoty.mjs` (`npm run scrape:aoty`, also kicked from the Mac launcher) writes `src/lib/catalog/data/aoty-cache.json`. `loadAotyWeek` only reads that file (5 min memory cache) and filters by window. The useful signal is **user scores**, injected onto MB/LB/Bandcamp rows by artist|title — real attention for style-tagged albums that nobody on LB has heard. AOTY-only rows (no genre on the release page) often drop under strict taste; that is expected.

   **RYM cannot be scraped** from the server (Cloudflare plus their own “Loading…” gate). RYM lists go through the extension in a real logged-in session. AllMusic is 403. The merged pool is capped at 600 albums/week before scoring.

   Hydration also fills **artist-level genres `artistGenres`** (24h memory cache): (1) ListenBrainz `metadata/artist` batch (≤600 artists/request, prefer artists missing release genres); (2) if both release and artist are untagged, browse the artist’s MusicBrainz history (`inc=tags`, 1 req/s; 6s normal / 25s deep) and aggregate. Coverage grows on each cache rebuild and user rescan. Radar API `debug=1` prints coverage stats.

3. **Client rank** — `rankAlbums` (`score.ts`): four weighted axes (taste / artist / catalog / artwork). Then: junk-word filter (functional white noise / sleep / ASMR lexicons) → **pipeline filter** (≥3 in-window releases) → rough-cover filter → thin-score filter → strict taste (must hit taste and composite ≥ 40) → same-artist downrank.

   Taste score is layered: full weight on release genres; artist-genre hits at 0.7 (and a slightly lower floor if that is the only hit). Strict taste accepts either layer. Reference-portrait fit counts artist genres at 0.8. Release with no tags but a clear artist profile gets catalog +6. Reasons say “artist genre fits taste.” Auto rows that duplicate `reference.dupKeys` are dropped.

   **`refArtists`** (artists from enabled sources + follow-artist targets): artist axis 82, exempt from pipeline / rough cover / thin score / strict taste.

   **`refProfile`** (`buildRefGenreProfile`: normalized genre frequencies in the pool) can add up to +10 composite on portrait-fitting new albums. That is “taste follows the reference” and “follow artist” in code.

   Users can hide rows (`hidden`, undoable) from the list or grid.

### Genre system and taste presets

`genres.ts` has two sources: `CORE_SOURCE` (original 13 experimental families) and `EXPANSION_SOURCE` + `EXPANSION_EXTRA` (14 further families plus extra children from the RYM / AOTY tree). `rare-families.ts` folds genre-note library entries into existing families (name collisions skipped; no new top-level families). Still **27 families**. Exported sets:

- `ALL_TASTE` = every built-in child; **`DEFAULT_TASTE` is that set**.
- `BASELINE_TASTE` is only for persist upgrades (old default: core tree minus `rock-post` and `internet-microgenre`). `normalizePersistedTaste` lifts archives still on that set (or `[]`) to all-genres.
- `tastePreset(taste)` returns `all` | `custom` for the home chips and the taste sheet.

User-saved tastes are `tastePresets: TastePreset[]` in the store (`{ id, name, ids, savedAt }`; `saveTastePreset` overwrites by name; `applyTastePreset` replaces `taste`). They are in `partialize` and the vault. Matching the live set lights that chip.

`inferGenres` is two-layer to avoid false hits: tags + official secondary types (strong) match all synonyms; title + artist (weak) only distinctive synonyms (multi-word or ≥7 chars) — otherwise a title “House” / “Trap” would pollute.

### Reference sources

`sources.ts` defines `RefSource { id, kind, label, url, detail, enabled, autoSync, entries, lastSync }` with `kind` ∈ builtin / netease / rym / aoty / rss / artist / paste / manual.

- **URL subscribe** (`detectSourceKind` in `ref-sheet.tsx`): NetEase → `playlist-import.ts`. **RYM first import still uses the dedicated card** (extension / paste); a bound `rym` source then supports **Sync** and refresh-on-open. `refreshLinkedSource` tries `importWebList`, then POSTs `/api/ref-bridge` if Cloudflare blocks; the extension `bg.js` opens the URL (`?vprrefresh=1`), the content script paginates and `complete`s; the app polls and `mergeGoldEntries` (append only). AOTY uses the same path. The import bridge upserts by URL (no duplicate sources). RSS/Atom → `importRss`; Apple Music → `importApple`.
- **Follow artist**: `importArtistRef` exact-matches a MusicBrainz artist, then pages albums/EPs (100/page, 1.1s, cap 600). Covers from Cover Art Archive.
- **Paste**: `parsePastedRef` accepts official RYM CSV (Title / First Name / Last Name / Release_Date), generic CSV, and line-wise `Artist - Album (year)`.
- **Extension import bridge**: the extension encodes the list as base64url JSON and opens `/#refimport=<payload>`; `grain-app.tsx` decodes (`decodeImportPayload`) into a source. Huge lists fall back to clipboard + `#refimport=clipboard`. RYM view type (year ratings / all ratings / wishlist) is labeled via `describeRymUrl` into `detail`.
- **Auto refresh**: `autoSync` sources (NetEase / RSS / artist) silently re-fetch ~2.5s after launch, throttled to 1 hour (`lastSync`).

### Read-only APIs (extension)

`src/routes/api/radar.ts` (TanStack server route, CORS `*`): `GET /api/radar?week=<Monday>&taste=<comma genre ids>` returns that week’s built-in reference plus server-side taste-filtered auto radar (≤40 rows, 15 min CDN cache).

`src/routes/api/sync.ts` (CORS `*`, in-memory): **copy-free live sync**. The app `POST /api/sync` 1.2s after taste / pool / theme changes (`buildSyncCode` in `src/lib/sync.ts`). The extension `GET /api/sync` on open and writes `chrome.storage.local` (falls back to a stored sync code). **Copy sync code** stays as backup; clipboard failure still uses `copyText` / `execCommand` and tells the user the live channel already ran.

### Local vault (survives clearing the browser)

References and lists used to live only in localStorage + IndexedDB (`grain-storage.ts`). `src/routes/api/vault.ts` writes the user-built slice to disk on the machine running the app:

- **File**: `.data/vault.json` (gitignored). `VPRGRID_VAULT_DIR` overrides the directory. Before write, the current file is `rename`d to `vault.prev.json`, then a temp file is swapped in atomically. `GET /api/vault?prev=1` reads the previous file.
- **Fields** (`FIELDS` in `src/lib/vault.ts`): `refSources` / `userLists` / `taste` / `tastePresets` / custom families / filter + theme prefs. **Out**: `aiConf` (keys), `artistNotes`, `sleeves` (regenerable AI cache).
- **Two rules**: (1) auto `applySnapshot` only when local state is **blank** (default empty list + only the built-in source + no saved tastes, `isBlank`) — never overwrite a living session; (2) never write a blank snapshot, or the first write after a wipe would flatten the vault.
- **When**: after `ensureSavedList`, `grain-app.tsx` `await maybeRestoreVault()` (toast on success), then `startVaultWatch()` (store subscribe, 4s debounce, flush on hide). Restored heavy fields go through the existing `watchHeavyPersist` into IndexedDB.
- **Read-only hosts** (Vercel): writes fail; `POST` returns `ok:false, reason:"readonly"`; the UI stays quiet and the Install & export copy tells you to export by hand.

### Pipeline rule (high-output, low-distinct artists)

`isAssemblyLine` in `score.ts` — rules only, no artist denylist:

- **≥ 4** albums/EPs by the same artist in the ~21-day window → drop.
- **≥ 2** and a serial title (date stamp, long `0010`-style numbers, `Vol. 12` endings) → drop.
- `album.gold === true` always exempt.

Regression: Michiru Aoyama must contribute **0** auto-radar recs by default, while the built-in pick *Still Air 0010* must remain and stay searchable.

## AI: cover reading

`analyzeCover` in `src/lib/catalog/analyze.ts` is one of three AI call sites (also artist background and taste profile). **Server only** — keys never ship to the browser. Cover image + taste context go to a vision model:

```ts
type CoverReading = {
  sleeveScore: number;      // 0–100; below 45 counts as a rough sleeve
  aesthetic: string;        // 5–8 English aesthetic words
  matchedGenres: string[];  // genre ids
  notes: string;            // two short notes
};
```

Protocol: **OpenAI-compatible `/chat/completions` (multimodal)**. Config is `resolveAi(override?)` in `src/lib/catalog/ai-shared.ts`, two tiers:

1. **BYOK**: ✦ → `ai-sheet.tsx`; key / URL / model in zustand `aiConf` (localStorage); passed as optional `ai` on each server call. `testAi` sends a minimal probe. Keys are not logged or stored server-side.
2. **Host env** (fallback if the user left the sheet empty — no baked-in defaults):

| Variable | Default | Notes |
| --- | --- | --- |
| `AI_API_KEY` | none | AI stays off if unset |
| `AI_BASE_URL` | none | OpenAI-compatible root |
| `AI_MODEL` | none | Cover reading needs vision |

```bash
AI_API_KEY=sk-xxx AI_BASE_URL=https://api.openai.com/v1 AI_MODEL=gpt-4o npm run dev
```

Keep these constraints: cover reads are user-clicked; 8 per session (`sessionStorage` in `album-sheet.tsx`); the rest of the app works without a key. Further AI features should reuse `aiConfig()` and the same **user-initiated + capped + server-side** rules.

## Themes

A skin is a CSS token overlay — **color / type / material / motion only, not information architecture**:

1. `src/styles.css`: add `html[data-theme="your-id"] { --color-* ; --font-* ; --radius-* ; --shadow-border ; --motion-* }`, optional `body { background-image: ... }`.
2. `src/lib/themes.ts`: append to `THEMES` (id / label / note / three-swatch) and `ThemeId`.
3. New fonts go on the Google Fonts link in `__root.tsx`.

The chosen theme is in zustand. An inline script in `__root.tsx` reads localStorage before first paint and sets `data-theme` (custom themes also inject color vars) to avoid a flash.

**Custom theme**: `CustomTheme` in `themes.ts` (bg / text / accent / image URL / texture) is applied by `applyTheme(theme, custom)` as root CSS variables. Surface / raised / muted / subtle / border are `color-mix`d from the three bases. Backdrop + texture rules live under `html[data-theme="custom"][data-custom-texture=…]` in `styles.css`, always with a veil. Editor: `theme-sheet.tsx`.

**Feel**: base layer in `styles.css` gives `button` / `[role="button"]` a press scale and transition tokens; card hover uses `--shadow-border-hover`; covers scale via `group-hover` in `sleeve.tsx`.

## i18n

`src/lib/i18n.ts` owns **all UI copy**. `zh` is the source dictionary; `en` is typed as `Dict = typeof zh` (missing keys fail the build). Parameterized strings are functions. Components use `const t = useT()`. Language is zustand `lang: "zh" | "en"` (persisted); the globe updates `<html lang>`. Week labels come from `formatWeek(key, lang)` in `weeks.ts`; English theme notes in `THEME_NOTES_EN`. **UI chrome only** — album / artist / genre tags / AI output stay source-language. Add keys to both `zh` and `en`.

## AI: artist background

`analyzeArtist` in `src/lib/catalog/artist-ai.ts` shares `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` (text only). Input: artist name + one reference album (disambiguation). Four slots:

```ts
type ArtistNote = {
  works: string[];        // ≤5 notable works, with years
  lineage: string;        // scene / history
  achievements: string;   // publicly checkable press / labels
  similar: string[];      // ≤6 similar artists / groups
};
```

The prompt requires empty slots over invention. The UI hides empty blocks. Cached in zustand `artistNotes` by lowercased name.

## AI: taste profile

`analyzeTaste` in `src/lib/catalog/taste-ai.ts` is the third call site (same env, text). Entry: **AI taste profile** at the top of Taste A–Z, user-clicked. Client (`runAiTaste` in `taste-sheet.tsx`) sends:

- Top 30 frequent artists in the pool + **120 albums sampled evenly** across the pool.
- Enabled and candidate subgenres as `id|label` lines (≤400 each).

Model returns `TasteNote`: `profile` (2–3 sentences), `keywords` (≤8), `enable` / `disable` (server **re-filters to ids that were in the payload**), `artists` (≤8). **Apply suggestions** writes `taste`. Same unavailable-button behavior if no key.

## Maintaining the built-in reference

Users change references in the app. These scripts only refresh the **shipped default**:

```bash
node scripts/update-gold-playlist.mjs           # re-fetch the default playlist → gold-2026.json
node scripts/update-gold-playlist.mjs <id>      # swap the built-in playlist
node --test scripts/gold-recall.test.mjs        # assertions follow playlist size
```

The script pages the full playlist (never “first 10”), backfills missing dates, and approximates week from playlist-add time when needed (`dateApprox`).

## QA

```bash
node scripts/local-smoke.mjs http://127.0.0.1:8080/ dev
node scripts/local-qa-deep.mjs
node scripts/local-qa-sources.mjs
node scripts/local-qa-taste2.mjs
node scripts/local-qa-ext.mjs
```

Screenshots land in `screenshots/`. Note: `npm run test` includes platform `grok-pwa-plugin.test.mjs`, which can fail in workspaces that already have a custom `public/og.jpg` — unrelated to app logic.

## Deploy

**Web (recommended)** — Vercel-shaped build:

```bash
npm run build
npx vercel deploy --prebuilt --prod
```

Optional host env: `AI_API_KEY` (and friends), `DISCOGS_TOKEN` for official Discogs search. Users open the URL or install the PWA. Or import the GitHub repo in the Vercel dashboard (`npm run build`).

**Public demo** — `npm run deploy:demo` builds with `VITE_VPRGRID_DEMO=1` and pushes to Vercel: empty reference pool, no gold playlist, no vault writes, demo banner. Local `npm run dev` does **not** set that flag (full personal app).

**Source** — clone, `npm install && npm run dev`. No required third-party services (AI optional).

**Desktop (optional)** — Tauri / Electron around the deployed URL or a local server if you need a `.dmg` / `.exe`. PWA install covers most desktop cases already.

## Extension (`extension/`)

Manifest V3, no build step (vanilla JS + `shared/radar.css` GRAIN tokens):

- `newtab.html` / `popup.html` + `shared/radar.js`: thumbnail wall from `/api/radar`. Taste / theme prefer `GET /api/sync`, then a local sync code in `chrome.storage.local` (**not** `storage.sync` — the payload can be tens of KB). New-tab widgets: period stats, Pitchfork RSS, genre notes. Wall width slider `wallW`. Genre library: `shared/genres.js` dynamic-imports and merges `genres-world.js` + `genres-net.js`; `loadGenres()` returns whatever parsed, or hides the card if both files are empty (no white page). Draw only from unseen ids (`genreSeen`); reset after the full set. First-paint rain is `prerain.js` (MV3 CSP forbids inline script — do not move it into the HTML).
- `content/rym.js` / `content/aoty.js`: inject **Import to GRAIN radar**, paginate in the user session (≤60 pages, 900ms/page), hand off via `#refimport=`.
- `options.html`: app URL + sync code.
- Icons: `node scripts/gen-ext-icons.mjs`.

Install notes live in `extension/README.md` if present. RYM / AOTY selectors break when those sites redesign — paste import in the app is the durable fallback.
