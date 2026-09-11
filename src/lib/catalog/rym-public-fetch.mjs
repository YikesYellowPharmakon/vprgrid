/**
 * 无登录公开源:Internet Archive 上的 RYM 年榜快照 + 维基本年专辑表。
 * 不请求 rateyourmusic.com 直播域(会被 Cloudflare 拦)。
 */
import { nearbyWikiMonths, parseRymChartHtml, parseWikiAlbumList } from "./parse-web-releases.mjs";

const UA = "VprGrid.SYS/1.0 (non-commercial music research; weekly new-release radar)";

/** 已确认可拉到完整 HTML 的 Wayback 时间戳(2026 年榜,约 2026-06-27)。 */
const RYM_YEAR_SNAPSHOTS = ["20260627000534", "20260501000000", "20260215000000"];

/**
 * @param {string} url
 * @param {number} ms
 * @param {Record<string, string>} [headers]
 */
async function getText(url, ms, headers = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/json,*/*;q=0.8", ...headers },
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

/**
 * @param {string} url
 * @param {number} ms
 */
async function getJson(url, ms) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/**
 * @param {string} original
 */
async function latestWaybackTs(original) {
  try {
    const rows = await getJson(
      `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(original)}&output=json&fl=timestamp,statuscode,length&filter=statuscode:200&limit=8`,
      8000,
    );
    if (!Array.isArray(rows) || rows.length < 2) return null;
    let best = null;
    let bestLen = 0;
    for (const row of rows.slice(1)) {
      const ts = String(row[0] ?? "");
      const len = Number(row[2] ?? 0);
      if (ts.length >= 14 && len > bestLen) {
        best = ts;
        bestLen = len;
      }
    }
    return best;
  } catch {
    return null;
  }
}

/** @param {string} ts @param {string} original */
function waybackId(ts, original) {
  return `https://web.archive.org/web/${ts}id_/${original}`;
}

/**
 * @param {string} year
 */
async function fetchRymArchive(year) {
  const original = `https://rateyourmusic.com/charts/top/album/${year}/`;
  const stamps = [];
  const latest = await latestWaybackTs(original);
  if (latest) stamps.push(latest);
  for (const ts of RYM_YEAR_SNAPSHOTS) {
    if (!stamps.includes(ts)) stamps.push(ts);
  }
  for (const ts of stamps) {
    try {
      const html = await getText(waybackId(ts, original), 18000);
      const items = parseRymChartHtml(html, original);
      if (items.length > 0) return items;
    } catch {
      // 换下一个时间戳
    }
  }
  return [];
}

/**
 * @param {string} year
 * @param {string} todayIso
 */
async function fetchWikiAlbums(year, todayIso) {
  const page = `List_of_${year}_albums`;
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&redirects=1`;
  const raw = await getJson(url, 15000);
  const wt = raw?.parse?.wikitext?.["*"];
  if (typeof wt !== "string" || wt.length < 200) return [];
  return parseWikiAlbumList(wt, year, nearbyWikiMonths(todayIso));
}

/**
 * @param {Date} [now]
 */
export async function collectPublicReleases(now = new Date()) {
  const todayIso = now.toISOString().slice(0, 10);
  const year = todayIso.slice(0, 4);
  const [rymSettled, wikiSettled] = await Promise.allSettled([
    fetchRymArchive(year),
    fetchWikiAlbums(year, todayIso),
  ]);
  const rym = rymSettled.status === "fulfilled" ? rymSettled.value : [];
  const wiki = wikiSettled.status === "fulfilled" ? wikiSettled.value : [];
  const map = new Map();
  for (const it of [...rym, ...wiki]) {
    const key = `${it.source}|${it.artist.toLowerCase()}|${it.title.toLowerCase()}`;
    if (!map.has(key)) map.set(key, it);
  }
  return {
    todayIso,
    rym: rym.length,
    wiki: wiki.length,
    items: [...map.values()],
  };
}
