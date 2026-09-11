/* AOTY 用户页一键导入(评分记录 / 专辑库 / 想听):翻完所有分页递给 GRAIN 雷达。 */
(() => {
  const MAX_PAGES = 60;
  const DELAY = 900;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function parseDoc(doc) {
    const items = [];
    // 布局一:列表行(albumListRow),标题是「Artist - Album」
    for (const row of doc.querySelectorAll(".albumListRow")) {
      const link = row.querySelector(".albumListTitle a, a[href*='/album/']");
      if (!link) continue;
      const m = link.textContent.trim().match(/^(.{1,160}?)\s+-\s+(.{1,200})$/);
      if (!m) continue;
      const year = ((row.textContent || "").match(/\b(19|20)\d{2}\b/) || [])[0];
      items.push({ artist: m[1].trim(), title: m[2].trim(), date: year });
    }
    // 布局二:网格块(albumBlock),artistTitle + albumTitle 分开
    for (const block of doc.querySelectorAll(".albumBlock")) {
      const artist = block.querySelector(".artistTitle")?.textContent?.trim();
      const title = block.querySelector(".albumTitle")?.textContent?.trim();
      if (artist && title) items.push({ artist, title });
    }
    return items;
  }

  function pageBase() {
    const path = location.pathname.replace(/\/+$/, "").replace(/\/\d+$/, "");
    return `${location.origin}${path}`;
  }

  function describe() {
    const user = (location.pathname.match(/\/user\/([^/]+)/) || [])[1] || "";
    if (/\/ratings/.test(location.pathname)) return `${user} · ratings`;
    if (/\/wanted|\/want/.test(location.pathname)) return `${user} · wanted`;
    if (/\/albums/.test(location.pathname)) return `${user} · albums`;
    return `${user} · AOTY`;
  }

  async function collectAll(onProgress) {
    const seen = new Set();
    const all = [];
    const absorb = (items) => {
      let fresh = 0;
      for (const it of items) {
        const k = `${it.artist.toLowerCase()}||${it.title.toLowerCase()}`;
        if (seen.has(k)) continue;
        seen.add(k);
        all.push(it);
        fresh++;
      }
      return fresh;
    };
    absorb(parseDoc(document));
    const base = pageBase();
    for (let page = 2; page <= MAX_PAGES; page++) {
      onProgress((window.VprImportUI?.page || ((n, t) => `page ${n} · ${t}`))(page, all.length));
      await sleep(DELAY);
      let html;
      try {
        const res = await fetch(`${base}/${page}/`, { credentials: "same-origin" });
        if (!res.ok) break;
        html = await res.text();
      } catch {
        break;
      }
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (absorb(parseDoc(doc)) === 0) break;
    }
    return all;
  }

  function b64url(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function deliver(items) {
    const st = await chrome.storage.local.get(["appBase"]);
    const base = String(st.appBase || "").replace(/\/+$/, "");
    if (!base) return;
    const user = (location.pathname.match(/\/user\/([^/]+)/) || [])[1] || "AOTY";
    const payload = { kind: "aoty", label: `AOTY · ${user}`, detail: describe(), url: location.href, items };
    const encoded = b64url(JSON.stringify(payload));
    if (encoded.length < 700000) {
      window.open(`${base}/#refimport=${encoded}`, "_blank");
    } else {
      const text = items.map((i) => `${i.artist} - ${i.title}${i.date ? ` (${i.date})` : ""}`).join("\n");
      await navigator.clipboard.writeText(text);
      window.open(`${base}/#refimport=clipboard`, "_blank");
    }
  }

  function pageUrl() {
    const u = new URL(location.href);
    u.searchParams.delete("vprrefresh");
    u.hash = "";
    return u.toString();
  }

  async function reportRefresh(items) {
    try {
      await chrome.runtime.sendMessage({
        type: "ref-complete",
        url: pageUrl(),
        kind: "aoty",
        items,
        auto: true,
      });
    } catch {
      // 后台没起来
    }
  }

  if (new URLSearchParams(location.search).get("vprrefresh") === "1") {
    collectAll(() => {}).then((items) => {
      if (items.length) return reportRefresh(items);
    });
    return;
  }

  const ui = window.VprImportUI;
  const idle = ui?.label || "Import to radar";
  const btn = document.createElement("button");
  btn.className = "grain-import-btn";
  btn.type = "button";
  btn.textContent = idle;
  ui?.mount(btn);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const items = await collectAll((msg) => (btn.textContent = ui ? ui.collecting(msg) : msg));
      if (!items.length) {
        btn.textContent = ui?.empty || "No items parsed";
        setTimeout(() => (btn.textContent = idle), 3000);
        return;
      }
      btn.textContent = ui ? ui.sending(items.length) : `Sending ${items.length}…`;
      await deliver(items);
      btn.textContent = ui ? ui.sent(items.length) : `Sent ${items.length} ✓`;
      setTimeout(() => (btn.textContent = idle), 4000);
    } finally {
      btn.disabled = false;
    }
  });
  document.body.appendChild(btn);
})();
