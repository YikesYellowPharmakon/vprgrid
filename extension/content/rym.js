/* RYM 收藏页一键导入:在你自己的浏览器会话里读取列表(无反爬问题),
 * 自动翻完所有分页,把全部条目递给 GRAIN 雷达(URL hash 导入桥)。 */
(() => {
  const MAX_PAGES = 60;
  const DELAY = 900;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function parseDoc(doc) {
    const items = [];
    // 收藏页主表:每行有 a.album(专辑)与 a.artist(艺人)
    for (const albumLink of doc.querySelectorAll("a.album")) {
      const row = albumLink.closest("tr, .or_q_row, li, div");
      const artistLink = row ? row.querySelector("a.artist") : null;
      if (!artistLink) continue;
      const title = albumLink.textContent.trim();
      const artist = artistLink.textContent.trim();
      if (!title || !artist) continue;
      const rowText = row.textContent || "";
      const year = (rowText.match(/\((\d{4})\)/) || [])[1];
      items.push({ artist, title, date: year });
    }
    return items;
  }

  function pageBase() {
    // 去掉末尾的页码段,得到可拼页码的基准路径
    const path = location.pathname.replace(/\/+$/, "").replace(/\/\d+$/, "");
    return `${location.origin}${path}`;
  }

  function describe() {
    const user = (location.pathname.match(/\/collection\/([^/]+)/) || [])[1] || "";
    const year = (location.pathname.match(/\/(\d{4})(?:\/|$)/) || [])[1];
    const byRelYear = /relyear/i.test(location.href);
    if (year && byRelYear) return `${user} · ${year} release ratings`;
    if (year) return `${user} · ${year}`;
    if (byRelYear) return `${user} · by release year`;
    if (/wish/i.test(location.href)) return `${user} · wishlist`;
    return `${user} · ratings`;
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
    const user = (location.pathname.match(/\/collection\/([^/]+)/) || [])[1] || "RYM";
    const payload = {
      kind: "rym",
      label: `RYM · ${user}`,
      detail: describe(),
      url: location.href,
      items,
    };
    const encoded = b64url(JSON.stringify(payload));
    if (encoded.length < 700000) {
      window.open(`${base}/#refimport=${encoded}`, "_blank");
    } else {
      // 超大列表:剪贴板兜底(应用端粘贴导入解析「艺人 - 专辑 (年份)」行)
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
        kind: "rym",
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
