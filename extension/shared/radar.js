/* VprGrid.SYS 雷达墙:新标签页与弹窗共用。拉取应用的 /api/radar,
   本地合并同步码里的参考池,复现应用主题(配色 + 背景图画),支持中英切换。 */

import { loadGenres, pickGenre } from "./genres.js";

const DEFAULT_BASE = "http://127.0.0.1:8080";
const APP_CANDIDATES = [
  "http://127.0.0.1:8080",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

function tidyBase(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

/** 本机完整应用常见别名:127.0.0.1 与 localhost 视为同一处。 */
function appHostAliases(dest) {
  const base = tidyBase(dest);
  if (!base) return [];
  try {
    const u = new URL(base);
    const port = u.port ? `:${u.port}` : "";
    const list = [u.origin];
    if (u.hostname === "127.0.0.1") list.push(`${u.protocol}//localhost${port}`);
    if (u.hostname === "localhost") list.push(`${u.protocol}//127.0.0.1${port}`);
    return [...new Set(list)];
  } catch {
    return [base];
  }
}

function tabMatchesApp(tabUrl, dest) {
  const raw = String(tabUrl || "");
  if (!raw || /^(chrome|edge|about|moz-extension|chrome-extension):/i.test(raw)) return false;
  try {
    return appHostAliases(dest).includes(new URL(raw).origin);
  } catch {
    const u = raw.replace(/\/+$/, "");
    const d = tidyBase(dest);
    return u === d || u.startsWith(`${d}/`) || u.startsWith(`${d}?`);
  }
}

async function probeUrl(url) {
  const base = tidyBase(url);
  if (!base) return false;
  try {
    const res = await fetch(`${base}/api/sync`, { signal: AbortSignal.timeout(2200), cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/** 按已保存地址和本机常见地址探测，找到正在跑的完整应用。 */
async function resolveLiveBase(preferred) {
  const seen = new Set();
  const list = [];
  for (const raw of [preferred, ...APP_CANDIDATES]) {
    const u = tidyBase(raw);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    list.push(u);
  }
  const hits = await Promise.all(list.map(async (u) => ((await probeUrl(u)) ? u : "")));
  return hits.find(Boolean) || "";
}

/* ---------- i18n ---------- */

const I18N = {
  zh: {
    htmlLang: "zh-CN",
    heading: "Weekly Album Radar",
    search: "搜索，或输入网址",
    searchVia: "搜索由 Google 提供",
    loading: "加载中…",
    statusWaiting: "完整应用未打开 · 打开后自动铺上这期",
    refreshing: "后台刷新中…",
    status: (g, a, synced) => `参考 ${g} · 雷达 ${a}${synced ? " · 已同步口味" : ""}`,
    empty: "这一周还很安静 —— 试试相邻的周，或切到按月。",
    err1: (m) => `连不上雷达(${m})。`,
    err2: "请确认应用地址已在插件设置里配置正确,且应用在运行。",
    openSettings: "打开设置",
    footerLeft: "参考亲选置顶 · 雷达过筛补充",
    footerApp: "完整应用 ↗",
    footerSettings: "设置",
    modeApp: "完整应用",
    modeWall: "缩略图墙",
    modeAppIcon: "▤",
    modeWallIcon: "⊞",
    modeAppTitle: "打开完整应用",
    modeWallTitle: "切回缩略图墙",
    more: "更多",
    moreTitle: "完整应用",
    pick: "选",
    prev: "上一周",
    next: "下一周",
    prevMonth: "上一月",
    nextMonth: "下一月",
    btnToday: "本周",
    btnTodayTitle: "跳回当前周",
    btnThisMonth: "本月",
    btnThisMonthTitle: "跳回当前月",
    grainMonth: "月",
    grainWeek: "周",
    grainMonthTitle: "按月份看前列专辑",
    grainWeekTitle: "按自然周看专辑墙",
    emptyMonth: "这个月还很安静 —— 试试相邻的月，或切回按周。",
    btnReload: "刷新",
    btnReloadTitle: "重新拉取这一周",
    newsHead: "音乐快讯",
    newsFail: "快讯暂时拉不到",
    statsHead: "本期",
    statRefLab: "参考",
    statRefN: (n) => `${n} 张`,
    statPoolLab: "扫描池",
    statPassLab: "本期过筛",
    statLineLab: "流水线",
    statWait: "…",
    genreHead: "风格介绍",
    genreKey: "代表",
    genrePrev: "回上一个风格",
    genreNext: "换一个风格",
    sizeTitle: "拖左右边或滑杆调整宽度(保持居中)",
    sizeHTitle: "拖动调整封面高度(会记住)",
    sizeYTitle: "拖顶栏上下移动大框(会记住)",
    sizeSTitle: "拖底边拉高 / 收起大框(会记住)",
    sizeCwTitle: "拖动调整封面宽度(会记住;不动则保持正方形)",
    resetLayout: "默认",
    resetLayoutTitle: "恢复默认布局:墙宽、封面大小、上下位置都回到初始值",
    langBtn: "EN",
    langTitle: "Switch to English",
    appDownTitle: "完整应用没有打开",
    appDownBody:
      "完整应用现在没在跑，或插件设置里的地址不对。先把完整应用打开，再点重试。",
    appDownNoBase: "还没有填写应用地址。到插件设置里贴上完整应用的网址，保存后再试。",
    appDownRetry: "重试",
    appDownWall: "回到专辑墙",
    appDownSettings: "打开设置",
  },
  en: {
    htmlLang: "en",
    heading: "Weekly Album Radar",
    search: "Search or type a URL",
    searchVia: "Search provided by Google",
    loading: "Loading…",
    statusWaiting: "App is closed · this period fills in when it starts",
    refreshing: "Refreshing…",
    status: (g, a, synced) => `Picks ${g} · Radar ${a}${synced ? " · taste synced" : ""}`,
    empty: "A quiet week — try the neighbours, or switch to month.",
    err1: (m) => `Can't reach the radar (${m}).`,
    err2: "Check the app URL in the extension settings and make sure the app is running.",
    openSettings: "Open settings",
    footerLeft: "Curator picks pinned · radar filtered",
    footerApp: "Full app ↗",
    footerSettings: "Settings",
    modeApp: "Full app",
    modeWall: "Wall",
    modeAppIcon: "▤",
    modeWallIcon: "⊞",
    modeAppTitle: "Open the full app",
    modeWallTitle: "Back to the wall",
    more: "More",
    moreTitle: "Full app",
    pick: "★",
    prev: "Previous week",
    next: "Next week",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    btnToday: "This week",
    btnTodayTitle: "Jump back to the current week",
    btnThisMonth: "This month",
    btnThisMonthTitle: "Jump back to the current month",
    grainMonth: "Mo",
    grainWeek: "Wk",
    grainMonthTitle: "Show leading albums by month",
    grainWeekTitle: "Show the wall by week",
    emptyMonth: "A quiet month — try a neighbour, or switch back to week.",
    btnReload: "Refresh",
    btnReloadTitle: "Reload this week",
    newsHead: "Music news",
    newsFail: "News unavailable right now",
    statsHead: "This period",
    statRefLab: "Picks",
    statRefN: (n) => String(n),
    statPoolLab: "Pool",
    statPassLab: "Passed",
    statLineLab: "Assembly",
    statWait: "…",
    genreHead: "Genre notes",
    genreKey: "Try",
    genrePrev: "Previous genre",
    genreNext: "Another genre",
    sizeTitle: "Drag the side edges or slider to resize width (stays centered)",
    sizeHTitle: "Drag to adjust cover height (remembered)",
    sizeYTitle: "Drag the top bar to move the box (remembered)",
    sizeSTitle: "Drag the bottom edge to stretch the box (remembered)",
    sizeCwTitle: "Drag to adjust cover width (remembered; untouched = square)",
    resetLayout: "Reset",
    resetLayoutTitle: "Restore the default layout: wall width, cover size and vertical offset",
    langBtn: "中",
    langTitle: "切换为中文",
    appDownTitle: "The full app isn’t running",
    appDownBody:
      "The full app isn’t running, or the URL in settings is wrong. Start the app, then retry.",
    appDownNoBase: "No app URL yet. Paste the full app address in the extension settings, save, and try again.",
    appDownRetry: "Retry",
    appDownWall: "Back to the wall",
    appDownSettings: "Open settings",
  },
};

/* ---------- 周工具 ---------- */

function mondayOfIso(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const shift = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - shift);
  return dt.toISOString().slice(0, 10);
}

function mondayOfToday() {
  return mondayOfIso(new Date().toISOString().slice(0, 10));
}

function shiftWeek(mondayIso, weeks) {
  const dt = new Date(`${mondayIso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + weeks * 7);
  return dt.toISOString().slice(0, 10);
}

function weekLabel(mondayIso) {
  const start = new Date(`${mondayIso}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `${start.getUTCFullYear()} · ${fmt(start)} – ${fmt(end)}`;
}

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ymOfToday() {
  return new Date().toISOString().slice(0, 7);
}

function monthStart(ym) {
  return `${ym}-01`;
}

function monthEnd(ym) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function addMonths(ym, n) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym, lang) {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const last = Number(monthEnd(ym).slice(8, 10));
  const range = `${month}/1 – ${month}/${last}`;
  return lang === "zh" ? `${year} 年 ${month} 月 · ${range}` : `${EN_MONTHS[month - 1]} ${year} · ${range}`;
}

function addDaysIso(iso, n) {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function periodOf(state) {
  if (state.grain === "month") {
    return { start: monthStart(state.ym), end: monthEnd(state.ym), key: `m:${state.ym}` };
  }
  return { start: state.week, end: addDaysIso(state.week, 6), key: `w:${state.week}` };
}

function periodLabel(state) {
  return state.grain === "month" ? monthLabel(state.ym, state.lang) : weekLabel(state.week);
}

function inPeriod(date, state) {
  const d = String(date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const { start, end } = periodOf(state);
  return d >= start && d <= end;
}

function normKey(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** 像网址就直达,否则走表单里的 Google 搜索(说明性使用,不仿标志)。 */
/** 墙上先铺 200px(与原先一致,首屏不重),视网膜再闲时换成 400。 */
function wallThumb(url, meta, px = 200) {
  if (!url && !(meta?.artist && meta?.title && meta?.base)) return null;
  let u = url ? String(url).trim() : "";
  if (u.startsWith("//")) u = `https:${u}`;
  else if (u.startsWith("http://")) u = `https://${u.slice(7)}`;
  if (u && !/^https:\/\//i.test(u)) u = "";
  if (/music\.126\.net/i.test(u)) {
    u = `${u.split("#")[0].split("?")[0]}?param=${px}y${px}`;
  }
  if (/coverartarchive\.org/i.test(u)) {
    const n = px >= 400 ? "500" : "250";
    if (/\/front-\d+\b/.test(u)) u = u.replace(/\/front-\d+\b/, `/front-${n}`);
    else u = u.replace(/\/front\/?(?=[?#]|$)/, `/front-${n}`);
  }
  const needsProxy = /coverartarchive\.org|archive\.org|music\.126\.net|albumoftheyear\.org/i.test(u);
  const base = String(meta?.base || "").replace(/\/$/, "");
  if (base && (needsProxy || (!u && meta?.artist && meta?.title))) {
    const q = new URLSearchParams();
    if (u) q.set("u", u);
    if (meta?.artist) q.set("artist", meta.artist);
    if (meta?.title) q.set("title", meta.title);
    return `${base}/api/cover?${q}`;
  }
  if (!u) return null;
  if (/bcbits\.com/i.test(u)) {
    return u.replace(/_(10|16|20)\.jpg(\?|$)/i, "_2.jpg$2");
  }
  if (/albumoftheyear\.org/i.test(u)) {
    return u.replace(/\/\d+x\d+\//, "/250x0/").replace(/\/\d+x0\//, "/250x0/");
  }
  if (/upload\.wikimedia\.org/i.test(u)) {
    return u.replace(/\/\d+px-/, "/320px-");
  }
  if (/lastfm|last\.fm/i.test(u)) {
    return u.replace(/\/i\/u\/\d+x\d+\//, "/i/u/300x300/");
  }
  return u;
}

const COVER_EAGER = 28;
const coverWarmed = new Set();
const hiQueue = [];
let hiBusy = 0;

function pumpHiUpgrade() {
  if (hiBusy || document.hidden) return;
  const job = hiQueue.shift();
  if (!job) return;
  hiBusy = 1;
  job(() => {
    hiBusy = 0;
    if (typeof requestIdleCallback === "function") requestIdleCallback(pumpHiUpgrade, { timeout: 480 });
    else setTimeout(pumpHiUpgrade, 90);
  });
}

function thumbMeta(item, base) {
  return { base, artist: item?.artist, title: item?.title };
}

function warmupCovers(items, base) {
  for (const item of items) {
    const url = wallThumb(item.cover, thumbMeta(item, base));
    if (!url || coverWarmed.has(url)) continue;
    coverWarmed.add(url);
    const im = new Image();
    im.referrerPolicy = "no-referrer";
    im.decoding = "async";
    im.src = url;
  }
}

function bindCover(img, thumb, eager, item, state) {
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.alt = "";
  img.width = 160;
  img.height = 160;
  img.loading = eager ? "eager" : "lazy";
  img.fetchPriority = eager ? "high" : "low";
  img.addEventListener("load", () => {
    img.classList.add("on");
    if (img.dataset.hi === "1" || img.dataset.hi === "skip") return;
    if ((window.devicePixelRatio || 1) < 1.25 || !item) return;
    const hi = wallThumb(item.cover, thumbMeta(item, state?.base), 400);
    if (!hi || hi === img.src) return;
    const bump = (done) => {
      if (img.dataset.hi || !img.isConnected) {
        done();
        return;
      }
      const probe = new Image();
      probe.referrerPolicy = "no-referrer";
      probe.onload = () => {
        if (img.dataset.hi || !img.parentNode) {
          done();
          return;
        }
        img.dataset.hi = "1";
        const over = img.cloneNode(false);
        over.src = hi;
        over.className = img.className;
        over.alt = "";
        over.decoding = "async";
        over.referrerPolicy = "no-referrer";
        img.after(over);
        done();
      };
      probe.onerror = () => {
        img.dataset.hi = "skip";
        done();
      };
      probe.src = hi;
    };
    hiQueue.push(bump);
    if (typeof requestIdleCallback === "function") requestIdleCallback(pumpHiUpgrade, { timeout: 1600 });
    else setTimeout(pumpHiUpgrade, 280);
  });
  img.onerror = () => {
    if (img.dataset.hi === "1") {
      img.dataset.hi = "skip";
      if (thumb) img.src = thumb;
      return;
    }
    const base = String(state?.base || "").replace(/\/$/, "");
    if (!img.dataset.fb && base && item?.artist && item?.title) {
      img.dataset.fb = "1";
      const q = new URLSearchParams({ artist: item.artist, title: item.title });
      img.src = `${base}/api/cover?${q}`;
      return;
    }
    img.remove();
  };
  img.src = thumb;
}

function asNavigableUrl(raw) {
  const q = String(raw ?? "").trim();
  if (!q || /\s/.test(q)) return null;
  if (/^https?:\/\//i.test(q)) return q;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#].*)?$/i.test(q)) return `https://${q}`;
  return null;
}

function wireWebSearch() {
  const form = document.getElementById("websearch");
  const input = document.getElementById("q");
  if (!form || !input) return;
  form.addEventListener("submit", (ev) => {
    const dest = asNavigableUrl(input.value);
    if (!dest) return;
    ev.preventDefault();
    location.assign(dest);
  });
}

/* ---------- 设置与主题 ---------- */

async function getSettings() {
  const st = await chrome.storage.local.get(["appBase", "syncCode", "viewMode", "extLang", "wallW", "wallH", "wallY", "wallS", "coverW", "wallGrain"]);
  let sync = null;
  if (st.syncCode) {
    try {
      const parsed = JSON.parse(st.syncCode);
      if (parsed && Array.isArray(parsed.entries)) sync = parsed;
    } catch {
      /* 同步码坏了就当没有 */
    }
  }
  return {
    base: tidyBase(st.appBase || DEFAULT_BASE),
    sync,
    viewMode: st.viewMode,
    lang: st.extLang === "en" ? "en" : "zh",
    wallW: Number(st.wallW) || 920,
    wallH: Number(st.wallH) || 128,
    wallY: Number(st.wallY) || 0,
    wallS: Number(st.wallS) || 0,
    coverW: Number(st.coverW) || 0, // 0 = 跟随墙高(正方形)
    grain: st.wallGrain === "month" ? "month" : "week",
  };
}

/**
 * 免复制直连同步(主路径):应用运行时会把最新口味 / 参考池 / 主题推到
 * 自己的 /api/sync,这里直接拉取——拉到就当场生效并落盘,拉不到(应用
 * 没开 / 冷启动丢失)则回退到已保存的同步码。
 */
async function fetchDirectSync(base) {
  try {
    const res = await fetch(`${base}/api/sync`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data.code !== "string") return null;
    const parsed = JSON.parse(data.code);
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    void chrome.storage.local.set({ syncCode: data.code });
    return parsed;
  } catch {
    return null;
  }
}

function filterSig(state) {
  const s = state.sync;
  const f = s?.filters;
  return [
    (s?.taste || []).join(","),
    f ? `${f.strictTaste}|${f.skipThinRatings}|${f.skipRoughCovers}|${f.skipAssemblyLine}|${(f.types || []).join(".")}|${(f.hidden || []).join(",")}` : "",
  ].join("::");
}

function listIdent(data) {
  const gold = data?.reference || [];
  const auto = data?.auto || [];
  return [...gold, ...auto].map((i) => `${i.gold ? 1 : 0}\t${normKey(i.artist)}\t${normKey(i.title)}`).join("\n");
}

function radarQuery(state) {
  const s = state.sync;
  const { start, end } = periodOf(state);
  const params = new URLSearchParams(
    state.grain === "month" ? { start, end } : { week: state.week },
  );
  if (s?.taste?.length) params.set("taste", s.taste.join(","));
  const wt = s?.weights;
  if (wt && [wt.taste, wt.artist, wt.rating, wt.cover].every((n) => Number.isFinite(n))) {
    params.set("w", [wt.taste, wt.artist, wt.rating, wt.cover].join(","));
  }
  const f = s?.filters;
  if (f) {
    params.set("strict", f.strictTaste ? "1" : "0");
    params.set("thin", f.skipThinRatings ? "1" : "0");
    params.set("rough", f.skipRoughCovers ? "1" : "0");
    params.set("line", f.skipAssemblyLine ? "1" : "0");
    if (f.types?.length) params.set("types", f.types.join(","));
    if (f.hidden?.length) params.set("hidden", f.hidden.slice(0, 200).join(","));
  }
  if (s?.artists?.length) params.set("artists", s.artists.slice(0, 400).join(","));
  return params.toString();
}

function adoptWallPeriod(state, wall) {
  if (!wall || typeof wall !== "object") return;
  if (wall.grain === "week" || wall.grain === "month") state.grain = wall.grain;
  const week = mondayOfIso(String(wall.week || "").slice(0, 10));
  if (week) state.week = week;
  if (/^\d{4}-\d{2}/.test(String(wall.start || ""))) state.ym = String(wall.start).slice(0, 7);
}

function wallToRadarData(sync, state) {
  const wall = sync?.wall;
  if (!wall || !Array.isArray(wall.items) || !wall.items.length) return null;
  const { start, end } = periodOf(state);
  const wallGrain = wall.grain === "month" || wall.grain === "week" ? wall.grain : "";
  if (wallGrain && wallGrain !== state.grain) return null;
  const wallStart = String(wall.start || "");
  const wallEnd = String(wall.end || "");
  const sameRange = Boolean(wallStart && wallEnd && wallStart === start && wallEnd === end);
  const sameWeek = state.grain === "week" && Boolean(wall.week) && wall.week === state.week;
  if (wallStart && wallEnd) {
    if (!sameRange && !sameWeek) return null;
  } else if (!sameWeek) {
    return null;
  }
  const reference = [];
  const auto = [];
  for (const e of wall.items) {
    const rawId = String(e.id || "").trim();
    const item = {
      id: rawId || `${e.gold ? "wall-g" : "wall-a"}-${normKey(e.artist)}-${normKey(e.title)}`,
      artist: e.artist,
      title: e.title,
      date: e.date,
      cover: wallThumb(e.pic) || e.pic || null,
      gold: Boolean(e.gold),
    };
    (item.gold ? reference : auto).push(item);
  }
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    week: wall.week || state.week,
    start,
    end,
    reference,
    auto,
    fromWall: true,
    scanned: num(wall.scanned),
    passed: num(wall.passed),
    line: num(wall.line),
  };
}

/** 同步码里的参考池按日期切开,换期时立刻上墙,不用等目录算完。 */
function goldFromSync(state) {
  const entries = state.sync?.entries;
  if (!Array.isArray(entries) || !entries.length) return null;
  const cap = state.grain === "month" ? 36 : 80;
  const reference = [];
  for (const e of entries) {
    if (!e || !inPeriod(e.date, state)) continue;
    const artist = String(e.artist || "").trim();
    const title = String(e.title || "").trim();
    if (!artist || !title) continue;
    reference.push({
      id: `${normKey(artist)}-${normKey(title)}`,
      artist,
      title,
      date: String(e.date || "").slice(0, 10),
      cover: wallThumb(e.pic) || e.pic || null,
      gold: true,
    });
    if (reference.length >= cap) break;
  }
  if (!reference.length) return null;
  const { start, end } = periodOf(state);
  return { week: state.week, start, end, reference, auto: [], fromSyncGold: true, scanned: null, passed: null, line: null };
}

function neighborViews(state) {
  if (state.grain === "month") {
    return [
      { grain: "month", week: state.week, ym: addMonths(state.ym, -1) },
      { grain: "month", week: state.week, ym: addMonths(state.ym, 1) },
    ];
  }
  return [
    { grain: "week", week: shiftWeek(state.week, -1), ym: state.ym },
    { grain: "week", week: shiftWeek(state.week, 1), ym: state.ym },
  ];
}

async function prefetchNeighbors(state) {
  if (state._prefetching) return;
  state._prefetching = true;
  const taste = filterSig(state);
  try {
    for (const view of neighborViews(state)) {
      const next = { ...state, ...view };
      const key = periodOf(next).key;
      if (await readPeriodWall(key, taste)) continue;
      try {
        const data = await fetchRadar(next);
        await writePeriodWall(key, taste, data);
      } catch {
        /* 邻期拉不到不影响当前墙 */
      }
    }
  } finally {
    state._prefetching = false;
  }
}

function wallSig(sync) {
  const w = sync?.wall;
  if (!w?.items?.length) return "";
  const items = w.items.map((e) => `${e.gold ? 1 : 0}|${normKey(e.artist)}|${normKey(e.title)}`).join(";");
  return `${w.grain || ""}|${w.start || w.week}|${w.end || ""}|${items}`;
}

async function readPeriodWall(periodKey, taste) {
  try {
    const { wallByPeriod, wallCache } = await chrome.storage.local.get(["wallByPeriod", "wallCache"]);
    const row = wallByPeriod?.[`${periodKey}::${taste}`];
    if (row?.data) return row.data;
    if (wallCache?.data && wallCache.period === periodKey && wallCache.taste === taste) return wallCache.data;
  } catch {
    /* 读盘失败就当没有 */
  }
  return null;
}

function isConnectFail(err) {
  const m = String(err?.message || err);
  return /failed to fetch|networkerror|load failed|econnrefused/i.test(m);
}

async function fetchRadar(state) {
  const seen = new Set();
  const list = [];
  for (const raw of [state.base, ...APP_CANDIDATES]) {
    const u = tidyBase(raw);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    list.push(u);
  }
  const qs = radarQuery(state);
  let lastErr = null;
  for (const base of list) {
    try {
      const res = await fetch(`${base}/api/radar?${qs}`, {
        signal: AbortSignal.timeout(90000),
        cache: "no-store",
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (data.error) {
        lastErr = new Error(data.error);
        continue;
      }
      if (base !== state.base) {
        state.base = base;
        void chrome.storage.local.set({ appBase: base });
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (!isConnectFail(err)) break;
    }
  }
  throw lastErr || new Error("offline");
}

function paintCoverSkeletons(state) {
  const grid = document.getElementById("grid");
  if (!grid) return;
  const isNewtab = document.body.classList.contains("newtab");
  grid.style.gridTemplateColumns = isNewtab ? "" : "repeat(4, 1fr)";
  grid.replaceChildren(...Array.from({ length: isNewtab ? 12 : 16 }, () => el("div", "skeleton")));
  state._wallIdent = "";
}

async function writePeriodWall(periodKey, taste, data) {
  try {
    const { wallByPeriod } = await chrome.storage.local.get("wallByPeriod");
    const map = wallByPeriod && typeof wallByPeriod === "object" ? { ...wallByPeriod } : {};
    const key = `${periodKey}::${taste}`;
    map[key] = { data, at: Date.now() };
    const keys = Object.keys(map);
    if (keys.length > 30) {
      keys
        .sort((a, b) => (map[a].at || 0) - (map[b].at || 0))
        .slice(0, keys.length - 24)
        .forEach((k) => {
          delete map[k];
        });
    }
    await chrome.storage.local.set({
      wallByPeriod: map,
      wallCache: { period: periodKey, taste, data, at: Date.now() },
    });
  } catch {
    /* 落盘失败不影响当次上墙 */
  }
}

/** 插件内置动效主题(与应用同源,themes.css 全套接管配色 + 背景 + 动画)。 */
const BUILTIN_THEMES = new Set(["matrix", "cyber-neon", "grainy-blur", "red-alert"]);
/** 已下线主题的旧同步码兑底:GRAIN / PictoChat / 美学套件落到 Matrix,Cybercore 落到 Red Alert。 */
const LEGACY_THEME_MAP = {
  default: "matrix",
  pictochat: "matrix",
  cybercore: "red-alert",
  y2k: "matrix",
  "utopian-virtual": "matrix",
  metalheart: "matrix",
  "liminal-space": "matrix",
  "frutiger-aero": "matrix",
  "indie-kid": "matrix",
};
const THEME_PAINT = {
  matrix: { bg: "#020703", fg: "#8dffa3", accent: "#00ff66" },
  "cyber-neon": { bg: "#0a0716", fg: "#e8f4ff", accent: "#00e5ff" },
  "grainy-blur": { bg: "#141019", fg: "#f2ecf6", accent: "#c9a0ff" },
  "red-alert": { bg: "#130604", fg: "#f5e6dc", accent: "#ff2b1f" },
};

/* ---------- 电影式数字雨(Matrix 主题专属,与应用端同款 canvas 实现) ----------
   亮头下坠 + 渐隐尾迹,字符网格逐帧随机变异——没有任何固定字符贴图。 */
const RAIN_BASE = "ﾅｱﾜｦﾊﾗﾝｼｿｷﾎｳﾔﾂﾈﾒｹﾙﾎﾐ0123456789=*+<>:¥";
const RAIN_MUSIC = "♪♫♩♬♯♭♮#bnΔø°";
function pickRainGlyphCode() {
  const src = Math.random() < 0.42 ? RAIN_MUSIC : RAIN_BASE;
  return src.charCodeAt(Math.floor(Math.random() * src.length));
}
let rainCanvas = null;
let rainRaf = 0;
let rainDetach = null;

function stopMatrixRain() {
  if (rainRaf) cancelAnimationFrame(rainRaf);
  rainRaf = 0;
  rainDetach?.();
  rainDetach = null;
  rainCanvas?.remove();
  rainCanvas = null;
  document.documentElement.classList.remove("rain-live");
}

function startMatrixRain() {
  if (rainCanvas) return;
  const host = document.getElementById("bgfx");
  if (!host || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  rainCanvas = document.createElement("canvas");
  rainCanvas.className = "rain-canvas";
  rainCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0.62;contain:strict;pointer-events:none;";
  host.appendChild(rainCanvas);
  const ctx = rainCanvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return stopMatrixRain();

  const FONT = 15;
  const COL = 16;
  const ROW = 13;
  const MAX_COLS = 88;
  let cols = 0, rows = 0, viewW = 0, viewH = 0, heads, speeds, lens, grid;
  const resetColumn = (c, initial) => {
    speeds[c] = 5.4 + Math.random() * 10.5;
    lens[c] = 16 + Math.floor(Math.random() * 20);
    heads[c] = initial ? Math.random() * (rows + 8) : -Math.random() * rows * 0.22;
  };
  const layout = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (Math.abs(w - viewW) < 10 && Math.abs(h - viewH) < 10 && cols) return;
    viewW = w;
    viewH = h;
    rainCanvas.width = Math.max(1, Math.round(w * dpr));
    rainCanvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${FONT}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    cols = Math.min(MAX_COLS, Math.ceil(w / COL));
    rows = Math.ceil(h / ROW) + 2;
    heads = new Float32Array(cols);
    speeds = new Float32Array(cols);
    lens = new Float32Array(cols);
    grid = new Uint16Array(cols * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = pickRainGlyphCode();
    for (let c = 0; c < cols; c++) resetColumn(c, true);
  };
  const draw = (step, churnOn) => {
    if (churnOn) {
      const churn = Math.min(220, Math.ceil(grid.length * 0.008));
      for (let i = 0; i < churn; i++) {
        grid[Math.floor(Math.random() * grid.length)] = pickRainGlyphCode();
      }
    }
    ctx.clearRect(0, 0, viewW, viewH);
    const stepX = viewW / cols;
    for (let c = 0; c < cols; c++) {
      heads[c] += speeds[c] * step;
      const headPos = heads[c];
      const len = lens[c];
      if (headPos - len > rows) { resetColumn(c, false); continue; }
      const x = c * stepX + stepX / 2;
      const headRow = Math.floor(headPos);
      for (let i = 0; i < len; i++) {
        const row = headRow - i;
        if (row < 0 || row >= rows) continue;
        const g = String.fromCharCode(grid[c * rows + row]);
        const y = row * ROW + ROW / 2;
        const persist = Math.pow(1 - i / len, 0.48);
        if (i === 0) {
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = "#e8fff0";
        } else if (i < 8) {
          ctx.globalAlpha = 0.82 * persist;
          ctx.fillStyle = i < 4 ? "#9dffc0" : "#22ff72";
        } else {
          ctx.globalAlpha = persist * 0.68;
          ctx.fillStyle = "#00ff66";
        }
        ctx.fillText(g, x, y);
      }
    }
    ctx.globalAlpha = 1;
  };
  layout();
  draw(0, false);
  document.documentElement.classList.add("rain-live");
  host.querySelector(".prerain")?.remove();

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      layout();
      draw(0, false);
    }, 140);
  };
  const onVis = () => {
    if (document.hidden) {
      if (rainRaf) cancelAnimationFrame(rainRaf);
      rainRaf = 0;
      return;
    }
    if (!rainRaf) {
      last = performance.now();
      rainRaf = requestAnimationFrame(frame);
    }
    pumpHiUpgrade();
  };
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVis);
  rainDetach = () => {
    clearTimeout(resizeTimer);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVis);
  };

  let last = performance.now();
  const frame = (now) => {
    rainRaf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = now - last;
    if (dt < 33) return;
    last = now;
    draw(Math.min(dt, 50) / 1000, true);
  };
  rainRaf = requestAnimationFrame(frame);
}

function syncMatrixRain() {
  if (document.documentElement.dataset.theme === "matrix") startMatrixRain();
  else stopMatrixRain();
}

function setStatusText(node, text, pending) {
  if (!node) return;
  node.classList.toggle("is-pending", Boolean(pending));
  if (node.textContent === text) return;
  node.classList.add("is-swap");
  node.textContent = text;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => node.classList.remove("is-swap"));
  });
}

/**
 * 主题同步:同步码 v3 携带主题 id——内置主题直接 data-theme 接管(带动效);
 * 自定义主题走 data-theme="synced":内联注入配色变量 + 复现捕获的静态背景。
 */
function applySyncTheme(theme) {
  const root = document.documentElement;
  let id = theme && typeof theme.id === "string" ? theme.id : null;
  if (id && LEGACY_THEME_MAP[id]) id = LEGACY_THEME_MAP[id];
  const clearInline = () => {
    for (const cssVar of ["--bg", "--surface", "--raised", "--fg", "--muted", "--subtle", "--accent", "--border"]) {
      root.style.removeProperty(cssVar);
    }
    const s = root.style;
    s.backgroundImage = "";
    s.backgroundSize = "";
    s.backgroundPosition = "";
    s.backgroundRepeat = "";
    s.backgroundBlendMode = "";
    s.backgroundColor = "";
  };
  if (!theme || typeof theme !== "object" || (id && BUILTIN_THEMES.has(id))) {
    clearInline();
    const next = id && BUILTIN_THEMES.has(id) ? id : "matrix";
    root.dataset.theme = next;
    void chrome.storage.local.set({ lastTheme: { id: next, ...THEME_PAINT[next] } });
    syncMatrixRain();
    return;
  }
  // 自定义/旧版同步码:配色变量 + html 上复现捕获的背景图画
  root.dataset.theme = "synced";
  const map = {
    bg: "--bg",
    surface: "--surface",
    raised: "--raised",
    fg: "--fg",
    muted: "--muted",
    subtle: "--subtle",
    accent: "--accent",
    border: "--border",
  };
  for (const [key, cssVar] of Object.entries(map)) {
    const val = theme[key];
    if (typeof val === "string" && val) root.style.setProperty(cssVar, val);
  }
  const bb = theme.bodyBg;
  if (bb && typeof bb.image === "string" && bb.image && bb.image !== "none") {
    const s = root.style;
    s.backgroundImage = bb.image;
    if (bb.size) s.backgroundSize = bb.size;
    if (bb.position) s.backgroundPosition = bb.position;
    if (bb.repeat) s.backgroundRepeat = bb.repeat;
    if (bb.blend) s.backgroundBlendMode = bb.blend;
    if (bb.color) s.backgroundColor = bb.color;
  }
  void chrome.storage.local.set({
    lastTheme: {
      id: "custom",
      bg: typeof theme.bg === "string" ? theme.bg : "#101014",
      fg: typeof theme.fg === "string" ? theme.fg : "#ece9f1",
      accent: typeof theme.accent === "string" ? theme.accent : "#8ab4ff",
    },
  });
  syncMatrixRain();
}

/* ---------- 渲染 ---------- */

/** 完整应用主页深链:带上专辑与当前墙的时期,打开后直接弹出对应详情。 */
function appHref(base, state, item) {
  try {
    const u = new URL(`${String(base || "").replace(/\/+$/, "")}/`);
    if (state.grain === "month" && state.ym) u.searchParams.set("month", state.ym);
    else if (state.week) u.searchParams.set("week", state.week);
    if (item) {
      const id = String(item.id || "");
      if (id && !id.startsWith("wall-") && !id.startsWith("sync-")) u.searchParams.set("album", id);
      if (item.artist) u.searchParams.set("artist", item.artist);
      if (item.title) u.searchParams.set("title", item.title);
    }
    return u.toString();
  } catch {
    return base;
  }
}

function prefetchApp(url) {
  if (!url) return;
  const links = document.head.querySelectorAll('link[rel="prefetch"]');
  if ([...links].some((n) => n.href === url || n.getAttribute("href") === url)) return;
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = url;
  document.head.appendChild(link);
}

function openAppUrl(url) {
  if (!url) return;
  if (chrome.tabs?.query && chrome.tabs?.update) {
    chrome.tabs.query({}, (tabs) => {
      const hit = (tabs || []).find((tab) => tabMatchesApp(tab.url, url));
      if (hit?.id) {
        chrome.tabs.update(hit.id, { url, active: true });
        if (hit.windowId && chrome.windows?.update) chrome.windows.update(hit.windowId, { focused: true });
        return;
      }
      if (chrome.tabs.create) chrome.tabs.create({ url });
      else window.open(url, "_blank", "noopener");
    });
    return;
  }
  window.open(url, "_blank", "noopener");
}

function card(item, state, t, idx = 0) {
  const a = el("a", "card");
  a.href = appHref(state.base, state, item);
  a.target = "_blank";
  a.rel = "noreferrer";
  a.title = `${item.artist} — ${item.title}`;
  a.addEventListener("pointerenter", () => prefetchApp(a.href), { once: true });
  a.addEventListener("click", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
    ev.preventDefault();
    openAppUrl(a.href);
  });
  const cover = el("div", "cover");
  cover.appendChild(tile(item));
  const thumb = wallThumb(item.cover, thumbMeta(item, state.base));
  if (thumb) {
    const img = document.createElement("img");
    bindCover(img, thumb, idx < COVER_EAGER, item, state);
    cover.appendChild(img);
  }
  if (item.gold) cover.appendChild(el("span", "pick", t.pick));
  // 紧排墙:文字信息收进悬停浮层,平时只见封面
  const meta = el("div", "meta");
  meta.appendChild(el("p", "artist", item.artist));
  meta.appendChild(el("p", "title", item.title));
  cover.appendChild(meta);
  a.appendChild(cover);
  return a;
}

function tile(item) {
  const t = el("div", "tile");
  t.textContent = `${(item.artist[0] || "G")}${(item.title[0] || "R")}`.toUpperCase();
  return t;
}

function finiteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/** 左上本期统计:参考张数随时有;扫描池 / 过筛 / 流水线没扫过就写省略号。 */
function renderStats(state, data) {
  const box = document.getElementById("statsw");
  if (!box) return;
  const t = state.t;
  const set = (id, text) => {
    const n = document.getElementById(id);
    if (n) n.textContent = text;
  };
  const gold = Array.isArray(data?.reference) ? data.reference.length : 0;
  const waiting = !data || data.partial || data.fromSyncGold || !finiteNum(data.scanned);
  set("statshead", t.statsHead);
  set("statreflab", t.statRefLab);
  set("statref", t.statRefN(gold));
  set("statpoollab", t.statPoolLab);
  set("statpool", waiting ? t.statWait : String(data.scanned));
  set("statpasslab", t.statPassLab);
  set("statpass", waiting ? t.statWait : String(finiteNum(data.passed) ? data.passed : (data.auto || []).length));
  set("statlinelab", t.statLineLab);
  set("statline", waiting ? t.statWait : String(finiteNum(data.line) ? data.line : 0));
}

/** 把一份雷达响应画上墙:合并参考池、去重、渲染、更新状态栏。 */
function renderWall(state, data) {
  const t = state.t;
  const grid = document.getElementById("grid");
  const status = document.getElementById("status");
  const isNewtab = document.body.classList.contains("newtab");

  // 名单以应用快照或雷达接口为准,不再用参考池重排——重排是月份墙自己变来变去的主因
  const gold = data.reference || [];
  const goldKeys = new Set(gold.map((g) => `${normKey(g.artist)}||${normKey(g.title)}`));
  const auto = (data.auto || []).filter((a) => !goldKeys.has(`${normKey(a.artist)}||${normKey(a.title)}`));
  const cap = state.grain === "month" ? 48 : 80;
  const items = [...gold, ...auto].slice(0, cap);
  state._statsData = { ...data, reference: gold, auto };
  renderStats(state, state._statsData);
  const ident = `${periodOf(state).key}\n${items.map((i) => `${normKey(i.artist)}\t${normKey(i.title)}`).join("\n")}`;
  if (state._wallIdent === ident && grid.childElementCount && !grid.querySelector(".skeleton")) {
    setStatusText(status, t.status(gold.length, auto.length, Boolean(state.sync)));
    return;
  }
  state._wallIdent = ident;

  if (!items.length) {
    grid.replaceChildren();
    grid.style.gridTemplateColumns = "";
    grid.appendChild(el("div", "empty", state.grain === "month" ? t.emptyMonth : t.empty));
  } else if (isNewtab) {
    warmupCovers(items, state.base);
    paintStack(grid, items, state, t);
  } else {
    warmupCovers(items, state.base);
    renderSquareWall(grid, items, state, t);
  }
  setStatusText(status, t.status(gold.length, auto.length, Boolean(state.sync)));
}

async function loadWeek(state, opts = {}) {
  const force = Boolean(opts.force);
  const gen = (state._loadGen = (state._loadGen || 0) + 1);
  const t = state.t;
  const grid = document.getElementById("grid");
  const status = document.getElementById("status");
  document.getElementById("weeklabel").textContent = periodLabel(state);
  applyGrainChrome(state);
  const taste = filterSig(state);
  const periodKey = periodOf(state).key;
  const periodChanged = state._shownPeriod !== periodKey;
  state._shownPeriod = periodKey;
  if (periodChanged) {
    const goldSnap = goldFromSync(state);
    renderStats(state, goldSnap || { reference: [], fromSyncGold: true });
  }

  const snap = wallToRadarData(state.sync, state);
  if (snap && !force) {
    state._waiting = false;
    renderWall(state, snap);
    void writePeriodWall(periodKey, taste, snap);
    if (finiteNum(snap.scanned)) {
      state._loadBusy = false;
      void prefetchNeighbors(state);
      return;
    }
  }

  const gold = goldFromSync(state);
  const fetchP = fetchRadar(state);
  const cached = force ? null : await readPeriodWall(periodKey, taste);
  if (gen !== state._loadGen) return;
  if (cached) {
    renderWall(state, cached);
  } else if (gold) {
    renderWall(state, gold);
    setStatusText(status, t.loading, true);
  } else if (periodChanged || force || !grid.querySelector(".skeleton")) {
    paintCoverSkeletons(state);
    setStatusText(status, t.loading, true);
  } else {
    setStatusText(status, t.loading, true);
  }

  let data;
  state._loadBusy = true;
  try {
    data = await fetchP;
  } catch {
    if (gen !== state._loadGen) return;
    state._waiting = true;
    if (cached || gold) {
      setStatusText(status, t.statusWaiting, true);
      return;
    }
    if (!grid.querySelector(".skeleton")) paintCoverSkeletons(state);
    setStatusText(status, t.statusWaiting, true);
    return;
  } finally {
    if (gen === state._loadGen) state._loadBusy = false;
  }
  if (gen !== state._loadGen) return;
  state._waiting = false;
  renderWall(state, data);
  void writePeriodWall(periodKey, taste, data);
  void prefetchNeighbors(state);
}

/**
 * 新标签页的堆叠滑动墙:所有封面排成一条互相叠压的胶片,大弧度圆角,
 * 框内左右滚动浏览;悬停时该张浮起到最上层。
 */
function paintStack(grid, items, state, t) {
  const frag = document.createDocumentFragment();
  items.forEach((item, i) => frag.appendChild(card(item, state, t, i)));
  grid.replaceChildren(frag);
}

/**
 * 弹窗墙:固定 4×4。先清空再铺,满格时最后一格收剩余封面。
 * 以前按 √M 铺 N×N 又不清格子,封面会叠在骨架上,格子也会小到看不清。
 */
function renderSquareWall(grid, items, state, t) {
  const slots = 16;
  const overflow = items.length > slots;
  const shown = overflow ? items.slice(0, slots - 1) : items.slice(0, slots);
  const rest = overflow ? items.slice(slots - 1) : [];
  const frag = document.createDocumentFragment();
  shown.forEach((item, i) => frag.appendChild(card(item, state, t, i)));
  if (rest.length) frag.appendChild(morebox(rest, state, t));
  grid.style.gridTemplateColumns = "repeat(4, 1fr)";
  grid.replaceChildren(frag);
}

/** 收纳盒:2×2 迷你封面拼贴 + 剩余计数,点击进完整应用。 */
function morebox(rest, state, t) {
  const box = el("a", "card morebox");
  box.href = appHref(state.base, state, rest[0] || null);
  box.addEventListener("click", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
    ev.preventDefault();
    openAppUrl(box.href);
  });
  box.target = "_blank";
  box.rel = "noreferrer";
  box.title = `${t.more} +${rest.length}`;
  const cover = el("div", "cover");
  const mini = el("div", "mini");
  for (const r of rest.slice(0, 4)) {
    const cell = el("div", "minicell");
    const thumb = wallThumb(r.cover, thumbMeta(r, state.base));
    if (thumb) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        const base = String(state.base || "").replace(/\/$/, "");
        if (!img.dataset.fb && base && r.artist && r.title) {
          img.dataset.fb = "1";
          const q = new URLSearchParams({ artist: r.artist, title: r.title });
          img.src = `${base}/api/cover?${q}`;
          return;
        }
        img.remove();
      };
      img.src = thumb;
      cell.appendChild(img);
    }
    mini.appendChild(cell);
  }
  cover.appendChild(mini);
  cover.appendChild(el("span", "morecount", `+${rest.length}`));
  box.appendChild(cover);
  return box;
}

/* ---------- 小组件:音乐快讯 / 风格介绍(只在新标签页存在对应节点) ---------- */

/* ---------- 风格卡片:抽签 + 左右翻 ---------- */

async function readGenreSeen() {
  try {
    const v = (await chrome.storage.local.get("genreSeen")).genreSeen;
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 看过的记进本地:抽签只从没看过的里挑,整库看完就清空重来。 */
function rememberGenre(state, id) {
  const next = [...state.genreSeen.filter((x) => x !== id), id];
  state.genreSeen = next.length >= state.genres.length ? [] : next;
  void chrome.storage.local.set({ genreSeen: state.genreSeen });
}

function paintGenre(state) {
  const g = state.genreTrail?.[state.genreAt];
  if (!g) return;
  const t = state.t;
  const zh = state.lang === "zh";
  const set = (id, text) => {
    const n = document.getElementById(id);
    if (n) n.textContent = text;
  };
  set("genrehead", t.genreHead);
  set("genrename", zh && g.zh !== g.en ? `${g.zh} · ${g.en}` : g.en);
  set("genrewhere", zh ? g.whereZh : g.whereEn);
  const desc = zh ? g.zhDesc : g.enDesc;
  const descNode = document.getElementById("genredesc");
  if (descNode) {
    descNode.textContent = desc;
    descNode.title = desc; // 卡片只放三行,悬停看全文
  }
  set("genrekey", g.key ? `${t.genreKey} · ${g.key}` : "");
  const prev = document.getElementById("genreprev");
  const next = document.getElementById("genrenext");
  if (prev) {
    prev.disabled = state.genreAt <= 0;
    prev.title = t.genrePrev;
  }
  if (next) next.title = t.genreNext;
}

/** 往前翻已经看过的那几条,翻到头再抽新的。 */
function advanceGenre(state) {
  if (state.genreAt < state.genreTrail.length - 1) {
    state.genreAt += 1;
    paintGenre(state);
    return;
  }
  const g = pickGenre(state.genres, state.genreSeen);
  if (!g) return;
  state.genreTrail.push(g);
  state.genreAt = state.genreTrail.length - 1;
  rememberGenre(state, g.id);
  paintGenre(state);
}

async function initGenreCard(state) {
  const box = document.getElementById("genrew");
  if (!box) return;
  const [genres, seen] = await Promise.all([loadGenres(), readGenreSeen()]);
  state.genres = genres;
  if (!genres.length) {
    box.hidden = true; // 数据没加载上就别摆空卡片
    return;
  }
  state.genreSeen = seen;
  state.genreTrail = [];
  state.genreAt = -1;
  advanceGenre(state);
  document.getElementById("genrenext")?.addEventListener("click", () => advanceGenre(state));
  document.getElementById("genreprev")?.addEventListener("click", () => {
    if (state.genreAt <= 0) return;
    state.genreAt -= 1;
    paintGenre(state);
  });
}

async function loadNews(state) {
  const list = document.getElementById("newslist");
  if (!list) return;
  try {
    const cached = (await chrome.storage.local.get("newsCache")).newsCache;
    let items = cached && Date.now() - cached.t < 30 * 60000 ? cached.items : null;
    if (!items) {
      const r = await fetch("https://pitchfork.com/feed/feed-news/rss", { signal: AbortSignal.timeout(9000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const xml = new DOMParser().parseFromString(await r.text(), "text/xml");
      items = [...xml.querySelectorAll("item")]
        .slice(0, 4)
        .map((it) => ({
          title: it.querySelector("title")?.textContent?.trim() ?? "",
          link: it.querySelector("link")?.textContent?.trim() ?? "#",
        }))
        .filter((x) => x.title);
      if (!items.length) throw new Error("empty feed");
      void chrome.storage.local.set({ newsCache: { t: Date.now(), items } });
    }
    list.replaceChildren(
      ...items.map((x) => {
        const li = el("li");
        const a = el("a", "", x.title);
        a.href = x.link;
        a.target = "_blank";
        a.rel = "noreferrer";
        li.appendChild(a);
        return li;
      }),
    );
  } catch {
    list.replaceChildren(el("li", "newsdim", state.t.newsFail));
  }
}

/** 界面框架文案按语言刷新(存在哪个节点就翻哪个,新标签页与弹窗结构略有差异)。 */
function applyStaticLang(t) {
  document.documentElement.lang = t.htmlLang;
  if (document.body.classList.contains("newtab")) document.title = "VprGrid";
  const set = (id, fn) => {
    const n = document.getElementById(id);
    if (n) fn(n);
  };
  set("pagetitle", (n) => (n.textContent = t.heading));
  set("q", (n) => (n.placeholder = t.search));
  set("searchvia", (n) => (n.textContent = t.searchVia));
  set("grainmonth", (n) => {
    n.textContent = t.grainMonth;
    n.title = t.grainMonthTitle;
  });
  set("grainweek", (n) => {
    n.textContent = t.grainWeek;
    n.title = t.grainWeekTitle;
  });
  set("ftleft", (n) => (n.textContent = t.footerLeft));
  set("openapp", (n) => (n.textContent = t.footerApp));
  set("ftsettings", (n) => (n.textContent = t.footerSettings));
  set("today", (n) => {
    n.textContent = t.btnToday;
    n.title = t.btnTodayTitle;
  });
  set("reload", (n) => {
    n.textContent = t.btnReload;
    n.title = t.btnReloadTitle;
  });
  set("newshead", (n) => (n.textContent = t.newsHead));
  set("statshead", (n) => (n.textContent = t.statsHead));
  set("statreflab", (n) => (n.textContent = t.statRefLab));
  set("statpoollab", (n) => (n.textContent = t.statPoolLab));
  set("statpasslab", (n) => (n.textContent = t.statPassLab));
  set("statlinelab", (n) => (n.textContent = t.statLineLab));
  set("genrehead", (n) => (n.textContent = t.genreHead));
  set("genreprev", (n) => {
    n.title = t.genrePrev;
    n.setAttribute("aria-label", t.genrePrev);
  });
  set("genrenext", (n) => {
    n.title = t.genreNext;
    n.setAttribute("aria-label", t.genreNext);
  });
  set("wallsize", (n) => (n.title = t.sizeTitle));
  set("wallhsize", (n) => (n.title = t.sizeHTitle));
  set("wallpos", (n) => (n.title = t.sizeYTitle));
  set("wallstretch", (n) => (n.title = t.sizeSTitle));
  set("coverwsize", (n) => (n.title = t.sizeCwTitle));
  set("resetlayout", (n) => (n.title = t.resetLayoutTitle));
  set("resetlayoutlabel", (n) => (n.textContent = t.resetLayout));
  set("langtoggle", (n) => {
    n.title = t.langTitle;
    n.textContent = t.langBtn;
  });
  set("appdown-title", (n) => (n.textContent = t.appDownTitle));
  set("appdown-body", (n) => (n.textContent = t.appDownBody));
  set("appdown-retry", (n) => (n.textContent = t.appDownRetry));
  set("appdown-wall", (n) => (n.textContent = t.appDownWall));
  set("appdown-settings", (n) => (n.textContent = t.appDownSettings));
}

function applyGrainChrome(state) {
  const t = state.t;
  const month = state.grain === "month";
  const monthBtn = document.getElementById("grainmonth");
  const weekBtn = document.getElementById("grainweek");
  if (monthBtn) {
    monthBtn.textContent = t.grainMonth;
    monthBtn.title = t.grainMonthTitle;
    monthBtn.classList.toggle("on", month);
  }
  if (weekBtn) {
    weekBtn.textContent = t.grainWeek;
    weekBtn.title = t.grainWeekTitle;
    weekBtn.classList.toggle("on", !month);
  }
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  if (prev) prev.setAttribute("aria-label", month ? t.prevMonth : t.prev);
  if (next) next.setAttribute("aria-label", month ? t.nextMonth : t.next);
  const today = document.getElementById("today");
  if (today) {
    today.textContent = month ? t.btnThisMonth : t.btnToday;
    today.title = month ? t.btnThisMonthTitle : t.btnTodayTitle;
  }
}

function fillModeBtn(node, icon, label) {
  node.replaceChildren();
  const ico = el("span", "modeico", icon);
  node.appendChild(ico);
  if (label) node.appendChild(el("span", "modelabel", label));
}

/* ---------- 入口 ---------- */

export async function initRadar() {
  const settings = await getSettings();
  let { sync, lang, wallW, wallH, wallY, wallS, coverW, grain } = settings;
  const wallSnap = sync?.wall;
  if (wallSnap?.grain === "week" || wallSnap?.grain === "month") grain = wallSnap.grain;
  let base = settings.base || DEFAULT_BASE;
  const state = {
    base,
    sync,
    grain,
    week: mondayOfIso(String(wallSnap?.week || "").slice(0, 10)) || mondayOfToday(),
    ym: /^\d{4}-\d{2}/.test(String(wallSnap?.start || "")) ? String(wallSnap.start).slice(0, 7) : ymOfToday(),
    lang,
    t: I18N[lang],
    wallW,
    wallH,
    wallY,
    wallS,
    coverW,
  };

  // 秒开:先铺同步码里的墙快照,探活 / 直连同步都在这之后——点图标立刻有封面
  applySyncTheme(state.sync?.theme);
  applyStaticLang(state.t);
  applyGrainChrome(state);
  document.getElementById("weeklabel").textContent = periodLabel(state);
  const snap0 = wallToRadarData(state.sync, state);
  if (snap0) {
    renderWall(state, snap0);
    state._shownPeriod = periodOf(state).key;
  } else {
    try {
      const cached = await readPeriodWall(periodOf(state).key, filterSig(state));
      if (cached) {
        renderWall(state, cached);
        state._shownPeriod = periodOf(state).key;
      }
    } catch {
      /* 预画失败无妨,loadWeek 会正常铺骨架 */
    }
  }

  try {
    chrome.runtime.sendMessage({ type: "poll-ref-jobs" });
  } catch {
    /* 后台未就绪时下一次闹钟会补 */
  }

  // 主路径:直连应用拉最新同步(免复制);拉不到用已保存的同步码
  const liveAtOpen = await resolveLiveBase(base);
  if (liveAtOpen) {
    base = liveAtOpen;
    state.base = liveAtOpen;
    void chrome.storage.local.set({ appBase: base });
  }
  const direct = await fetchDirectSync(base);
  if (direct) {
    state.sync = direct;
    applySyncTheme(state.sync?.theme);
    adoptWallPeriod(state, direct.wall);
    applyGrainChrome(state);
    document.getElementById("weeklabel").textContent = periodLabel(state);
  }

  // 小组件 + 墙宽(只在新标签页有对应节点)
  renderStats(state, state._statsData);
  void initGenreCard(state);
  void loadNews(state);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const wallLimits = () => {
    const vw = window.innerWidth || 1200;
    const vh = window.innerHeight || 800;
    return {
      // 宽度下限守住 760px:再窄封面条就挤成一团(窗口本身很窄时才跟着让步)
      wMin: Math.min(760, Math.round(vw * 0.9)),
      wMax: Math.min(1080, Math.round(vw * 0.92)),
      // 上下移动只在小幅内微调,别把墙推到搜索栏上或掉出视口
      yMin: -Math.round(Math.min(44, vh * 0.05)),
      yMax: Math.round(Math.min(88, vh * 0.1)),
      sMin: 0,
      sMax: Math.round(Math.min(220, vh * 0.22)),
      hMin: 96,
      hMax: 176,
    };
  };
  const DEFAULT_LAYOUT = { wallW: 920, wallH: 128, wallY: 0, wallS: 0, coverW: 0 };
  const persistWall = () => {
    void chrome.storage.local.set({
      wallW: state.wallW,
      wallH: state.wallH,
      wallY: state.wallY,
      wallS: state.wallS,
    });
  };
  const applyWallBox = () => {
    if (!document.body.classList.contains("newtab")) return;
    const lim = wallLimits();
    const prefW = Number(state.wallW) || 920;
    const prefH = Number(state.wallH) || 128;
    const prefY = Number(state.wallY) || 0;
    const prefS = Number(state.wallS) || 0;
    // 记住用户偏好宽度;窗口缩小只限制显示,放大后回到偏好,不把小窗口尺寸写死
    const shownW = clamp(prefW, lim.wMin, lim.wMax);
    const shownH = clamp(prefH, lim.hMin, lim.hMax);
    const shownY = clamp(prefY, lim.yMin, lim.yMax);
    const shownS = clamp(prefS, lim.sMin, lim.sMax);
    document.body.style.setProperty("--wall-w", `${shownW}px`);
    document.body.style.setProperty("--wall-h", `${shownH}px`);
    document.body.style.setProperty("--wall-y", `${shownY}px`);
    document.body.style.setProperty("--wall-s", `${shownS}px`);
    const tune = (id, min, max) => {
      const n = document.getElementById(id);
      if (!n) return;
      n.min = String(min);
      n.max = String(max);
    };
    tune("wallsize", lim.wMin, lim.wMax);
    tune("wallhsize", lim.hMin, lim.hMax);
    tune("wallpos", lim.yMin, lim.yMax);
    tune("wallstretch", lim.sMin, lim.sMax);
    const sync = (id, v) => {
      const n = document.getElementById(id);
      if (n) n.value = String(Math.round(v));
    };
    sync("wallsize", shownW);
    sync("wallhsize", shownH);
    sync("wallpos", shownY);
    sync("wallstretch", shownS);
  };
  const wireBoxSizer = (id, key) => {
    const s = document.getElementById(id);
    if (!s) return;
    let pending = 0;
    s.addEventListener("input", () => {
      state[key] = Number(s.value);
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        applyWallBox();
      });
    });
    s.addEventListener("change", persistWall);
  };
  applyWallBox();
  wireBoxSizer("wallsize", "wallW");
  wireBoxSizer("wallhsize", "wallH");
  wireBoxSizer("wallpos", "wallY");
  wireBoxSizer("wallstretch", "wallS");
  document.getElementById("resetlayout")?.addEventListener("click", () => {
    Object.assign(state, DEFAULT_LAYOUT);
    document.body.style.removeProperty("--cover-w");
    const cw = document.getElementById("coverwsize");
    if (cw) cw.value = String(DEFAULT_LAYOUT.wallH);
    applyWallBox();
    void chrome.storage.local.set(DEFAULT_LAYOUT);
  });
  {
    const box = document.getElementById("wallbox");
    if (box && document.body.classList.contains("newtab")) {
      const begin = (mode, ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        const startX = ev.clientX;
        const startY = ev.clientY;
        const lim0 = wallLimits();
        const startW = clamp(Number(state.wallW) || 920, lim0.wMin, lim0.wMax);
        const startS = clamp(Number(state.wallS) || 0, lim0.sMin, lim0.sMax);
        const startPos = clamp(Number(state.wallY) || 0, lim0.yMin, lim0.yMax);
        document.body.classList.add("wall-dragging");
        const move = (e) => {
          // 拖到边界就停住,不让宽度/位置越界后再被显示端悄悄夹回来
          if (mode === "e") state.wallW = clamp(startW + (e.clientX - startX), lim0.wMin, lim0.wMax);
          else if (mode === "w") state.wallW = clamp(startW - (e.clientX - startX), lim0.wMin, lim0.wMax);
          else if (mode === "s") state.wallS = clamp(startS + (e.clientY - startY), lim0.sMin, lim0.sMax);
          else state.wallY = clamp(startPos + (e.clientY - startY), lim0.yMin, lim0.yMax);
          applyWallBox();
        };
        const end = () => {
          document.body.classList.remove("wall-dragging");
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          persistWall();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
      };
      box.querySelectorAll("[data-wall]").forEach((h) => {
        h.addEventListener("pointerdown", (ev) => begin(h.getAttribute("data-wall"), ev));
      });
      document.querySelector(".wallhead")?.addEventListener("pointerdown", (ev) => {
        if (ev.target.closest("button, a, input, .grainseg")) return;
        begin("move", ev);
      });
      window.addEventListener("resize", () => applyWallBox());
    }
  }
  // 封面宽度:0 = 不设变量,宽度回落到墙高(正方形);拖动后固定为像素值
  {
    const s = document.getElementById("coverwsize");
    if (s) {
      const apply = (v) => {
        if (v > 0) document.body.style.setProperty("--cover-w", `${v}px`);
        else document.body.style.removeProperty("--cover-w");
      };
      s.value = String(coverW > 0 ? coverW : wallH);
      apply(coverW);
      let pending = 0;
      s.addEventListener("input", () => {
        if (pending) return;
        pending = requestAnimationFrame(() => {
          pending = 0;
          apply(Number(s.value));
        });
      });
      s.addEventListener("change", () => void chrome.storage.local.set({ coverW: Number(s.value) }));
    }
  }

  wireWebSearch();

  const openAppLink = document.getElementById("openapp");
  if (openAppLink) {
    openAppLink.href = base;
    openAppLink.addEventListener("click", (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
      ev.preventDefault();
      openFullApp(state.base || base);
    });
  }
  document.getElementById("prev").addEventListener("click", () => {
    if (state.grain === "month") state.ym = addMonths(state.ym, -1);
    else state.week = shiftWeek(state.week, -1);
    void loadWeek(state);
  });
  document.getElementById("next").addEventListener("click", () => {
    if (state.grain === "month") state.ym = addMonths(state.ym, 1);
    else state.week = shiftWeek(state.week, 1);
    void loadWeek(state);
  });
  // 大框功能条:跳回本期 / 重新拉取(节点只在新标签页存在)
  document.getElementById("today")?.addEventListener("click", () => {
    if (state.grain === "month") state.ym = ymOfToday();
    else state.week = mondayOfToday();
    void loadWeek(state);
  });
  const setGrain = (next) => {
    if (state.grain === next) return;
    state.grain = next;
    void chrome.storage.local.set({ wallGrain: next });
    applyGrainChrome(state);
    void loadWeek(state);
  };
  document.getElementById("grainmonth")?.addEventListener("click", () => setGrain("month"));
  document.getElementById("grainweek")?.addEventListener("click", () => setGrain("week"));
  document.getElementById("reload")?.addEventListener("click", () => {
    void loadWeek(state, { force: true });
  });

  // 完整应用:探测成功后整页打开,失败只出说明层,绝不嵌死地址
  const frame = document.getElementById("appframe");
  const toggle = document.getElementById("modetoggle");
  const down = document.getElementById("appdown");
  const refreshModeBtn = () => {
    if (!toggle) return;
    const app = document.body.classList.contains("appmode");
    toggle.title = app ? state.t.modeWallTitle : state.t.modeAppTitle;
    fillModeBtn(toggle, app ? state.t.modeWallIcon : state.t.modeAppIcon, app ? state.t.modeWall : state.t.modeApp);
  };
  const showAppDown = (noBase) => {
    if (!down) return;
    const title = document.getElementById("appdown-title");
    const body = document.getElementById("appdown-body");
    if (title) title.textContent = state.t.appDownTitle;
    if (body) body.textContent = noBase ? state.t.appDownNoBase : state.t.appDownBody;
    down.hidden = false;
  };
  const hideAppDown = () => {
    if (down) down.hidden = true;
  };
  const adoptBase = (url) => {
    const next = tidyBase(url);
    if (!next) return;
    base = next;
    state.base = next;
    void chrome.storage.local.set({ appBase: next });
  };
  const keepAppReady = async () => {
    const live = await resolveLiveBase(state.base || DEFAULT_BASE);
    if (!live) return false;
    adoptBase(live);
    return true;
  };
  const openFullApp = (url) => {
    const dest = tidyBase(url);
    if (!dest) return;
    // 完整应用已经开着:切到那个标签,不要把新标签页再导航进一遍口味选择
    const jump = () => {
      if (document.body.classList.contains("popup") && chrome.tabs?.create) {
        chrome.tabs.create({ url: dest });
        return;
      }
      location.assign(dest);
    };
    if (chrome.tabs?.query && chrome.tabs?.update) {
      chrome.tabs.query({}, (tabs) => {
        const hit = (tabs || []).find((t) => tabMatchesApp(t.url, dest));
        if (hit?.id) {
          chrome.tabs.update(hit.id, { active: true });
          if (hit.windowId && chrome.windows?.update) chrome.windows.update(hit.windowId, { focused: true });
          return;
        }
        jump();
      });
      return;
    }
    jump();
  };
  if (toggle) {
    if (frame) {
      frame.hidden = true;
      frame.removeAttribute("src");
    }
    const setMode = async (mode) => {
      const app = mode === "app";
      if (!app) {
        document.body.classList.remove("appmode");
        hideAppDown();
        if (frame) {
          frame.hidden = true;
          frame.removeAttribute("src");
        }
        refreshModeBtn();
        return;
      }
      let ok = await keepAppReady();
      if (!ok) {
        await new Promise((r) => setTimeout(r, 600));
        ok = await keepAppReady();
      }
      if (!ok) {
        document.body.classList.add("appmode");
        if (frame) {
          frame.hidden = true;
          frame.removeAttribute("src");
        }
        showAppDown(!tidyBase(state.base || base));
        refreshModeBtn();
        return;
      }
      hideAppDown();
      document.body.classList.remove("appmode");
      refreshModeBtn();
      openFullApp(state.base);
    };
    toggle.addEventListener("click", () => {
      if (document.body.classList.contains("appmode")) {
        void setMode("wall");
        return;
      }
      void setMode("app");
    });
    document.getElementById("appdown-retry")?.addEventListener("click", () => {
      void setMode("app");
    });
    document.getElementById("appdown-wall")?.addEventListener("click", () => {
      void setMode("wall");
    });
  }

  // 中英文切换(记住选择)
  const langBtn = document.getElementById("langtoggle");
  if (langBtn) {
    langBtn.addEventListener("click", () => {
      state.lang = state.lang === "zh" ? "en" : "zh";
      state.t = I18N[state.lang];
      void chrome.storage.local.set({ extLang: state.lang });
      applyStaticLang(state.t);
      applyGrainChrome(state);
      paintGenre(state);
      renderStats(state, state._statsData);
      refreshModeBtn();
      void loadWeek(state);
    });
  }

  await loadWeek(state);

  // 完整应用改过滤 / 当周名单后,新标签页跟着刷新,避免各算各的
  let lastSig = wallSig(state.sync);
  let pulling = false;
  const pullLatest = async () => {
    if (pulling) return;
    pulling = true;
    try {
      let next = await fetchDirectSync(state.base);
      if (!next) {
        const live = await resolveLiveBase(state.base || DEFAULT_BASE);
        if (live) {
          state.base = live;
          void chrome.storage.local.set({ appBase: live });
          next = await fetchDirectSync(live);
        }
      }
      if (next) {
        state.sync = next;
        applySyncTheme(state.sync?.theme);
      }
      if (state._waiting) {
        if (!state._loadBusy) void loadWeek(state);
        return;
      }
      if (!next) return;
      const snap = wallToRadarData(next, state);
      if (!snap) return;
      const sig = wallSig(next);
      if (!sig || sig === lastSig) return;
      lastSig = sig;
      if (listIdent(snap) === state._wallIdent) return;
      void loadWeek(state);
    } finally {
      pulling = false;
    }
  };
  setInterval(() => void pullLatest(), 2500);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void pullLatest();
  });
}
