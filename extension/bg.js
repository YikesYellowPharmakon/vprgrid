// 后台:轮询应用的 RYM/AOTY 刷新队列,在真实浏览器会话里打开原链接。
const DEFAULT_BASE = "http://127.0.0.1:8080";

async function appBase() {
  const st = await chrome.storage.local.get(["appBase"]);
  return String(st.appBase || DEFAULT_BASE).replace(/\/+$/, "");
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.get(["appBase"]).then((st) => {
    if (!st.appBase) void chrome.storage.local.set({ appBase: DEFAULT_BASE });
  });
});

function urlKey(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete("vprrefresh");
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return String(url).replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

async function pollAndOpen() {
  const base = await appBase();
  if (!base) return;
  let jobs = [];
  try {
    const r = await fetch(`${base}/api/ref-bridge`, { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      jobs = jobs.concat(data.jobs || []);
    }
  } catch {
    /* 应用没开 */
  }
  try {
    const r = await fetch(`${base}/api/web-releases`, { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      jobs = jobs.concat(data.jobs || []);
    }
  } catch {
    /* 应用没开 */
  }
  if (!jobs.length) return;
  const st = await chrome.storage.local.get(["openedRefJobs"]);
  const opened = st.openedRefJobs || {};
  const now = Date.now();
  let dirty = false;
  for (const job of jobs) {
    const stamp = `${urlKey(job.url)}|${job.at || ""}`;
    if (opened[stamp] && now - opened[stamp] < 15 * 60 * 1000) continue;
    opened[stamp] = now;
    dirty = true;
    try {
      const u = new URL(job.url);
      u.searchParams.set("vprrefresh", "1");
      await chrome.tabs.create({ url: u.toString(), active: false });
    } catch {
      // 单条失败继续
    }
  }
  if (dirty) {
    const keys = Object.keys(opened);
    if (keys.length > 40) {
      for (const k of keys.slice(0, keys.length - 40)) delete opened[k];
    }
    await chrome.storage.local.set({ openedRefJobs: opened });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("ref-refresh", { periodInMinutes: 1 });
  void pollAndOpen();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("ref-refresh", { periodInMinutes: 1 });
  void pollAndOpen();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "ref-refresh") void pollAndOpen();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "poll-ref-jobs") {
    void pollAndOpen();
    return;
  }
  if (msg?.type === "web-ingest-done") {
    void (async () => {
      const base = await appBase();
      try {
        await fetch(`${base}/api/web-releases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ack", urls: [String(msg.url || "").split("?")[0]] }),
        });
      } catch {
        /* 应用没开 */
      }
      if (msg.auto && sender.tab?.id) {
        try {
          await chrome.tabs.remove(sender.tab.id);
        } catch {
          /* 标签页可能已被用户关掉 */
        }
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (msg?.type === "ref-complete") {
    void (async () => {
      const base = await appBase();
      try {
        await fetch(`${base}/api/ref-bridge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "complete",
            url: msg.url,
            kind: msg.kind,
            items: msg.items,
          }),
        });
      } catch {
        // 应用没开:下次打开页面再试
      }
      if (msg.auto && sender.tab?.id) {
        try {
          await chrome.tabs.remove(sender.tab.id);
        } catch {
          // 标签页可能已被用户关掉
        }
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
});
