/**
 * 公开 HTML / wikitext 解析:RYM 年榜(Internet Archive 快照)与维基「某年专辑列表」。
 * 不打 Cloudflare,不解析登录墙后的直播站。
 */

/**
 * @typedef {"Album" | "EP"} ReleaseKind
 * @typedef {{ source: "rym" | "wiki", artist: string, title: string, date: string, type: ReleaseKind, userScore: number | null, cover: string | null, url: string, tags: string[] }} PublicRelease
 */

/** @type {Record<string, number>} */
const MONTH_NUM = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** @param {string} s */
export function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** @param {string} s */
export function cleanText(s) {
  return decodeEntities(String(s ?? ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {string} raw */
export function isoFromRymDate(raw) {
  const m = String(raw ?? "").match(
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})/i,
  );
  if (!m) return null;
  const mon = MONTH_NUM[m[2].toLowerCase()];
  const day = Number(m[1]);
  if (!mon || !day) return null;
  return `${m[3]}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** @param {string} href @param {string} origin */
function absUrl(href, origin) {
  if (!href) return "";
  try {
    return new URL(href, origin).toString();
  } catch {
    return href;
  }
}

/** @param {string} src */
function absCover(src) {
  if (!src) return null;
  const s = src.trim().split(/\s+/)[0];
  if (!s || s.startsWith("data:")) return null;
  if (s.startsWith("//")) return `https:${s}`;
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

/**
 * 按 RYM 图表 item 块解析艺人 / 专辑 / 日期 / 封面 / 评分 / 风格。
 * @param {string} html
 * @param {string} [pageUrl]
 * @returns {PublicRelease[]}
 */
export function parseRymChartHtml(html, pageUrl = "https://rateyourmusic.com/") {
  const text = String(html ?? "");
  if (!text || /just a moment|attention required/i.test(text.slice(0, 2000))) return [];
  // 封面在 title 之前:按 image_link 切,保证封面与同一张专绑定
  const chunks = text.split(/page_charts_section_charts_item_image_link"/);
  const byKey = new Map();
  for (const chunk of chunks.slice(1)) {
    const rel = chunk.match(/href="(\/release\/(album|ep)\/[^"]+)"/i);
    if (!rel) continue;
    const originals = [...chunk.matchAll(/ui_name_locale_original">([^<]+)</g)].map((m) => cleanText(m[1]));
    const title = originals[0] || cleanText((chunk.match(/class="[^"]*release[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ?? [])[1]);
    const artist =
      originals[1] ||
      cleanText((chunk.match(/class="artist"[^>]*>[\s\S]*?ui_name_locale_original">([^<]+)/i) ?? [])[1]) ||
      cleanText((chunk.match(/class="artist"[^>]*>([\s\S]*?)<\/a>/i) ?? [])[1]);
    if (!artist || !title) continue;
    const date = isoFromRymDate(chunk);
    if (!date) continue;
    const typeMatch = chunk.match(/page_charts_section_charts_item_release_type">\s*(Album|EP)/i);
    const type = /ep/i.test(rel[2] ?? "") || /ep/i.test(typeMatch?.[1] ?? "") ? "EP" : "Album";
    const jpeg = chunk.match(/\/\/e\.snmc\.io\/i\/300\/s\/[^"' \n]+?\.(?:jpeg|jpg|png)/i);
    const anyCover = chunk.match(/\/\/e\.snmc\.io\/i\/[^"' \n]+?\.(?:jpeg|jpg|png|webp)/i);
    const avg = chunk.match(/page_charts_section_charts_item_details_average_num">\s*([\d.]+)/);
    const score = avg ? Number(avg[1]) : NaN;
    const tags = [...chunk.matchAll(/class="genre[^"]*"[^>]*>([^<]+)/g)]
      .map((m) => cleanText(m[1]))
      .filter(Boolean);
    const key = `${artist.toLowerCase()}|${title.toLowerCase()}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      source: "rym",
      artist,
      title,
      date,
      type,
      userScore: Number.isFinite(score) && score > 0 ? Math.round(score * 20) : null,
      cover: absCover(jpeg?.[0] ?? anyCover?.[0] ?? ""),
      url: absUrl(rel[1], pageUrl),
      tags,
    });
  }
  return [...byKey.values()];
}

/** @param {string} s */
function stripTemplates(s) {
  let prev = "";
  let out = String(s ?? "");
  while (out !== prev) {
    prev = out;
    out = out.replace(/\{\{[^{}]*\}\}/g, "");
  }
  return out;
}

/** @param {string} raw */
function wikiPlain(raw) {
  return decodeEntities(
    stripTemplates(
      String(raw ?? "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "")
        .replace(/<ref\b[^>]*\/>/gi, ""),
    ),
  )
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} raw
 * @param {string|number} year
 * @returns {string | { day: number } | null}
 */
export function isoFromWikiDate(raw, year) {
  const s = wikiPlain(raw);
  const named = s.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*,?\s*(20\d{2}))?/i,
  );
  if (named) {
    const mon = MONTH_NUM[named[1].toLowerCase()];
    const day = Number(named[2]);
    const y = named[3] || year;
    if (mon && day) return `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const dayOnly = s.match(/^(\d{1,2})$/);
  if (dayOnly) return { day: Number(dayOnly[1]) };
  return null;
}

/** @type {Record<string, number>} */
const MONTH_HEAD = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/** @param {string} wt @param {string} monthName */
function sectionWikitext(wt, monthName) {
  const re = new RegExp(`^={2,4}\\s*${monthName}\\s*={2,4}`, "im");
  const start = wt.search(re);
  if (start < 0) return "";
  const rest = wt.slice(start);
  const next = rest.slice(monthName.length + 4).search(/^={2,4}[^=\n].*={2,4}\s*$/m);
  if (next < 0) return rest;
  return rest.slice(0, monthName.length + 4 + next);
}

/**
 * 解析维基 List of {year} albums 的指定月份表格。
 * @param {string} wikitext
 * @param {string|number} year
 * @param {string[]} [monthNames]
 * @returns {PublicRelease[]}
 */
export function parseWikiAlbumList(wikitext, year, monthNames) {
  const wt = String(wikitext ?? "");
  const y = String(year);
  const months = monthNames?.length ? monthNames : Object.keys(MONTH_HEAD);
  const byKey = new Map();
  for (const name of months) {
    const mon = MONTH_HEAD[name.toLowerCase()];
    if (!mon) continue;
    const section = sectionWikitext(wt, name);
    if (!section) continue;
    const rows = section.split(/\n\|-[^\n]*/).slice(1);
    let lastDay = 0;
    for (const row of rows) {
      const cells = row
        .split(/\n/)
        .map(/** @param {string} l */ (l) => l.trim())
        .filter(/** @param {string} l */ (l) => /^[|!]/.test(l))
        .map(/** @param {string} l */ (l) => l.replace(/^[|!]\s*/, "").replace(/^scope="row"[^|]*\|\s*/i, ""));
      if (cells.length < 2) continue;
      const looksHeader = /Release date|Artist|Album/i.test(cells.join(" "));
      if (looksHeader && /Release date/i.test(cells[0])) continue;
      let dateCell = "";
      let artistCell = "";
      let albumCell = "";
      let genreCell = "";
      const firstPlain = wikiPlain(cells[0]);
      const hasMonth = new RegExp(name, "i").test(firstPlain) || /rowspan/i.test(cells[0]);
      if (hasMonth || /^(January|February|March|April|May|June|July|August|September|October|November|December|\d{1,2})/i.test(firstPlain)) {
        dateCell = cells[0];
        artistCell = cells[1] ?? "";
        albumCell = cells[2] ?? "";
        genreCell = cells[3] ?? "";
      } else {
        artistCell = cells[0];
        albumCell = cells[1] ?? "";
        genreCell = cells[2] ?? "";
      }
      const parsed = isoFromWikiDate(dateCell, y);
      if (typeof parsed === "string") {
        lastDay = Number(parsed.slice(8, 10));
      } else if (parsed && parsed.day) {
        lastDay = parsed.day;
      }
      if (!lastDay) continue;
      const artist = wikiPlain(artistCell);
      const title = wikiPlain(albumCell);
      if (!artist || !title) continue;
      if (/^tba$|^tbd$|^various artists?$/i.test(title)) continue;
      if (/^tba$|^tbd$/i.test(artist)) continue;
      const date = `${y}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const tags = wikiPlain(genreCell)
        .split(/[,/]/)
        .map((s) => s.trim())
        .filter((s) => s && s.length < 40);
      const key = `${artist.toLowerCase()}|${title.toLowerCase()}`;
      if (byKey.has(key)) continue;
      const q = encodeURIComponent(`${artist} ${title}`.trim());
      byKey.set(key, {
        source: "wiki",
        artist,
        title,
        date,
        type: /ep\b|mini-?album|mini album/i.test(title + " " + genreCell) ? "EP" : "Album",
        userScore: null,
        cover: null,
        url: `https://rateyourmusic.com/search?searchterm=${q}&searchtype=l`,
        tags,
      });
    }
  }
  return [...byKey.values()];
}

/** @param {string} isoDate */
export function nearbyWikiMonths(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const cur = d.getUTCMonth();
  const prev = (cur + 11) % 12;
  const next = (cur + 1) % 12;
  return [names[prev], names[cur], names[next]];
}
