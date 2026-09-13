/* Shared English copy + theme paint for the floating import chip. */
(() => {
  const PALETTES = {
    matrix: { bg: "#020703", fg: "#8dffa3", accent: "#00ff66" },
    "red-alert": { bg: "#130604", fg: "#f5e6dc", accent: "#ff2b1f" },
  };

  function colorsFrom(st) {
    const last = st.lastTheme;
    if (last && typeof last === "object") {
      const built = PALETTES[last.id];
      if (built) return built;
      if (last.bg && last.fg && last.accent) return { bg: last.bg, fg: last.fg, accent: last.accent };
    }
    if (st.syncCode) {
      try {
        const parsed = JSON.parse(st.syncCode);
        const id = parsed?.theme?.id;
        if (id && PALETTES[id]) return PALETTES[id];
        const th = parsed?.theme;
        if (th?.bg && th?.fg && th?.accent) return { bg: th.bg, fg: th.fg, accent: th.accent };
      } catch {
        /* 同步码不是 JSON */
      }
    }
    return PALETTES.matrix;
  }

  async function paint(btn) {
    const st = await chrome.storage.local.get(["lastTheme", "syncCode"]);
    const c = colorsFrom(st);
    btn.style.setProperty("--vpr-bg", c.bg);
    btn.style.setProperty("--vpr-fg", c.fg);
    btn.style.setProperty("--vpr-accent", c.accent);
  }

  window.VprImportUI = {
    label: "Import to radar",
    pageLabel: "Import this page to radar",
    collecting: (msg) => `Collecting · ${msg}`,
    page: (n, total) => `page ${n} · ${total} so far`,
    empty: "No items parsed",
    sending: (n) => `Sending ${n}…`,
    sent: (n) => `Sent ${n} ✓`,
    wrote: (n, added) => `Wrote ${n} to radar (+${added}) ✓`,
    fail: "Nothing parsed, or the app isn't running",
    paint,
    mount(btn) {
      void paint(btn);
      chrome.storage.onChanged.addListener((ch) => {
        if (ch.lastTheme || ch.syncCode) void paint(btn);
      });
    },
  };
})();
