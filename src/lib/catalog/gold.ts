/**
 * 参考标准:一份「一专一代表曲」的歌单,定义雷达的品味取向。
 * 内置默认参考(364 张,构建期打包);用户可导入任意网易云歌单替换之。
 * 参考条目享受硬性召回:永远展示、不参与算法过滤、可跨周搜索。
 */
import { isPublicDemo } from "../demo";
import { searchLinks } from "./links";
import { isUnknownReleaseDate, neutralizeGuessedDates } from "./release-date";
import type { CatalogAlbum } from "./types";
import { weekKeyOf } from "./weeks";
import defaultRaw from "./gold-2026.json";

export type GoldEntry = {
  albumId: number;
  title: string;
  artist: string;
  date: string;
  songId: number;
  song: string;
  pic: string | null;
  /** 只有年份/年月,或来源未给出精确日。 */
  dateApprox?: boolean;
  /** 完全不知道发行日(不再用今天顶替)。 */
  dateUnknown?: boolean;
};

/** 内置默认参考(可被用户导入的歌单替换)。公开演示构建为空，避免把亲选打进访客包。 */
export const DEFAULT_REF_ENTRIES = (isPublicDemo ? [] : defaultRaw) as GoldEntry[];

export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function pic(url: string | null, px: number): string | null {
  if (!url) return null;
  // 缩图参数仅对网易云图床有效;其他来源(如 Cover Art Archive)原样使用。
  return url.includes("music.126.net") ? `${url}?param=${px}y${px}` : url;
}

/** 把任意字符串(如 MusicBrainz ID)映射为稳定的负数 id,与网易云正数 id 不冲突。 */
export function syntheticId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return -Math.abs(h || 1);
}

/** 手动加入参考体系的条目(来自全网检索或自动雷达,无代表曲)。 */
export function makeExtraEntry(a: {
  sourceId: string;
  title: string;
  artist: string;
  date: string;
  pic: string | null;
}): GoldEntry {
  return {
    albumId: syntheticId(a.sourceId),
    title: a.title,
    artist: a.artist,
    date: a.date,
    songId: 0,
    song: "",
    pic: a.pic,
  };
}

export function entryToAlbum(g: GoldEntry): CatalogAlbum {
  const albumUrl = g.albumId > 0 ? `https://music.163.com/#/album?id=${g.albumId}` : null;
  const songUrl = `https://music.163.com/#/song?id=${g.songId}`;
  return {
    id: `ntes-${g.albumId}`,
    title: g.title,
    artist: g.artist,
    artistMbids: [],
    date: g.date,
    dateUnknown: Boolean(g.dateUnknown || isUnknownReleaseDate(g.date)),
    type: "Album",
    secondaryType: null,
    tags: [],
    inferredGenres: [],
    hasCover: Boolean(g.pic),
    coverUrl: pic(g.pic, 300),
    coverUrlLg: pic(g.pic, 800),
    listenCount: 0,
    ratingVotes: 0,
    ratingValue: null,
    artistStature: 0,
    isFriday: false,
    inSelectedWeek: true,
    sources: ["参考池"],
    links: searchLinks(g.artist, g.title),
    listen: { apple: null, spotify: null, netease: albumUrl, bandcamp: null },
    gold: true,
    repTrack: g.songId > 0 && g.song ? { name: g.song, url: songUrl } : null,
  };
}

export type Reference = {
  albums: CatalogAlbum[];
  /** 自然周(周一 ISO)→ 该周参考专辑;2026 之前归 earlier 桶。 */
  byWeek: Map<string, CatalogAlbum[]>;
  /** artist||title 去重键,用于剔除与参考重复的自动条目。 */
  dupKeys: Set<string>;
};

export function buildReference(input: GoldEntry[]): Reference {
  // 多源合并后可能重复,按 artist||title 去重(先到先得)。
  const seenKeys = new Set<string>();
  const entries: GoldEntry[] = [];
  for (const g of input) {
    const k = `${normalizeKey(g.artist)}||${normalizeKey(g.title)}`;
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    entries.push(g);
  }
  const albums = neutralizeGuessedDates(entries).map(entryToAlbum);
  const byWeek = new Map<string, CatalogAlbum[]>();
  for (const a of albums) {
    if (a.dateUnknown) continue;
    const key = weekKeyOf(a.date);
    const list = byWeek.get(key) ?? [];
    list.push(a);
    byWeek.set(key, list);
  }
  for (const list of byWeek.values()) {
    list.sort((x, y) => x.date.localeCompare(y.date) || x.title.localeCompare(y.title));
  }
  const dupKeys = new Set(entries.map((g) => `${normalizeKey(g.artist)}||${normalizeKey(g.title)}`));
  return { albums, byWeek, dupKeys };
}
