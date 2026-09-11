import { createServerFn } from "@tanstack/react-start";
import { loadRymPublic } from "./rym-public";
import { loadWebWeek, webPoolGen, type WebItem } from "./web-pool";
import { artistStature } from "./artists";
import { inferGenres } from "./genres";
import { coverUrls, searchLinks } from "./links";
import type { CatalogAlbum, ReleaseType, WeekCatalog } from "./types";
import { addDays, weekBounds } from "./week";
import { scanWindow } from "./weeks";

const UA = "VprGrid.SYS/1.0 (weekly album radar)";

type LbRelease = {
  artist_credit_name?: string;
  artist_mbids?: string[];
  caa_id?: number | null;
  caa_release_mbid?: string | null;
  listen_count?: number;
  release_date?: string;
  release_group_mbid?: string;
  release_group_primary_type?: string | null;
  release_group_secondary_type?: string | null;
  release_mbid?: string;
  release_name?: string;
  release_tags?: string[];
  /** 来自 MusicBrainz 日期直查的补充条目(无 CAA id,封面走 release-group 猜测)。 */
  mb_supplement?: boolean;
  /** 来自 Bandcamp Discover 的条目(无 MBID):封面/链接直连 Bandcamp。 */
  bc?: { url: string; art: number | null };
  /** 来自 AlbumOfTheYear(无 MBID):封面/链接直连 AOTY,userScore 作为评分信号。 */
  aoty?: { url: string; cover: string | null; userScore: number | null };
  /** 同名 AOTY 评分(0–100),注入到其他来源的同名发行,补充关注度信号。 */
  aotyScore?: number;
  /** 来自 RYM 新发行页 / Internet Archive 年榜快照(无 MBID)。 */
  rym?: { url: string; cover: string | null; userScore: number | null };
  /** 来自维基「当年专辑列表」(无登录公开源,补齐 Wayback 滞后的近月新专)。 */
  wiki?: { url: string; cover: string | null };
};

type CacheEntry = { at: number; ver: number; raw: LbRelease[] };
let memory: CacheEntry | null = null;
type AlbumCache = { at: number; ver: number; key: string; albums: CatalogAlbum[]; scanned: number; webGen: number };
let albumMemory: AlbumCache | null = null;
const albumMemoryList: AlbumCache[] = [];

function rememberAlbums(entry: AlbumCache) {
  albumMemory = entry;
  const i = albumMemoryList.findIndex((x) => x.key === entry.key);
  if (i >= 0) albumMemoryList.splice(i, 1);
  albumMemoryList.unshift(entry);
  if (albumMemoryList.length > 8) albumMemoryList.pop();
}

type MbWeekCache = { at: number; key: string; raw: LbRelease[] };
let mbWeekMemory: MbWeekCache | null = null;
const CACHE_MS = 30 * 60 * 1000;
const CACHE_VER = 19;

function cacheFresh(m: AlbumCache): boolean {
  return m.ver === CACHE_VER && m.webGen === webPoolGen() && Date.now() - m.at < CACHE_MS;
}
/** ListenBrainz fresh-releases 窗口:约十周(相对今天)。历史时期靠 MusicBrainz 日期窗补齐。 */
const LB_DAYS = 70;

type Bounds = { start: string; end: string };

const ROLE_TAGS = new Set([
  "composer",
  "lyricist",
  "producer",
  "songwriter",
  "male vocals",
  "female vocals",
  "seen live",
  "singer",
  "rapper",
]);

function asType(t: string | null | undefined): ReleaseType {
  if (t === "Album" || t === "EP" || t === "Single") return t;
  return "Other";
}

async function lbJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`ListenBrainz ${res.status}`);
  return res.json();
}

async function loadFresh(days: number): Promise<LbRelease[]> {
  if (memory && memory.ver === CACHE_VER && Date.now() - memory.at < CACHE_MS) return memory.raw;
  const url = `https://api.listenbrainz.org/1/explore/fresh-releases/?days=${days}&past=true&future=true`;
  // 这个接口返回几 MB 的大包,高峰期实测可达 30s+,超时要给足
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`ListenBrainz ${res.status}`);
  const body = (await res.json()) as { payload?: { releases?: LbRelease[] } };
  const raw = body.payload?.releases ?? [];
  memory = { at: Date.now(), ver: CACHE_VER, raw };
  return raw;
}

type MbSearchRg = {
  id: string;
  title: string;
  "first-release-date"?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  "artist-credit"?: Array<{ name: string; joinphrase?: string; artist?: { id: string } }>;
};

function rangeDays(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
}

function mbBudget(start: string, end: string, deep: boolean): { max: number; ms: number } {
  const weeks = Math.max(1, rangeDays(start, end) / 7);
  if (deep) {
    return {
      max: Math.min(8000, Math.round(600 + weeks * 700)),
      ms: Math.min(90000, 45000 + weeks * 4000),
    };
  }
  return {
    max: Math.min(4000, Math.round(2000 + weeks * 200)),
    ms: Math.min(28000, 15000 + weeks * 800),
  };
}

/**
 * 扫描池补全:直查 MusicBrainz 选定扫描窗内的专辑/EP(默认近十周)。
 * 上限与时间预算随窗口拉长;deep 回扫绕过缓存强制重抓。
 * MusicBrainz 是全网发行的注册中心——ListenBrainz fresh-releases 只覆盖有听众
 * 数据的发行,零听众的冷门新专靠这条兜底。
 * 匿名接口约 1 req/s,翻页间加限速;单页失败(503)等待后重试一次。
 */
async function loadMbWeek(start: string, end: string, deep = false): Promise<LbRelease[]> {
  const key = `${start}|${end}`;
  if (!deep && mbWeekMemory && mbWeekMemory.key === key && Date.now() - mbWeekMemory.at < CACHE_MS) {
    return mbWeekMemory.raw;
  }
  const query = encodeURIComponent(
    `firstreleasedate:[${start} TO ${end}] AND (primarytype:"Album" OR primarytype:"EP")`,
  );
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const fetchPage = async (offset: number) =>
    fetch(
      `https://musicbrainz.org/ws/2/release-group/?query=${query}&fmt=json&limit=100&offset=${offset}`,
      { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(12000) },
    );
  const out: LbRelease[] = [];
  const budget = mbBudget(start, end, deep);
  const max = budget.max;
  // 时间预算:冷缓存首屏不能被深翻页拖死,超时就用已抓到的部分(30 分钟后台缓存会补全)
  const deadline = Date.now() + budget.ms;
  try {
    for (let offset = 0; offset < max; offset += 100) {
      if (Date.now() > deadline && out.length > 0) break;
      let res = await fetchPage(offset);
      if (res.status === 503) {
        await sleep(1100);
        res = await fetchPage(offset);
      }
      if (!res.ok) break;
      const body = (await res.json()) as { "release-groups"?: MbSearchRg[]; count?: number };
      const page = body["release-groups"] ?? [];
      for (const rg of page) {
        out.push({
          artist_credit_name: (rg["artist-credit"] ?? []).map((a) => `${a.name}${a.joinphrase ?? ""}`).join("").trim(),
          artist_mbids: (rg["artist-credit"] ?? []).map((a) => a.artist?.id).filter((x): x is string => Boolean(x)),
          release_date: rg["first-release-date"],
          release_group_mbid: rg.id,
          release_group_primary_type: rg["primary-type"] ?? null,
          release_group_secondary_type: rg["secondary-types"]?.[0] ?? null,
          release_name: rg.title,
          mb_supplement: true,
        });
      }
      if (page.length < 100 || out.length >= (body.count ?? 0)) break;
      await sleep(250);
    }
  } catch {
    // 补全失败不影响主池
  }
  mbWeekMemory = { at: Date.now(), key, raw: out };
  return out;
}

type BcWeekCache = { at: number; key: string; raw: LbRelease[] };
let bcWeekMemory: BcWeekCache | null = null;

/** Bandcamp Discover 按风格抓新上架时用的标签面(覆盖口味体系的主要母类)。 */
const BC_TAGS = [
  "experimental",
  "ambient",
  "electronic",
  "jazz",
  "classical",
  "folk",
  "noise",
  "industrial",
  "metal",
  "punk",
  "hip-hop-rap",
  "indie",
];

/**
 * Bandcamp Discover 新上架池(官方 robots.txt 白名单接口,POST /api/discover/1/discover_web)。
 * 独立音乐重镇:大量实验/氛围/即兴发行只上 Bandcamp,不进 MusicBrainz。
 * 按 BC_TAGS 逐风格拉「newest arrivals」,窗口内的发行转成 LbRelease 形状混入主池;
 * 同一张专辑命中多个标签时合并标签(跨风格命中本身就是质量信号)。
 * 注意 new 切片按「上架时间」排序,旧专辑重新上架也会出现,必须按发行日窗口过滤。
 */
async function loadBandcampWeek(start: string, end: string, deep = false): Promise<LbRelease[]> {
  const key = `${start}|${end}`;
  if (!deep && bcWeekMemory && bcWeekMemory.key === key && Date.now() - bcWeekMemory.at < CACHE_MS) {
    return bcWeekMemory.raw;
  }
  type BcItem = {
    item_id?: number;
    title?: string;
    album_artist?: string | null;
    band_name?: string;
    item_url?: string;
    release_date?: string;
    track_count?: number;
    is_album_preorder?: boolean;
    primary_image?: { image_id?: number };
  };
  const pagesPerTag = deep ? 4 : 2;
  const fetchPage = async (tag: string, cursor: string): Promise<{ items: BcItem[]; cursor: string | null }> => {
    const res = await fetch("https://bandcamp.com/api/discover/1/discover_web", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        category_id: 0,
        cursor,
        geoname_id: 0,
        include_result_types: ["a"],
        size: 100,
        slice: "new",
        tag_norm_names: [tag],
        time_facet_id: null,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`Bandcamp ${res.status}`);
    const body = (await res.json()) as { results?: BcItem[]; cursor?: string | null };
    return { items: body.results ?? [], cursor: body.cursor ?? null };
  };

  // key = 艺人|标题(小写),跨标签合并
  const merged = new Map<string, LbRelease & { bc: NonNullable<LbRelease["bc"]> }>();
  const perTag = async (tag: string) => {
    let cursor = "*";
    for (let p = 0; p < pagesPerTag; p++) {
      let page: { items: BcItem[]; cursor: string | null };
      try {
        page = await fetchPage(tag, cursor);
      } catch {
        return; // 单标签失败不拖垮整池
      }
      for (const it of page.items) {
        const title = (it.title ?? "").trim();
        const artist = (it.album_artist ?? it.band_name ?? "").trim();
        const date = (it.release_date ?? "").slice(0, 10);
        if (!title || !artist || !it.item_id || it.is_album_preorder) continue;
        if (date < start || date > end) continue;
        // 卧室自录洪流的粗筛:标题/艺名要有实体文字(纯 emoji / 符号跳过),
        // 且至少 3 轨(1-2 轨的散曲上传不构成专辑/EP 语境)
        if (!/[\p{L}\p{N}]{2,}/u.test(title) || !/[\p{L}\p{N}]{2,}/u.test(artist)) continue;
        if ((it.track_count ?? 0) < 3) continue;
        const k = `${artist.toLowerCase()}|${title.toLowerCase()}`;
        const prev = merged.get(k);
        if (prev) {
          if (!prev.release_tags?.includes(tag)) prev.release_tags = [...(prev.release_tags ?? []), tag];
          continue;
        }
        merged.set(k, {
          release_mbid: `bc-${it.item_id}`,
          release_name: title,
          artist_credit_name: artist,
          release_date: date,
          release_group_primary_type: (it.track_count ?? 7) <= 6 ? "EP" : "Album",
          release_tags: [tag],
          bc: {
            url: (it.item_url ?? "").split("?")[0],
            art: it.primary_image?.image_id ?? null,
          },
        });
      }
      if (!page.cursor || page.items.length < 100) break;
      cursor = page.cursor;
    }
  };

  // 每批 4 个标签并行,总量约 24 个请求(深扫 48),Bandcamp 单页 ~0.8s
  for (const group of chunks(BC_TAGS, 4)) {
    await Promise.all(group.map(perTag));
  }
  const out = [...merged.values()];
  bcWeekMemory = { at: Date.now(), key, raw: out };
  return out;
}

/** 展示期终点往回 21 天内每位艺人的专辑/EP 数,供流水线判定(十周扫描窗不直接当产量窗)。 */
function artistWindowCounts(raw: LbRelease[], lineStart: string, lineEnd: string): Map<string, number> {
  const groups = new Map<string, Set<string>>();
  for (const r of raw) {
    const date = r.release_date ?? "";
    if (date.length >= 10 && (date < lineStart || date > lineEnd)) continue;
    const type = asType(r.release_group_primary_type);
    if (type !== "Album" && type !== "EP") continue;
    const artist = (r.artist_credit_name ?? "").trim().toLowerCase();
    const gid = r.release_group_mbid || r.release_mbid;
    if (!artist || !gid) continue;
    const set = groups.get(artist) ?? new Set<string>();
    set.add(gid);
    groups.set(artist, set);
  }
  return new Map([...groups.entries()].map(([k, v]) => [k, v.size]));
}

function toAlbum(r: LbRelease, friday: string, bounds: Bounds): CatalogAlbum | null {
  const id = r.release_group_mbid || r.release_mbid;
  const title = (r.release_name ?? "").trim();
  const artist = (r.artist_credit_name ?? "").trim();
  const date = r.release_date ?? "";
  if (!id || !title || !artist || date.length < 10) return null;
  const type = asType(r.release_group_primary_type);
  if (type !== "Album" && type !== "EP") return null;
  const secondary = r.release_group_secondary_type ?? null;
  const skip = ["Compilation", "Soundtrack", "Remix", "DJ-mix", "Interview", "Audiobook", "Audio drama", "Mixtape/Street"];
  if (secondary && skip.includes(secondary)) return null;
  const tags = (r.release_tags ?? []).map((t) => t.trim()).filter(Boolean);
  const inferredGenres = inferGenres({ title, artist, tags, secondaryType: secondary });
  if (r.wiki) {
    return {
      id,
      title,
      artist,
      artistMbids: [],
      date,
      type,
      secondaryType: secondary,
      tags,
      inferredGenres,
      hasCover: Boolean(r.wiki.cover),
      coverUrl: r.wiki.cover,
      coverUrlLg: r.wiki.cover,
      listenCount: 0,
      ratingVotes: 0,
      ratingValue: null,
      artistStature: artistStature(artist, title),
      isFriday: date === friday,
      inSelectedWeek: date >= bounds.start && date <= bounds.end,
      sources: ["Wikipedia"],
      links: { ...searchLinks(artist, title), rym: r.wiki.url || searchLinks(artist, title).rym },
      listen: { apple: null, spotify: null, netease: null, bandcamp: null },
    };
  }
  if (r.rym) {
    const rv = r.rym.userScore != null ? Math.round((r.rym.userScore / 20) * 100) / 100 : null;
    return {
      id,
      title,
      artist,
      artistMbids: [],
      date,
      type,
      secondaryType: secondary,
      tags,
      inferredGenres,
      hasCover: Boolean(r.rym.cover),
      coverUrl: r.rym.cover,
      coverUrlLg: r.rym.cover,
      listenCount: 0,
      ratingVotes: 0,
      ratingValue: rv,
      artistStature: artistStature(artist, title),
      isFriday: date === friday,
      inSelectedWeek: date >= bounds.start && date <= bounds.end,
      sources: ["RYM"],
      links: { ...searchLinks(artist, title), rym: r.rym.url || searchLinks(artist, title).rym },
      listen: { apple: null, spotify: null, netease: null, bandcamp: null },
    };
  }
  // AOTY 条目:封面/链接直连 AOTY,userScore(0–100)折算为 0–5 评分信号
  if (r.aoty) {
    const rv = r.aoty.userScore != null ? Math.round((r.aoty.userScore / 20) * 100) / 100 : null;
    return {
      id,
      title,
      artist,
      artistMbids: [],
      date,
      type,
      secondaryType: secondary,
      tags,
      inferredGenres,
      hasCover: Boolean(r.aoty.cover),
      coverUrl: r.aoty.cover,
      coverUrlLg: r.aoty.cover,
      listenCount: 0,
      ratingVotes: 0,
      ratingValue: rv,
      artistStature: artistStature(artist, title),
      isFriday: date === friday,
      inSelectedWeek: date >= bounds.start && date <= bounds.end,
      sources: ["AOTY"],
      links: { ...searchLinks(artist, title), aoty: r.aoty.url },
      listen: { apple: null, spotify: null, netease: null, bandcamp: null },
    };
  }
  // Bandcamp 条目:封面与链接直连 Bandcamp,不走 CAA / MusicBrainz
  if (r.bc) {
    const art = r.bc.art;
    return {
      id,
      title,
      artist,
      artistMbids: [],
      date,
      type,
      secondaryType: secondary,
      tags,
      inferredGenres,
      hasCover: art != null,
      coverUrl: art != null ? `https://f4.bcbits.com/img/a${art}_2.jpg` : null,
      coverUrlLg: art != null ? `https://f4.bcbits.com/img/a${art}_10.jpg` : null,
      listenCount: 0,
      ratingVotes: 0,
      ratingValue: r.aotyScore != null ? Math.round((r.aotyScore / 20) * 100) / 100 : null,
      artistStature: artistStature(artist, title),
      isFriday: date === friday,
      inSelectedWeek: date >= bounds.start && date <= bounds.end,
      sources: r.aotyScore != null ? ["Bandcamp", "AOTY"] : ["Bandcamp"],
      links: { ...searchLinks(artist, title), bandcamp: r.bc.url },
      listen: { apple: null, spotify: null, netease: null, bandcamp: r.bc.url },
    };
  }
  // MB 补充条目没有 CAA id,乐观地走 release-group 封面地址,前端加载失败自动降级为首字母
  const hasCover = Boolean(r.caa_id && r.caa_release_mbid) || Boolean(r.mb_supplement);
  const covers = coverUrls(r.caa_release_mbid ?? null, r.release_group_mbid ?? id);
  const mb = r.release_group_mbid
    ? `https://musicbrainz.org/release-group/${r.release_group_mbid}`
    : searchLinks(artist, title).musicbrainz;
  return {
    id,
    title,
    artist,
    artistMbids: r.artist_mbids ?? [],
    date,
    type,
    secondaryType: secondary,
    tags,
    inferredGenres,
    hasCover,
    coverUrl: hasCover ? covers.sm : null,
    coverUrlLg: hasCover ? covers.lg : null,
    listenCount: r.listen_count ?? 0,
    ratingVotes: 0,
    ratingValue: r.aotyScore != null ? Math.round((r.aotyScore / 20) * 100) / 100 : null,
    artistStature: artistStature(artist, title),
    isFriday: date === friday,
    inSelectedWeek: date >= bounds.start && date <= bounds.end,
    sources: r.aotyScore != null ? ["ListenBrainz", "MusicBrainz", "AOTY"] : ["ListenBrainz", "MusicBrainz"],
    links: { ...searchLinks(artist, title), musicbrainz: mb },
    listen: { apple: null, spotify: null, netease: null, bandcamp: null },
  };
}

function pickForWeek(raw: LbRelease[], friday: string, bounds: Bounds): CatalogAlbum[] {
  const { start, end } = bounds;
  const lineStart = addDays(end, -20);
  const counts = artistWindowCounts(raw, lineStart, end);
  const map = new Map<string, CatalogAlbum>();
  for (const r of raw) {
    const album = toAlbum(r, friday, bounds);
    if (!album) continue;
    const inThisWeek = album.inSelectedWeek;
    const experimental =
      album.inferredGenres.length > 0 ||
      album.artistStature >= 70 ||
      (album.secondaryType ?? "").toLowerCase().includes("field recording") ||
      (album.secondaryType ?? "").toLowerCase().includes("spoken");
    if (!inThisWeek && !experimental) continue;
    if (album.date < start && !experimental) continue;
    album.artistWindowReleases = counts.get(album.artist.trim().toLowerCase()) ?? 1;
    const prev = map.get(album.id);
    if (!prev || Number(album.hasCover) > Number(prev.hasCover)) map.set(album.id, album);
  }

  const all = [...map.values()];
  const week = all.filter((a) => a.date >= start && a.date <= end);
  const extra = all
    .filter((a) => !(a.date >= start && a.date <= end) && a.hasCover && (a.inferredGenres.length > 0 || a.artistStature >= 80))
    .sort((a, b) => b.artistStature - a.artistStature || Number(b.hasCover) - Number(a.hasCover))
    .slice(0, 60);

  week.sort((a, b) => Number(b.hasCover) - Number(a.hasCover) || b.date.localeCompare(a.date));
  // 当周发行全部进目录,由主页口味/过滤再筛。8000 只挡极端膨胀,正常一周到不了。
  const WEEK_ALBUM_HARD_CAP = 8000;
  const weekAlbums = week.length > WEEK_ALBUM_HARD_CAP ? week.slice(0, WEEK_ALBUM_HARD_CAP) : week;
  const merged = [...weekAlbums];
  const seen = new Set(merged.map((a) => a.id));
  for (const a of extra) {
    if (seen.has(a.id)) continue;
    merged.push(a);
    seen.add(a.id);
  }
  return merged;
}

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, n + i));
  return out;
}

async function fetchTagMap(ids: string[]): Promise<Record<string, string[]>> {
  const bag: Record<string, string[]> = {};
  await Promise.all(
    chunks(ids, 50).map(async (group) => {
      const url = `https://api.listenbrainz.org/1/metadata/release_group/?inc=tag&release_group_mbids=${group.join(",")}`;
      const body = (await lbJson(url)) as Record<
        string,
        { tag?: { artist?: Array<{ tag: string }>; release_group?: Array<{ tag: string }> } }
      >;
      for (const [id, rec] of Object.entries(body ?? {})) {
        const tags = [...(rec.tag?.release_group ?? []), ...(rec.tag?.artist ?? [])]
          .map((t) => t.tag?.trim())
          .filter((t): t is string => Boolean(t) && !ROLE_TAGS.has(t.toLowerCase()));
        bag[id] = [...new Set(tags)];
      }
    }),
  );
  return bag;
}

/** 艺人标签跨请求缓存(艺人风格几乎不变,24h 足够;上限防内存膨胀)。 */
const artistTagMemory = new Map<string, { at: number; tags: string[] }>();
const ARTIST_TAG_MS = 24 * 60 * 60 * 1000;
const ARTIST_TAG_CAP = 6000;

/**
 * 批量抓艺人级风格标签(ListenBrainz metadata/artist,底层就是 MusicBrainz 的艺人 genre 库)。
 * 用途:很多冷门新发行本身零标签,但艺人是有清晰风格画像的——把艺人风格并进口味匹配,
 * 避免高质量新专因「发行页还没人打标签」被漏掉。
 */
async function fetchArtistTagMap(mbids: string[]): Promise<Record<string, string[]>> {
  const bag: Record<string, string[]> = {};
  const missing: string[] = [];
  const now = Date.now();
  for (const id of mbids) {
    const hit = artistTagMemory.get(id);
    if (hit && now - hit.at < ARTIST_TAG_MS) bag[id] = hit.tags;
    else missing.push(id);
  }
  await Promise.all(
    chunks(missing, 40).map(async (group) => {
      const url = `https://api.listenbrainz.org/1/metadata/artist/?artist_mbids=${group.join(",")}&inc=tag`;
      const body = (await lbJson(url)) as Array<{
        artist_mbid?: string;
        tag?: { artist?: Array<{ tag?: string; count?: number }> };
      }>;
      for (const rec of body ?? []) {
        if (!rec.artist_mbid) continue;
        const tags = (rec.tag?.artist ?? [])
          .filter((t): t is { tag: string; count?: number } => Boolean(t.tag))
          .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
          .map((t) => t.tag.trim())
          .filter((t) => t && !ROLE_TAGS.has(t.toLowerCase()))
          .slice(0, 12);
        bag[rec.artist_mbid] = tags;
        artistTagMemory.set(rec.artist_mbid, { at: now, tags });
      }
      // 查过但没标签的也记下来,避免下次重复打接口
      for (const id of group) {
        if (!(id in bag)) {
          bag[id] = [];
          artistTagMemory.set(id, { at: now, tags: [] });
        }
      }
    }),
  );
  if (artistTagMemory.size > ARTIST_TAG_CAP) {
    const entries = [...artistTagMemory.entries()].sort((a, b) => a[1].at - b[1].at);
    for (const [k] of entries.slice(0, entries.length - ARTIST_TAG_CAP)) artistTagMemory.delete(k);
  }
  return bag;
}

/** 艺人历史发行标签缓存(与 LB 艺人标签分开存:LB 查空 ≠ 历史发行也查空)。 */
const backCatalogMemory = new Map<string, { at: number; tags: string[] }>();

/**
 * 二段兜底:回翻艺人在 MusicBrainz 的历史发行(browse + inc=tags,匿名约 1 req/s),
 * 聚合其过往专辑的风格标签作为「艺人风格」。针对发行与艺人在 LB 都零标签的冷门新专——
 * 艺人以前的作品往往已被打过标签。预算制顺序抓取,结果缓存 24h,
 * 覆盖面随每次 30 分钟缓存重建与用户深扫逐步累积。
 */
async function fetchBackCatalogTags(mbids: string[], budgetMs: number): Promise<Record<string, string[]>> {
  const bag: Record<string, string[]> = {};
  const now = Date.now();
  const deadline = now + budgetMs;
  const pending: string[] = [];
  for (const id of mbids) {
    const hit = backCatalogMemory.get(id);
    if (hit && now - hit.at < ARTIST_TAG_MS) bag[id] = hit.tags;
    else pending.push(id);
  }
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (const id of pending) {
    if (Date.now() + 1200 > deadline) break;
    try {
      const res = await fetch(
        `https://musicbrainz.org/ws/2/release-group?artist=${id}&limit=50&inc=tags&fmt=json`,
        { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(8000) },
      );
      if (res.ok) {
        const body = (await res.json()) as {
          "release-groups"?: Array<{ tags?: Array<{ name?: string; count?: number }> }>;
        };
        const counts = new Map<string, number>();
        for (const rg of body["release-groups"] ?? []) {
          for (const t of rg.tags ?? []) {
            const name = t.name?.trim();
            if (!name || ROLE_TAGS.has(name.toLowerCase())) continue;
            counts.set(name, (counts.get(name) ?? 0) + Math.max(1, t.count ?? 1));
          }
        }
        const tags = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([n]) => n)
          .slice(0, 12);
        bag[id] = tags;
        backCatalogMemory.set(id, { at: Date.now(), tags });
      }
    } catch {
      // 单个艺人失败不影响其余
    }
    await sleep(1000);
  }
  if (backCatalogMemory.size > ARTIST_TAG_CAP) {
    const entries = [...backCatalogMemory.entries()].sort((a, b) => a[1].at - b[1].at);
    for (const [k] of entries.slice(0, entries.length - ARTIST_TAG_CAP)) backCatalogMemory.delete(k);
  }
  return bag;
}

async function fetchPopMap(ids: string[]): Promise<Record<string, { listens: number; users: number }>> {
  const bag: Record<string, { listens: number; users: number }> = {};
  await Promise.all(
    chunks(ids, 80).map(async (group) => {
      const body = (await lbJson("https://api.listenbrainz.org/1/popularity/release-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_group_mbids: group }),
      })) as Array<{
        release_group_mbid: string;
        total_listen_count: number | null;
        total_user_count: number | null;
      }>;
      for (const row of body ?? []) {
        bag[row.release_group_mbid] = {
          listens: row.total_listen_count ?? 0,
          users: row.total_user_count ?? 0,
        };
      }
    }),
  );
  return bag;
}

async function hydrate(albums: CatalogAlbum[], deep = false): Promise<CatalogAlbum[]> {
  // Bandcamp 条目是合成 id(bc-xxx),不能混进 MBID 批量接口,否则整批请求 400
  const isMbid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s);
  const ids = albums.map((a) => a.id).filter(isMbid);
  if (ids.length === 0) return albums;
  try {
    // 艺人风格补抓:发行本身没推出风格的专辑优先(它们最依赖艺人维度兜底),再补其余,上限 600 位
    const mbidOrder: string[] = [];
    const seen = new Set<string>();
    const pushMbids = (list: CatalogAlbum[]) => {
      for (const a of list) {
        for (const m of a.artistMbids) {
          if (!seen.has(m)) {
            seen.add(m);
            mbidOrder.push(m);
          }
        }
      }
    };
    pushMbids(albums.filter((a) => a.inferredGenres.length === 0));
    pushMbids(albums.filter((a) => a.inferredGenres.length > 0));
    const [tags, pop, artistTags] = await Promise.all([
      fetchTagMap(ids),
      fetchPopMap(ids),
      fetchArtistTagMap(mbidOrder.slice(0, 600)),
    ]);
    const enriched = albums.map((album) => {
      const extraTags = tags[album.id] ?? [];
      const mergedTags = [...new Set([...album.tags, ...extraTags])];
      const popRow = pop[album.id];
      // 艺人级风格:只用艺人标签推断(不掺标题/艺名的弱启发),与发行级风格分开存
      const ownArtistTags = [...new Set(album.artistMbids.flatMap((m) => artistTags[m] ?? []))];
      const artistGenres = ownArtistTags.length
        ? inferGenres({ title: "", artist: "", tags: ownArtistTags })
        : [];
      return {
        ...album,
        tags: mergedTags,
        inferredGenres: inferGenres({
          title: album.title,
          artist: album.artist,
          tags: mergedTags,
          secondaryType: album.secondaryType,
        }),
        artistGenres,
        listenCount: Math.max(album.listenCount, popRow?.listens ?? 0),
        ratingVotes: Math.max(album.ratingVotes, popRow?.users ?? 0),
      };
    });

    // 二段兜底:发行与艺人两级都还没有风格的,回翻艺人历史发行聚合标签(预算制,缓存累积)
    const bare = enriched.filter(
      (a) => a.inferredGenres.length === 0 && (a.artistGenres?.length ?? 0) === 0 && a.artistMbids.length > 0,
    );
    if (bare.length === 0) return enriched;
    const bareMbids: string[] = [];
    const seenBare = new Set<string>();
    for (const a of bare) {
      for (const m of a.artistMbids) {
        if (!seenBare.has(m)) {
          seenBare.add(m);
          bareMbids.push(m);
        }
      }
    }
    const back = await fetchBackCatalogTags(bareMbids, deep ? 25000 : 6000);
    return enriched.map((a) => {
      if (a.inferredGenres.length > 0 || (a.artistGenres?.length ?? 0) > 0) return a;
      const t = [...new Set(a.artistMbids.flatMap((m) => back[m] ?? []))];
      if (t.length === 0) return a;
      return { ...a, artistGenres: inferGenres({ title: "", artist: "", tags: t }) };
    });
  } catch {
    return albums;
  }
}

/** 同一周的完整构建只跑一份:SSR 快路径的后台构建与并发请求共享同一个 Promise。 */
const weekBuilds = new Map<string, Promise<WeekCatalog>>();

async function buildWeekCatalog(friday: string, start: string, end: string, deep: boolean): Promise<WeekCatalog> {
  const cacheKey = `${friday}|${start}|${end}`;
  try {
      // 四个来源互相独立:一个失败(如 ListenBrainz 高峰期超时)不拖垮整周目录
      const scan = scanWindow(start, end);
      const [lbSettled, mbSettled, bcSettled] = await Promise.allSettled([
        loadFresh(LB_DAYS),
        loadMbWeek(scan.start, scan.end, deep),
        loadBandcampWeek(scan.start, scan.end, deep),
        loadRymPublic(),
      ]);
      const lbRaw = lbSettled.status === "fulfilled" ? lbSettled.value : [];
      const mbExtra = mbSettled.status === "fulfilled" ? mbSettled.value : [];
      const bcExtra = bcSettled.status === "fulfilled" ? bcSettled.value : [];
      const webRaw = loadWebWeek(scan.start, scan.end);
      const aotyRaw = webRaw.filter((a) => a.source === "aoty");
      const toWebRelease = (a: WebItem): LbRelease => {
        const slug = `${a.artist}|${a.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
        if (a.source === "rym") {
          return {
            release_mbid: `rym-${slug}`,
            release_name: a.title,
            artist_credit_name: a.artist,
            release_date: a.date,
            release_group_primary_type: a.type,
            release_tags: a.tags,
            rym: { url: a.url, cover: a.cover, userScore: a.userScore },
          };
        }
        if (a.source === "wiki") {
          return {
            release_mbid: `wiki-${slug}`,
            release_name: a.title,
            artist_credit_name: a.artist,
            release_date: a.date,
            release_group_primary_type: a.type,
            release_tags: a.tags,
            wiki: { url: a.url, cover: a.cover },
          };
        }
        return {
          release_mbid: `aoty-${a.url.replace(/\D+/g, "").slice(0, 12) || slug}`,
          release_name: a.title,
          artist_credit_name: a.artist,
          release_date: a.date,
          release_group_primary_type: a.type,
          aoty: { url: a.url, cover: a.cover, userScore: a.userScore },
        };
      };
      const aotyExtra = aotyRaw.map(toWebRelease);
      const rymExtra = webRaw.filter((a) => a.source === "rym").map(toWebRelease);
      const wikiExtra = webRaw.filter((a) => a.source === "wiki").map(toWebRelease);
      if (lbRaw.length === 0 && mbExtra.length === 0 && bcExtra.length === 0 && aotyExtra.length === 0 && rymExtra.length === 0 && wikiExtra.length === 0) {
        throw lbSettled.status === "rejected" ? lbSettled.reason : new Error("上游目录均不可用");
      }
      const known = new Set(lbRaw.map((r) => r.release_group_mbid).filter(Boolean));
      const mbMerged = [...lbRaw, ...mbExtra.filter((r) => !known.has(r.release_group_mbid))];
      const nameKey = (r: LbRelease) =>
        `${(r.artist_credit_name ?? "").trim().toLowerCase()}|${(r.release_name ?? "").trim().toLowerCase()}`;
      // AOTY 用户评分按 艺人|标题 建索引:先把评分注入到 MB/LB/Bandcamp 的同名条目
      // (给有风格但零评分的好专辑补上真实关注度信号),同名条目已带 AOTY 分则不再重复计入独有池。
      const aotyScoreByName = new Map<string, number>();
      for (const a of aotyRaw) {
        if (a.userScore != null) {
          const k = `${a.artist.trim().toLowerCase()}|${a.title.trim().toLowerCase()}`;
          if (!aotyScoreByName.has(k)) aotyScoreByName.set(k, a.userScore);
        }
      }
      const injectAoty = (r: LbRelease) => {
        const s = aotyScoreByName.get(nameKey(r));
        if (s != null) return { ...r, aotyScore: s };
        return r;
      };
      // 无 MBID 来源(Bandcamp / AOTY)按 艺人|标题 去重,MB/LB 里已有的同名发行优先(保留 MBID 元数据)
      const knownNames = new Set(mbMerged.map(nameKey));
      const raw = mbMerged.map(injectAoty);
      for (const r of [...aotyExtra, ...rymExtra, ...wikiExtra, ...bcExtra]) {
        const k = nameKey(r);
        if (knownNames.has(k)) continue;
        knownNames.add(k);
        raw.push(r.bc ? injectAoty(r) : r);
      }
      const picked = pickForWeek(raw, friday, { start, end });
      // 深扫时给足元数据补全预算(含艺人历史发行回翻);普通请求 14s 内交卷,缺的部分由缓存逐步补齐
      const hydration = hydrate(picked, deep);
      let timedOut = false;
      const albums = await Promise.race([
        hydration,
        new Promise<CatalogAlbum[]>((resolve) =>
          setTimeout(() => {
            timedOut = true;
            resolve(picked);
          }, deep ? 45000 : 14000),
        ),
      ]);
      if (timedOut) {
        // 补水没跑完:半成品(缺标签/封面,口味过筛会近乎全灭)只回给本次请求,
        // 绝不写缓存——否则这份 4 张空封面的快照会被钉住 30 分钟。
        // 补水在后台继续,完成后再落缓存,下一次请求就是完整结果。
        void hydration
          .then((full) => {
            rememberAlbums({ at: Date.now(), ver: CACHE_VER, key: cacheKey, albums: full, scanned: raw.length, webGen: webPoolGen() });
          })
          .catch(() => {});
      } else {
        rememberAlbums({ at: Date.now(), ver: CACHE_VER, key: cacheKey, albums, scanned: raw.length, webGen: webPoolGen() });
      }
      return {
        friday,
        weekStart: start,
        weekEnd: end,
        fetchedAt: new Date().toISOString(),
        sourceLabel: "ListenBrainz · MusicBrainz · Bandcamp · AOTY · RYM · Wikipedia · Cover Art Archive",
        scanned: raw.length,
        albums,
        partial: timedOut,
      };
    } catch (err) {
      return {
        friday,
        weekStart: start,
        weekEnd: end,
        fetchedAt: new Date().toISOString(),
        sourceLabel: "ListenBrainz",
        scanned: 0,
        albums: [],
        error: err instanceof Error ? err.message : "目录暂时不可用",
      };
    }
}

function wrapMemory(m: AlbumCache, friday: string, start: string, end: string, albums: CatalogAlbum[]): WeekCatalog {
  return {
    friday,
    weekStart: start,
    weekEnd: end,
    fetchedAt: new Date(m.at).toISOString(),
    sourceLabel: "ListenBrainz · MusicBrainz · Bandcamp · AOTY · RYM · Wikipedia · Cover Art Archive",
    scanned: m.scanned,
    albums,
  };
}

/** 内存缓存命中时直接组装响应(不碰网络)。含更大窗口的切片:月墙已在内存时,切到该月里的周零等待。 */
function memoryHit(friday: string, start: string, end: string): WeekCatalog | null {
  const cacheKey = `${friday}|${start}|${end}`;
  const pool = [albumMemory, ...albumMemoryList].filter((m): m is AlbumCache => Boolean(m && cacheFresh(m)));
  const exact = pool.find((m) => m.key === cacheKey);
  if (exact) return wrapMemory(exact, friday, start, end, exact.albums);

  for (const m of pool) {
    const bits = m.key.split("|");
    const mStart = bits[1] ?? "";
    const mEnd = bits[2] ?? "";
    if (!mStart || !mEnd || mStart > start || mEnd < end) continue;
    const albums = m.albums.map((a) => ({
      ...a,
      inSelectedWeek: Boolean(a.date && a.date >= start && a.date <= end),
    }));
    return wrapMemory(m, friday, start, end, albums);
  }
  return null;
}

export const getWeekCatalog = createServerFn({ method: "POST" })
  .validator((d: { friday: string; weekStart?: string; weekEnd?: string; deep?: boolean; fast?: boolean }) => d)
  .handler(async ({ data }): Promise<WeekCatalog> => {
    const friday = data.friday;
    const fallback = weekBounds(friday);
    const start = data.weekStart ?? fallback.start;
    const end = data.weekEnd ?? fallback.end;
    const deep = Boolean(data.deep);
    const cacheKey = `${friday}|${start}|${end}`;

    // 内存缓存新鲜就零网络直接回(检查前置,不再先等一轮上游请求)
    if (!deep) {
      const hit = memoryHit(friday, start, end);
      if (hit) return hit;
    }

    // 同周构建去重:并发请求共享一份进行中的构建(深扫与普通构建分开)
    const buildKey = `${cacheKey}|${deep ? "deep" : "std"}`;
    const runBuild = () => {
      let p = weekBuilds.get(buildKey);
      if (!p) {
        p = buildWeekCatalog(friday, start, end, deep).finally(() => weekBuilds.delete(buildKey));
        weekBuilds.set(buildKey, p);
      }
      return p;
    };

    // 快路径(SSR 首屏):缓存没命中就立刻交白卷 + 后台开建,
    // 页面先渲染出框架,前端标记 partial 后马上重新请求完整数据
    if (data.fast && !deep) {
      void runBuild().catch(() => {});
      return {
        friday,
        weekStart: start,
        weekEnd: end,
        fetchedAt: new Date().toISOString(),
        sourceLabel: "ListenBrainz · MusicBrainz · Bandcamp · AOTY · RYM · Wikipedia · Cover Art Archive",
        scanned: 0,
        albums: [],
        partial: true,
      };
    }

    return runBuild();
  });
