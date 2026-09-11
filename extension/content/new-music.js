/* RYM / AOTY 新发行页:登录态下一键把本页新专写入雷达扫描池。 */
(() => {
  const site = /rateyourmusic\.com/i.test(location.hostname) ? "rym" : "aoty";
  const auto = new URLSearchParams(location.search).get("vprrefresh") === "1";
  const DELAY = 700;
  const MAX_PAGES = 8;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function parseAoty(doc) {
    const items = [];
    for (const el of doc.querySelectorAll(".albumBlock")) {
      const artist = el.querySelector(".artistTitle")?.textContent?.trim() ?? "";
      const title = el.querySelector(".albumTitle")?.textContent?.trim() ?? "";
      const typeCell = el.querySelector(".type")?.textContent?.trim() ?? "";
      const score = Number.parseInt(el.querySelector(".rating")?.textContent?.trim() ?? "", 10);
      const link = el.querySelector("a[href*='/album/']")?.getAttribute("href") ?? "";
      const img = el.querySelector("img");
      const cover = img?.getAttribute("data-src") || img?.getAttribute("src") || "";
      if (!artist || !title) continue;
      const m = typeCell.match(/^([A-Za-z]{3})\s+(\d{1,2})/);
      let date = today();
      if (m) {
        const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
        const mon = months[m[1].toLowerCase()];
        if (mon) date = `${new Date().getFullYear()}-${mon}-${String(m[2]).padStart(2, "0")}`;
      }
      const kind = /ep/i.test(typeCell) ? "EP" : "Album";
      if (/reissue|mixtape|compilation|single/i.test(typeCell) && !/ep/i.test(typeCell)) continue;
      items.push({
        source: "aoty",
        artist,
        title,
        date,
        type: kind,
        userScore: Number.isFinite(score) ? score : null,
        cover: cover && /^https?:/.test(cover) ? cover : null,
        url: link ? new URL(link, location.origin).toString() : location.href,
      });
    }
    for (const row of doc.querySelectorAll(".albumListRow")) {
      const link = row.querySelector(".albumListTitle a, a[href*='/album/']");
      if (!link) continue;
      const m = link.textContent.trim().match(/^(.{1,160}?)\s+-\s+(.{1,200})$/);
      if (!m) continue;
      const year = ((row.textContent || "").match(/\b(19|20)\d{2}\b/) || [])[0];
      items.push({
        source: "aoty",
        artist: m[1].trim(),
        title: m[2].trim(),
        date: year ? `${year}-07-01` : today(),
        type: "Album",
        userScore: null,
        cover: null,
        url: new URL(link.getAttribute("href"), location.origin).toString(),
      });
    }
    return items;
  }

  function parseRym(doc) {
    const items = [];
    const rows = doc.querySelectorAll(".page_charts_section_charts_item, .or_q_row, .object_release, tr");
    for (const row of rows) {
      const album = row.querySelector("a.album, a[href*='/release/album/'], a[href*='/release/ep/']");
      const artist = row.querySelector("a.artist, a[href*='/artist/']");
      if (!album || !artist) continue;
      const year = (row.textContent || "").match(/\b(19|20)\d{2}\b/);
      const href = album.getAttribute("href") || "";
      items.push({
        source: "rym",
        artist: artist.textContent.trim(),
        title: album.textContent.trim(),
        date: year ? `${year[0]}-07-01` : today(),
        type: /\/release\/ep\//.test(href) ? "EP" : "Album",
        userScore: null,
        cover: null,
        url: href ? new URL(href, location.origin).toString() : location.href,
      });
    }
    return items;
  }

  function pageBase() {
    const path = location.pathname.replace(/\/+$/, "").replace(/\/\d+$/, "");
    return `${location.origin}${path}`;
  }

  async function collectAll(onProgress) {
    const seen = new Set();
    const all = [];
    const absorb = (list) => {
      let n = 0;
      for (const it of list) {
        const k = `${it.artist.toLowerCase()}||${it.title.toLowerCase()}`;
        if (seen.has(k)) continue;
        seen.add(k);
        all.push(it);
        n += 1;
      }
      return n;
    };
    absorb(site === "rym" ? parseRym(document) : parseAoty(document));
    const base = pageBase();
    for (let page = 2; page <= MAX_PAGES; page++) {
      onProgress?.((window.VprImportUI?.page || ((n, t) => `page ${n} · ${t}`))(page, all.length));
      await sleep(DELAY);
      try {
        const res = await fetch(`${base}/${page}/`, { credentials: "same-origin" });
        if (!res.ok) break;
        const doc = new DOMParser().parseFromString(await res.text(), "text/html");
        if (absorb(site === "rym" ? parseRym(doc) : parseAoty(doc)) === 0) break;
      } catch {
        break;
      }
    }
    return all;
  }

  async function ingest(items) {
    const st = await chrome.storage.local.get(["appBase"]);
    const base = String(st.appBase || "").replace(/\/+$/, "");
    if (!base) return;
    const r = await fetch(`${base}/api/web-releases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ingest", items }),
    });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  async function run(onProgress) {
    const items = await collectAll(onProgress);
    if (!items.length) throw new Error("empty");
    const res = await ingest(items);
    try {
      await chrome.runtime.sendMessage({
        type: "web-ingest-done",
        url: location.href,
        auto,
        added: res.added,
        total: items.length,
      });
    } catch {
      /* 后台未就绪 */
    }
    return { items, res };
  }

  if (auto) {
    run(() => {}).catch(() => {});
    return;
  }

  const ui = window.VprImportUI;
  const idle = ui?.pageLabel || "Import this page to radar";
  const btn = document.createElement("button");
  btn.className = "grain-import-btn";
  btn.type = "button";
  btn.textContent = idle;
  ui?.mount(btn);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const { items, res } = await run((msg) => {
        btn.textContent = ui ? ui.collecting(msg) : msg;
      });
      btn.textContent = ui ? ui.wrote(items.length, res.added ?? 0) : `Wrote ${items.length} (+${res.added ?? 0}) ✓`;
    } catch {
      btn.textContent = ui?.fail || "Nothing parsed, or the app isn't running";
    }
    setTimeout(() => {
      btn.textContent = idle;
      btn.disabled = false;
    }, 4000);
  });
  document.body.appendChild(btn);
})();
