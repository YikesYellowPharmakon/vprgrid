# VprGrid.SYS

**Weekly new-album radar for experimental / underground music.**

Taste-first: subscribe to references (playlists, RYM, AOTY, RSS, artists), pick genres, and the app screens public catalogs (ListenBrainz / MusicBrainz / Bandcamp / AOTY) into a week view. No account. Data stays on your machine.

[Live demo](https://vprgrid.vercel.app) (empty reference pool; changes stay in your browser) · [User guide](docs/USER.en.md) · [Developer notes](docs/DEVELOPER.en.md)

<p align="center">
  <img src="public/og.jpg" alt="VprGrid.SYS" width="840">
</p>

---

## Features

### References

A reference is not a single frozen playlist. It is a stack of **toggleable sources**. Albums in those sources stay pinned and are never filtered out. Artists in the pool are boosted on the auto radar and skip “pipeline / mass-release” rules. Adding or syncing a source also reads its genres into your taste.

You can subscribe to:

- **NetEase Cloud Music playlists** (up to ~1000 tracks; one representative song per album)
- **Rate Your Music / Album of the Year** user pages (paginated import; later syncs only append)
- **RSS / Atom** (Bandcamp artist or label feeds, optional refresh on launch)
- **Artist follow** (full album / EP catalog as reference; new releases float up)
- **Single picks** and **paste import** (official RYM CSV, or `Artist - Album (year)`)

Stack as many sources as you want, or isolate one with “this source only.” Turn off the built-in default reference to run entirely on your own taste. The repo includes a built-in pick snapshot; the [live demo](https://vprgrid.vercel.app) does not load it.

### Filters (auto radar + gear)

New releases from public catalogs are scored against your taste. Reference picks ignore these rules.

- Four weight sliders: **genre fit / artist signal / catalog signal / artwork** — re-rank instantly
- **Taste hits only**, plus separate album / EP toggles
- By default, skip short-cycle mass output, serial titles, thin high scores, and rough covers
- **Rescan** a given week (deep MusicBrainz pass)
- Many new albums have no genre tags yet: an **artist-genre profile** fills the gap so quiet releases are less likely to vanish

### Genre / taste picker

**Taste A–Z**: 27 families, 500+ subgenres (RYM / AOTY tree — ambient, electroacoustic, improv, jazz, noise, metal, club, regional, and more) in one table. Toggles apply immediately.

- Default is **all genres**; any edit becomes **custom**
- Add your own families / subgenres
- **Save this taste**: name the current set and switch back later (multiple saved tastes)

### Saved lists

The **Lists** tab is separate from references. References are your taste baseline. Lists are collections you keep, reorder, and turn into walls.

- One click from a cover; import from playlist URLs, single albums, or paste
- Drag to reorder; multi-select and copy into another list
- Backed up on the machine with references and tastes (survives clearing site data in the browser)

### Topster / album wall

Any list can become a wall:

- Auto-picks a near-square grid, up to 20 × 20
- Edit title, columns, background, gap
- **Download PNG**
- **12 × 12 or smaller**: export a `.topster` file (or copy the payload) and finish the chart on [Topsters](https://topsters.org) via Import chart data

### Full app

The browser workspace (`npm run dev` locally, or the demo):

- Browse by **ISO week**; “Earlier” holds pre-2026 reference albums
- Chinese / English UI; 11 skins (Matrix default), including custom colors
- Search artist / album / representative track across MusicBrainz + iTunes + Deezer (Discogs optional)
- Detail drawer: genres, score reasons, NetEase representative track, Apple Music / Spotify / Bandcamp links
- Optional AI: read the cover, artist background, taste portrait (your own API key)
- Export the week as HTML / JSON / CSV; installable as a PWA

### Extension: new tab + thumbnail wall

`extension/` — Chrome / Edge / Arc, load unpacked in developer mode.

| Surface | What it does |
| --- | --- |
| **New tab** | Sliding cover wall under Google search; widgets for period stats, Pitchfork headlines, a random genre note |
| **Toolbar popup** | Mini cover wall for the current week |
| **RYM / AOTY pages** | “Import to radar” in the corner; paginates the whole list into references |
| **Follows the full app** | While the app is running, taste / references / theme sync to the extension — no copy-paste |

Switch between the new tab wall and the full app in one click. The wall stays empty if the extension is installed but the full app is not running.

---

## Run locally

Needs [Node.js LTS](https://nodejs.org).

```bash
npm install
npm run dev
```

Open http://127.0.0.1:8080 and leave that process running. On a Mac you can also double-click `快速启动.command`.

Extension: `chrome://extensions` → Developer mode → Load unpacked → select `extension/`.

More detail: [user guide](docs/USER.en.md) ([中文](docs/USER.md)) · [developer notes](docs/DEVELOPER.en.md) ([中文](docs/DEVELOPER.md)).

---

## What this is not

Not a streaming player, and not a global “most popular this week” chart. It is a **taste-shaped new-release sieve**: references decide recall; taste and the gear panel decide how the auto radar ranks.
