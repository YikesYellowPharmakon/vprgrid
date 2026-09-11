/**
 * 参考订阅源的服务端导入器:
 *   - importArtistRef:输入艺人名 → MusicBrainz 全量分页拉取其专辑/EP(艺人追踪源);
 *   - importRss:解析 RSS/Atom feed(博客、榜单),全量条目;
 *   - importBandcamp:Bandcamp 艺人/厂牌页与专辑页(公开网格 + 页面数据);
 *   - importWebList:RYM / AOTY 列表页服务端直抓尝试(含翻页),被 Cloudflare 拦截时
 *     返回明确错误,引导走浏览器插件一键导入或粘贴兜底;
 *   - importApple:Apple Music 公开歌单(页面数据 + iTunes Lookup),一曲收成所属专辑并去重。
 * 所有导入都以「专辑为单位」去重,输出 ImportItem[],客户端转 GoldEntry。
 */
import { createServerFn } from "@tanstack/react-start";
import type { ImportItem } from "./sources";

const UA = "GRAIN-weekly-radar/1.0 (album radar; contact: none)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getJson(url: string, timeout = 15000): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function mbJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const body = await getJson(url);
      if (body && typeof body === "object" && "error" in (body as Record<string, unknown>)) throw new Error("busy");
      return body;
    } catch (err) {
      if (attempt >= 1) throw err;
      await sleep(1200);
    }
  }
}

type Ok = { ok: true; label: string; detail: string; items: ImportItem[] };
type Err = { ok: false; error: string };

/* ————————————— 艺人追踪:MusicBrainz 全量分页 ————————————— */

type MbReleaseGroup = {
  id: string;
  title: string;
  "first-release-date"?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
};

const MAX_RG = 600;

export const importArtistRef = createServerFn({ method: "POST" })
  .validator((d: { artist: string }) => d)
  .handler(async ({ data }): Promise<Ok | Err> => {
    const q = data.artist.trim();
    if (!q) return { ok: false, error: "请输入艺人名" };
    try {
      const phrase = q.replace(/"/g, '\\"');
      const found = (await mbJson(
        `https://musicbrainz.org/ws/2/artist/?query=artist:"${encodeURIComponent(phrase)}"&fmt=json&limit=5`,
      )) as { artists?: Array<{ id: string; name: string; score?: number; disambiguation?: string }> };
      const artists = found.artists ?? [];
      const exact = artists.filter((a) => a.name.toLowerCase() === q.toLowerCase());
      const artist = (exact.length ? exact : artists.filter((a) => (a.score ?? 0) >= 90))[0];
      if (!artist) return { ok: false, error: `MusicBrainz 里没有找到「${q}」,检查拼写或改用粘贴导入` };

      // 全量分页:每页 100,直到取完(上限 600,防走带)
      const items: ImportItem[] = [];
      for (let offset = 0; offset < MAX_RG; offset += 100) {
        const page = (await mbJson(
          `https://musicbrainz.org/ws/2/release-group?artist=${artist.id}&fmt=json&limit=100&offset=${offset}`,
        )) as { "release-groups"?: MbReleaseGroup[]; "release-group-count"?: number };
        const rgs = page["release-groups"] ?? [];
        for (const rg of rgs) {
          const pt = rg["primary-type"];
          if (pt !== "Album" && pt !== "EP") continue;
          if ((rg["secondary-types"] ?? []).includes("Compilation")) continue;
          items.push({
            artist: artist.name,
            title: rg.title,
            date: rg["first-release-date"] || undefined,
            pic: `https://coverartarchive.org/release-group/${rg.id}/front-250`,
          });
        }
        const total = page["release-group-count"] ?? 0;
        if (offset + 100 >= total || rgs.length === 0) break;
        await sleep(1100); // MusicBrainz 1 rps
      }
      if (!items.length) return { ok: false, error: `「${artist.name}」在 MusicBrainz 上没有专辑/EP 记录` };
      items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      const note = artist.disambiguation ? `(${artist.disambiguation})` : "";
      return { ok: true, label: artist.name, detail: `艺人追踪${note} · ${items.length} 张`, items };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "艺人导入失败" };
    }
  });

/* ————————————— RSS / Atom ————————————— */

function stripCdata(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function tagText(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? stripCdata(m[1]) : "";
}

/** 「Artist - Title」「Title, by Artist」(Bandcamp)等标题拆分。 */
function splitItemTitle(title: string, feedTitle: string): { artist: string; title: string } | null {
  let m = title.match(/^(.{1,120}?)\s+[-–—]\s+(.{1,200})$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  m = title.match(/^(.{1,200}?),?\s+by\s+(.{1,120})$/i);
  if (m) return { artist: m[2].trim(), title: m[1].trim() };
  if (feedTitle) return { artist: feedTitle, title: title.trim() };
  return null;
}

export const importRss = createServerFn({ method: "POST" })
  .validator((d: { url: string }) => d)
  .handler(async ({ data }): Promise<Ok | Err> => {
    const url = data.url.trim();
    if (!/^https?:\/\//.test(url)) return { ok: false, error: "请输入完整的 feed 链接" };
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, text/xml, */*" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return { ok: false, error: `feed 请求失败(${res.status})` };
      const xml = await res.text();
      const feedTitle = stripCdata(
        tagText(xml.slice(0, xml.search(/<(item|entry)[\s>]/i) === -1 ? 4000 : xml.search(/<(item|entry)[\s>]/i)), "title"),
      );
      const blocks = [...xml.matchAll(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi)].map((m) => m[0]);
      if (!blocks.length) return { ok: false, error: "这个链接不是 RSS/Atom feed,或没有条目" };
      const items: ImportItem[] = [];
      for (const block of blocks.slice(0, 500)) {
        const rawTitle = tagText(block, "title");
        if (!rawTitle) continue;
        const split = splitItemTitle(rawTitle, feedTitle);
        if (!split) continue;
        const dateRaw = tagText(block, "pubDate") || tagText(block, "published") || tagText(block, "updated");
        const parsed = dateRaw ? new Date(dateRaw) : null;
        items.push({
          ...split,
          date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : undefined,
        });
      }
      if (!items.length) return { ok: false, error: "feed 里没有可解析成「艺人 – 专辑」的条目" };
      return { ok: true, label: feedTitle || new URL(url).hostname, detail: `RSS 订阅 · ${items.length} 条`, items };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "feed 解析失败" };
    }
  });

/* ————————————— Bandcamp 艺人 / 厂牌 / 专辑 ————————————— */

const BANDCAMP_EMPTY =
  "这个 Bandcamp 页面没有读到公开专辑。请用艺人页、厂牌页或专辑页（不是个人收藏或 Discover）。";

function decodeHtmlAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function bandcampCover(artId?: number | string | null): string | undefined {
  if (artId == null || artId === "") return undefined;
  return `https://f4.bcbits.com/img/a${artId}_2.jpg`;
}

function parseBandcampDate(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = raw.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return undefined;
  const parsed = new Date(`${m[2]} ${m[1]}, ${m[3]} UTC`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function bandcampPageArtist(html: string): string {
  const site = html.match(/<meta[^>]+property="og:site_name"[^>]+content="([^"]+)"/i) ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:site_name"/i);
  if (site?.[1] && !/^bandcamp$/i.test(site[1])) return decodeHtmlAttr(site[1]).trim();
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
  if (og?.[1]) {
    const name = decodeHtmlAttr(og[1]).replace(/\s*\|\s*Bandcamp.*$/i, "").trim();
    const by = name.match(/^(.+?),\s*by\s+(.+)$/i);
    if (by) return by[2].trim();
    return name;
  }
  return "";
}

function splitGridCaption(raw: string): { title: string; artist?: string } {
  const lines = raw
    .split(/\n+/)
    .map((s) => decodeHtmlAttr(s).replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
  if (lines.length >= 2) return { title: lines[0], artist: lines[1] };
  return { title: lines[0] ?? "" };
}

function harvestBandcampGrid(html: string, fallbackArtist: string): ImportItem[] {
  const out: ImportItem[] = [];
  for (const block of html.matchAll(/<li[^>]*class="[^"]*music-grid-item[\s\S]*?<\/li>/gi)) {
    const href = block[0].match(/href="(\/(?:album|track)\/[^"?#]+)"/i);
    if (!href) continue;
    const titleBlock = block[0].match(/<p class="title">([\s\S]*?)<\/p>/i);
    const split = splitGridCaption(titleBlock?.[1] ?? "");
    const img = block[0].match(/<img[^>]+src="([^"]+)"/i)?.[1];
    const artist = split.artist || fallbackArtist;
    if (!split.title || !artist) continue;
    out.push({ artist, title: split.title, pic: img ?? null });
  }
  return out;
}

function harvestBandcampClientItems(html: string, fallbackArtist: string): ImportItem[] {
  const m = html.match(/data-client-items="([^"]+)"/i);
  if (!m) return [];
  try {
    const rows = JSON.parse(decodeHtmlAttr(m[1])) as Array<{
      title?: string;
      artist?: string;
      type?: string;
      page_url?: string;
      art_id?: number;
    }>;
    if (!Array.isArray(rows)) return [];
    const out: ImportItem[] = [];
    for (const row of rows) {
      const kind = String(row.type ?? "").toLowerCase();
      if (kind && kind !== "album" && kind !== "track") continue;
      const title = String(row.title ?? "").trim();
      const artist = String(row.artist ?? "").trim() || fallbackArtist;
      if (!title || !artist) continue;
      out.push({ artist, title, pic: bandcampCover(row.art_id) ?? null });
    }
    return out;
  } catch {
    return [];
  }
}

function harvestBandcampAlbumPage(html: string): ImportItem | null {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const json = JSON.parse(b[1]) as {
        "@type"?: string;
        name?: string;
        datePublished?: string;
        image?: string | string[];
        inAlbum?: { name?: string };
        byArtist?: { name?: string } | Array<{ name?: string }>;
      };
      const type = String(json["@type"] ?? "");
      if (!/MusicAlbum|MusicRecording/i.test(type)) continue;
      const by = Array.isArray(json.byArtist) ? json.byArtist[0]?.name : json.byArtist?.name;
      const title = (/MusicRecording/i.test(type) ? json.inAlbum?.name : json.name)?.trim() || json.name?.trim();
      if (!title || !by) continue;
      const image = Array.isArray(json.image) ? json.image[0] : json.image;
      return { artist: by.trim(), title, date: parseBandcampDate(json.datePublished), pic: image ?? null };
    } catch {
      // 单块失败继续
    }
  }
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1];
  if (og) {
    const split = splitItemTitle(decodeHtmlAttr(og), bandcampPageArtist(html));
    if (split) return { ...split, date: parseBandcampDate(html.match(/released\s+(\d{1,2}\s+\w+\s+\d{4})/i)?.[1]) };
  }
  return null;
}

function mergeBandcampItems(parts: ImportItem[][]): ImportItem[] {
  const seen = new Set<string>();
  const out: ImportItem[] = [];
  for (const it of parts.flat()) {
    const artist = it.artist.trim();
    const title = it.title.trim();
    if (!artist || !title) continue;
    const k = `${artist.toLowerCase()}||${title.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ artist, title, date: it.date, pic: it.pic ?? null });
  }
  return out;
}

function bandcampFetchTarget(url: string): { href: string; kind: "album" | "track" | "catalog" } {
  const u = new URL(url.trim());
  const path = u.pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/album/")) return { href: `${u.protocol}//${u.host}${path}`, kind: "album" };
  if (path.startsWith("/track/")) return { href: `${u.protocol}//${u.host}${path}`, kind: "track" };
  return { href: `${u.protocol}//${u.host}/`, kind: "catalog" };
}

export const importBandcamp = createServerFn({ method: "POST" })
  .validator((d: { url: string }) => d)
  .handler(async ({ data }): Promise<Ok | Err> => {
    const raw = data.url.trim();
    if (!/^https?:\/\//i.test(raw) || !/bandcamp\.com/i.test(raw)) {
      return { ok: false, error: "请粘贴 Bandcamp 艺人页、厂牌页或专辑链接" };
    }
    try {
      const target = bandcampFetchTarget(raw);
      const res = await fetch(target.href, {
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
        signal: AbortSignal.timeout(20000),
        redirect: "follow",
      });
      if (!res.ok) return { ok: false, error: `Bandcamp 页面请求失败(${res.status})` };
      const html = await res.text();
      if (target.kind === "album" || target.kind === "track") {
        const one = harvestBandcampAlbumPage(html);
        if (!one) return { ok: false, error: BANDCAMP_EMPTY };
        return {
          ok: true,
          label: one.title,
          detail: `Bandcamp ${target.kind === "track" ? "单曲所属" : ""}专辑 · 1 张`,
          items: [one],
        };
      }
      const artist = bandcampPageArtist(html);
      const items = mergeBandcampItems([harvestBandcampGrid(html, artist), harvestBandcampClientItems(html, artist)]);
      if (!items.length) return { ok: false, error: BANDCAMP_EMPTY };
      return {
        ok: true,
        label: artist || new URL(target.href).hostname.replace(/\.bandcamp\.com$/i, ""),
        detail: `Bandcamp · ${items.length} 张`,
        items,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Bandcamp 导入失败" };
    }
  });

/* ————————————— RYM / AOTY 服务端直抓尝试(含翻页) ————————————— */

const BLOCK_HINT = "站点有访问防护,服务器直抓被拦截。请用浏览器插件在收藏页一键导入,或复制页面/导出 CSV 后粘贴导入。";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

/** RYM 收藏页:行内有 artist 链接与 release 链接。 */
function parseRymPage(html: string): ImportItem[] {
  const items: ImportItem[] = [];
  const rowRe =
    /<a[^>]*class="[^"]*artist[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,600}?<a[^>]*href="\/release\/(?:album|ep)\/[^"]+"[^>]*>([\s\S]*?)<\/a>(?:[\s\S]{0,300}?\((\d{4})\))?/g;
  for (const m of html.matchAll(rowRe)) {
    const artist = decodeEntities(m[1].replace(/<[^>]+>/g, ""));
    const title = decodeEntities(m[2].replace(/<[^>]+>/g, ""));
    if (artist && title) items.push({ artist, title, date: m[3] });
  }
  return items;
}

/** AOTY 用户列表页:albumListRow / albumBlock 两种布局。 */
function parseAotyPage(html: string): ImportItem[] {
  const items: ImportItem[] = [];
  const re =
    /<a[^>]*href="\/album\/[^"]+"[^>]*>\s*(?:<[^>]+>\s*)*([^<]{2,160})\s*-\s*([^<]{2,200})(?:<[^>]+>\s*)*<\/a>/g;
  for (const m of html.matchAll(re)) {
    items.push({ artist: decodeEntities(m[1]), title: decodeEntities(m[2]) });
  }
  const blockRe =
    /class="[^"]*artistTitle[^"]*"[^>]*>([^<]{1,160})<[\s\S]{0,400}?class="[^"]*albumTitle[^"]*"[^>]*>([^<]{1,200})</g;
  for (const m of html.matchAll(blockRe)) {
    items.push({ artist: decodeEntities(m[1]), title: decodeEntities(m[2]) });
  }
  return items;
}

const MAX_PAGES = 25;

export const importWebList = createServerFn({ method: "POST" })
  .validator((d: { url: string }) => d)
  .handler(async ({ data }): Promise<Ok | Err> => {
    const base = data.url.trim().replace(/\/+$/, "");
    const isRym = /rateyourmusic\.com/i.test(base);
    const isAoty = /albumoftheyear\.org/i.test(base);
    if (!isRym && !isAoty) return { ok: false, error: "只支持 rateyourmusic.com 或 albumoftheyear.org 链接" };

    const all: ImportItem[] = [];
    const seen = new Set<string>();
    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = page === 1 ? `${base}/` : `${base}/${page}/`;
        const res = await fetch(url, {
          headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
          signal: AbortSignal.timeout(20000),
          redirect: "follow",
        });
        if (res.status === 403 || res.status === 429 || res.status === 503) {
          if (all.length) break; // 已抓到部分,带着走
          return { ok: false, error: BLOCK_HINT };
        }
        if (!res.ok) break;
        const html = await res.text();
        if (/cf-browser-verification|challenge-platform|Just a moment/i.test(html)) {
          if (all.length) break;
          return { ok: false, error: BLOCK_HINT };
        }
        const found = isRym ? parseRymPage(html) : parseAotyPage(html);
        let fresh = 0;
        for (const it of found) {
          const k = `${it.artist.toLowerCase()}||${it.title.toLowerCase()}`;
          if (seen.has(k)) continue;
          seen.add(k);
          all.push(it);
          fresh++;
        }
        if (fresh === 0) break; // 翻到底(或该页解析不出),停止
        await sleep(900);
      }
    } catch (err) {
      if (!all.length) return { ok: false, error: err instanceof Error ? `${err.message} — ${BLOCK_HINT}` : BLOCK_HINT };
    }
    if (!all.length) return { ok: false, error: BLOCK_HINT };
    return {
      ok: true,
      label: isRym ? "RYM 列表" : "AOTY 列表",
      detail: `服务端直抓 · ${all.length} 条`,
      items: all,
    };
  });

/* ————————————— Apple Music 公开歌单 ————————————— */

const APPLE_PRIVATE =
  "这是私有或登录墙后的 Apple Music 链接。只支持未登录也能打开的公开歌单；也可以粘贴「艺人 - 专辑」每行一条。";
const APPLE_EMPTY =
  "这个 Apple Music 页面没有公开曲目。请确认链接未登录也能打开；长列表有时只露出一部分。也可以粘贴「艺人 - 专辑」每行一条。";
const APPLE_BAD_URL =
  "请粘贴公开的 Apple Music 歌单链接（路径里带 /playlist/）。专辑或单曲链接也可以，会收成一张专辑。";

type AppleHit = { artist: string; title: string; date?: string; pic?: string | null; albumId?: string };

function nameKey(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}||${title.trim().toLowerCase()}`;
}

function cleanAppleTitle(s: string): string {
  return s
    .replace(/^\u200E/, "")
    .replace(/\s+on Apple Music\s*$/i, "")
    .replace(/\s*[-–|]\s*(Playlist|专辑|歌单|Album).*$/i, "")
    .trim();
}

function appleArt(url?: string | null): string | undefined {
  if (!url) return undefined;
  return url
    .replace("{w}x{h}bb.{f}", "200x200bb.jpg")
    .replaceAll("{w}", "200")
    .replaceAll("{h}", "200")
    .replaceAll("{f}", "jpg")
    .replace("/100x100bb.", "/200x200bb.");
}

function parseAppleTarget(url: string): {
  kind: "playlist" | "album" | "song" | "library" | "other";
  id?: string;
} {
  try {
    const u = new URL(url.trim());
    const path = u.pathname.toLowerCase();
    if (path.includes("/library/")) return { kind: "library" };
    const parts = u.pathname.split("/").filter(Boolean);
    const kindIdx = parts.findIndex((p) => p === "playlist" || p === "album" || p === "song");
    if (kindIdx < 0) return { kind: "other" };
    const kind = parts[kindIdx] as "playlist" | "album" | "song";
    const id = (parts[parts.length - 1] ?? "").split("?")[0];
    if (kind === "playlist" && id.startsWith("pl.")) return { kind, id };
    if ((kind === "album" || kind === "song") && /^\d+$/.test(id)) return { kind, id };
    return { kind };
  } catch {
    return { kind: "other" };
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function walkUnknown(root: unknown, visit: (obj: Record<string, unknown>) => void): void {
  const stack: unknown[] = [root];
  const seen = new Set<unknown>();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      for (const x of cur) stack.push(x);
      continue;
    }
    const obj = cur as Record<string, unknown>;
    visit(obj);
    for (const [k, v] of Object.entries(obj)) {
      if (k === "actionMetrics" || k === "impressionMetrics") continue;
      stack.push(v);
    }
  }
}

function textAttr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  const rec = asRecord(v);
  return typeof rec?.name === "string" ? rec.name.trim() : "";
}

/** 页面内嵌 serialized-server-data:曲目 → 所属专辑。 */
function harvestSerialized(html: string): { items: AppleHit[]; listName?: string } {
  const m = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return { items: [] };
  let json: unknown;
  try {
    json = JSON.parse(m[1]);
  } catch {
    return { items: [] };
  }
  const items: AppleHit[] = [];
  let listName: string | undefined;
  walkUnknown(json, (obj) => {
    const id = typeof obj.id === "string" ? obj.id : "";
    if (!listName && id.startsWith("playlist-detail-header") && Array.isArray(obj.items)) {
      const header = asRecord(obj.items[0]);
      const title = textAttr(header?.title);
      if (title) listName = cleanAppleTitle(title);
    }
    const cd = asRecord(obj.contentDescriptor);
    if (cd?.kind !== "song") return;
    const artist =
      textAttr(obj.artistName) ||
      (Array.isArray(obj.subtitleLinks) ? textAttr(asRecord(obj.subtitleLinks[0])?.title) : "");
    let album = "";
    let albumId: string | undefined;
    let pic: string | undefined;
    if (Array.isArray(obj.tertiaryLinks)) {
      for (const link of obj.tertiaryLinks) {
        const row = asRecord(link);
        if (!row) continue;
        const dest = asRecord(asRecord(row.segue)?.destination);
        const destCd = asRecord(dest?.contentDescriptor);
        if (destCd?.kind === "album" || textAttr(row.title)) {
          album = textAttr(row.title) || album;
          const ids = asRecord(destCd?.identifiers);
          const adam = ids?.storeAdamID;
          if (typeof adam === "string" || typeof adam === "number") albumId = String(adam);
          break;
        }
      }
    }
    const art = asRecord(asRecord(obj.artwork)?.dictionary);
    if (typeof art?.url === "string") pic = appleArt(art.url);
    if (artist && album) items.push({ artist, title: album, pic, albumId });
  });
  return { items, listName };
}

function harvestJsonLd(html: string): { items: AppleHit[]; listName?: string; songIds: string[] } {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const items: AppleHit[] = [];
  const songIds: string[] = [];
  let listName: string | undefined;
  for (const b of blocks) {
    try {
      const json = JSON.parse(b[1]) as {
        name?: string;
        track?: Array<{
          name?: string;
          url?: string;
          byArtist?: { name?: string } | Array<{ name?: string }>;
          inAlbum?: { name?: string };
        }>;
      };
      if (json.name) listName = cleanAppleTitle(json.name);
      if (!Array.isArray(json.track)) continue;
      for (const t of json.track) {
        const album = t.inAlbum?.name;
        const by = Array.isArray(t.byArtist) ? t.byArtist[0]?.name : t.byArtist?.name;
        if (album && by) items.push({ artist: by, title: album });
        const sm = String(t.url ?? "").match(/\/song\/[^/]+\/(\d+)/);
        if (sm) songIds.push(sm[1]);
      }
    } catch {
      // 单块解析失败继续
    }
  }
  return { items, listName, songIds };
}

function harvestAppleIds(html: string): { albumIds: string[]; songIds: string[] } {
  const albumIds = [...html.matchAll(/music\.apple\.com\/[a-z]{2}\/album\/[^/"'?#\s]+\/(\d+)/gi)].map((m) => m[1]);
  const songIds = [
    ...[...html.matchAll(/music\.apple\.com\/[a-z]{2}\/song\/[^/"'?#\s]+\/(\d+)/gi)].map((m) => m[1]),
    ...[...html.matchAll(/[?&]i=(\d{6,})/g)].map((m) => m[1]),
  ];
  return { albumIds: [...new Set(albumIds)], songIds: [...new Set(songIds)] };
}

function pageListName(html: string): string | undefined {
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
  if (og?.[1]) return cleanAppleTitle(og[1]);
  const title = html.match(/<title>([^<]+)<\/title>/i);
  if (title?.[1]) return cleanAppleTitle(title[1].replace(/\s*-\s*Apple Music\s*$/i, ""));
  return undefined;
}

function isAppleBlockedPage(html: string): boolean {
  if (/\/account\/login|signin\.apple\.com/i.test(html) && html.length < 80000) return true;
  return /this playlist is not available|playlist is no longer available|无法打开此资料库|this content is not available/i.test(
    html,
  );
}

type ItunesRow = {
  wrapperType?: string;
  kind?: string;
  collectionId?: number;
  artistName?: string;
  collectionName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
};

async function itunesLookup(ids: string[]): Promise<ItunesRow[]> {
  const uniq = [...new Set(ids.filter((id) => /^\d+$/.test(id)))].slice(0, 400);
  const rows: ItunesRow[] = [];
  for (let i = 0; i < uniq.length; i += 80) {
    const chunk = uniq.slice(i, i + 80);
    try {
      const body = (await getJson(`https://itunes.apple.com/lookup?id=${chunk.join(",")}`, 15000)) as {
        results?: ItunesRow[];
      };
      rows.push(...(body.results ?? []));
    } catch {
      // 单批失败不放弃其余
    }
    if (i + 80 < uniq.length) await sleep(200);
  }
  return rows;
}

function hitsFromItunes(rows: ItunesRow[]): AppleHit[] {
  const out: AppleHit[] = [];
  for (const row of rows) {
    const artist = row.artistName?.trim();
    const title = row.collectionName?.trim();
    if (!artist || !title) continue;
    if (row.wrapperType === "collection" || row.kind === "song") {
      out.push({
        artist,
        title,
        date: row.releaseDate ? row.releaseDate.slice(0, 10) : undefined,
        pic: appleArt(row.artworkUrl100),
        albumId: row.collectionId ? String(row.collectionId) : undefined,
      });
    }
  }
  return out;
}

function mergeAppleHits(parts: AppleHit[][]): ImportItem[] {
  const byId = new Map<string, AppleHit>();
  const byName = new Map<string, AppleHit>();
  for (const hit of parts.flat()) {
    const artist = hit.artist.trim();
    const title = hit.title.trim();
    if (!artist || !title) continue;
    const next: AppleHit = { artist, title, date: hit.date, pic: hit.pic, albumId: hit.albumId };
    if (next.albumId) {
      const old = byId.get(next.albumId);
      byId.set(next.albumId, {
        artist: old?.artist ?? next.artist,
        title: old?.title ?? next.title,
        date: next.date || old?.date,
        pic: next.pic || old?.pic,
        albumId: next.albumId,
      });
      continue;
    }
    const k = nameKey(artist, title);
    const old = byName.get(k);
    byName.set(k, {
      artist,
      title,
      date: next.date || old?.date,
      pic: next.pic || old?.pic,
    });
  }
  const named = new Set([...byId.values()].map((h) => nameKey(h.artist, h.title)));
  const merged = [...byId.values(), ...[...byName.values()].filter((h) => !named.has(nameKey(h.artist, h.title)))];
  return merged.map(({ artist, title, date, pic }) => ({ artist, title, date, pic: pic ?? null }));
}

export const importApple = createServerFn({ method: "POST" })
  .validator((d: { url: string }) => d)
  .handler(async ({ data }): Promise<Ok | Err> => {
    const url = data.url.trim();
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: APPLE_BAD_URL };
    const target = parseAppleTarget(url);
    if (target.kind === "library") return { ok: false, error: APPLE_PRIVATE };
    if (target.kind === "other") return { ok: false, error: APPLE_BAD_URL };

    try {
      if (target.kind === "album" && target.id) {
        const items = mergeAppleHits([hitsFromItunes(await itunesLookup([target.id]))]);
        if (!items.length) return { ok: false, error: APPLE_EMPTY };
        return { ok: true, label: items[0].title, detail: `Apple Music 专辑 · 1 张`, items };
      }
      if (target.kind === "song" && target.id) {
        const items = mergeAppleHits([hitsFromItunes(await itunesLookup([target.id]))]);
        if (!items.length) return { ok: false, error: APPLE_EMPTY };
        return { ok: true, label: items[0].title, detail: `Apple Music 单曲所属专辑 · 1 张`, items };
      }

      const res = await fetch(url, {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html",
          "Accept-Language": "en-US,en;q=0.8,zh-CN;q=0.5",
        },
        signal: AbortSignal.timeout(20000),
        redirect: "follow",
      });
      if (res.status === 401 || res.status === 403) return { ok: false, error: APPLE_PRIVATE };
      if (!res.ok) return { ok: false, error: `Apple Music 页面请求失败(${res.status})` };
      const html = await res.text();
      if (isAppleBlockedPage(html)) return { ok: false, error: APPLE_PRIVATE };

      const serialized = harvestSerialized(html);
      const ld = harvestJsonLd(html);
      const ids = harvestAppleIds(html);
      const listName = serialized.listName || ld.listName || pageListName(html) || "Apple Music 歌单";

      const knownAlbumIds = [
        ...serialized.items.map((x) => x.albumId).filter((x): x is string => Boolean(x)),
        ...ids.albumIds,
      ];
      const knownSongIds = target.kind === "playlist" ? [...ids.songIds, ...ld.songIds] : [];
      const haveNames = serialized.items.length + ld.items.length > 0;
      const lookupIds = haveNames ? knownAlbumIds : [...knownAlbumIds, ...knownSongIds];
      const looked = lookupIds.length ? hitsFromItunes(await itunesLookup(lookupIds)) : [];

      const items = mergeAppleHits([serialized.items, ld.items, looked]);
      if (!items.length) return { ok: false, error: APPLE_EMPTY };
      const declared = Number(html.match(/"numTracks":(\d+)/)?.[1] ?? 0);
      const seenTracks = Math.max(serialized.items.length, ids.songIds.length, ld.songIds.length);
      const note = declared > 0 && seenTracks < declared * 0.9 ? " · 长列表可能不全" : "";
      return {
        ok: true,
        label: listName,
        detail: `Apple Music 歌单 · ${items.length} 张${note}`,
        items,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Apple Music 导入失败" };
    }
  });
