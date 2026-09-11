import { normalizeKey } from "@/lib/catalog/gold";
import type { CatalogAlbum } from "@/lib/catalog/types";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;

export type AppSearch = {
  album?: string;
  artist?: string;
  title?: string;
  week?: string;
  month?: string;
};

function str(raw: Record<string, unknown>, key: string): string | undefined {
  const v = raw[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** 主页查询串:插件点封面时带上专辑与时期。 */
export function parseAppSearch(raw: Record<string, unknown>): AppSearch {
  const week = str(raw, "week");
  const month = str(raw, "month");
  return {
    album: str(raw, "album"),
    artist: str(raw, "artist"),
    title: str(raw, "title"),
    week: week && ISO_DAY.test(week) ? week : undefined,
    month: month && YM.test(month) ? month : undefined,
  };
}

export function hasAlbumTarget(link: AppSearch): boolean {
  return Boolean(link.album || (link.artist && link.title));
}

export function albumMatchKey(artist: string, title: string): string {
  return `${normalizeKey(artist)}||${normalizeKey(title)}`;
}

/** 插件深链先画出详情壳,目录到位后再换成完整条目。 */
export function stubAlbumFromLink(link: AppSearch): CatalogAlbum | null {
  if (!link.artist || !link.title) return null;
  return {
    id: link.album || `link-${normalizeKey(link.artist)}-${normalizeKey(link.title)}`,
    title: link.title,
    artist: link.artist,
    artistMbids: [],
    date: link.week || `${link.month ?? "2026-01"}-01`,
    type: "Album",
    secondaryType: null,
    tags: [],
    inferredGenres: [],
    hasCover: false,
    coverUrl: null,
    coverUrlLg: null,
    listenCount: 0,
    ratingVotes: 0,
    ratingValue: null,
    artistStature: 0,
    isFriday: false,
    inSelectedWeek: true,
    sources: [],
    links: { musicbrainz: "", discogs: "", bandcamp: "", aoty: "", rym: "" },
    listen: { apple: null, spotify: null, netease: null, bandcamp: null },
  };
}

export function findLinkedAlbum<T extends { id: string; artist: string; title: string }>(
  pools: T[],
  target: AppSearch,
): T | undefined {
  if (target.album) {
    const byId = pools.find((a) => a.id === target.album);
    if (byId) return byId;
  }
  if (target.artist && target.title) {
    const key = albumMatchKey(target.artist, target.title);
    return pools.find((a) => albumMatchKey(a.artist, a.title) === key);
  }
  return undefined;
}
