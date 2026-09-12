/**
 * 用户专辑列表:收藏是默认列表,其余可自建。
 * 条目按艺人+专名去重,顺序由用户拖拽决定。
 */
import { entryToAlbum, normalizeKey, type GoldEntry } from "./gold";
import { searchLinks } from "./links";
import { isUnknownReleaseDate } from "./release-date";
import { entryKey, type ImportItem } from "./sources";
import type { CatalogAlbum, ScoredAlbum } from "./types";

export const SAVED_LIST_ID = "list-saved";

export type ListAlbum = {
  key: string;
  artist: string;
  title: string;
  date?: string;
  pic?: string | null;
  albumId?: string;
};

export type UserList = {
  id: string;
  name: string;
  /** 默认收藏:可改名,不能删。 */
  locked: boolean;
  entries: ListAlbum[];
};

export type AlbumSnap = {
  id?: string;
  artist: string;
  title: string;
  date?: string;
  coverUrl?: string | null;
  pic?: string | null;
};

export function listEntryKey(artist: string, title: string): string {
  return `${normalizeKey(artist)}||${normalizeKey(title)}`;
}

export function makeSavedList(name = "收藏"): UserList {
  return { id: SAVED_LIST_ID, name, locked: true, entries: [] };
}

export function newListId(): string {
  return `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function albumToListItem(a: AlbumSnap): ListAlbum | null {
  const artist = String(a.artist || "").trim();
  const title = String(a.title || "").trim();
  if (artist && title) {
    return {
      key: listEntryKey(artist, title),
      artist,
      title,
      date: a.date,
      pic: a.pic ?? a.coverUrl ?? null,
      albumId: a.id,
    };
  }
  if (a.id) {
    return { key: `id:${a.id}`, artist: artist || "—", title: title || a.id, date: a.date, pic: a.pic ?? a.coverUrl ?? null, albumId: a.id };
  }
  return null;
}

export function goldToListItem(e: GoldEntry): ListAlbum {
  return {
    key: entryKey(e),
    artist: e.artist,
    title: e.title,
    date: e.date,
    pic: e.pic,
    albumId: `ntes-${e.albumId}`,
  };
}

export function itemsToListAlbums(items: ImportItem[]): ListAlbum[] {
  const out: ListAlbum[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const item = albumToListItem({
      artist: it.artist,
      title: it.title,
      date: it.date,
      pic: it.pic,
    });
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key);
    out.push(item);
  }
  return out;
}

export function mergeListEntries(prev: ListAlbum[], incoming: ListAlbum[]): { entries: ListAlbum[]; added: number; skipped: number } {
  const map = new Map<string, ListAlbum>();
  for (const e of prev) map.set(e.key, e);
  let added = 0;
  let skipped = 0;
  for (const e of incoming) {
    const hit = map.get(e.key);
    if (hit) {
      skipped += 1;
      map.set(e.key, {
        ...hit,
        artist: hit.artist || e.artist,
        title: hit.title || e.title,
        date: hit.date || e.date,
        pic: hit.pic || e.pic,
        albumId: hit.albumId || e.albumId,
      });
      continue;
    }
    map.set(e.key, e);
    added += 1;
  }
  return { entries: [...map.values()], added, skipped };
}

export function listHasAlbum(list: UserList | undefined, album: AlbumSnap): boolean {
  if (!list) return false;
  const item = albumToListItem(album);
  if (!item) return false;
  return list.entries.some((e) => e.key === item.key || (album.id && e.albumId === album.id));
}

export function savedIdsOf(lists: UserList[]): string[] {
  const saved = lists.find((l) => l.id === SAVED_LIST_ID);
  if (!saved) return [];
  return [...new Set(saved.entries.map((e) => e.albumId).filter((id): id is string => Boolean(id)))];
}

export function ensureSavedList(lists: unknown, savedIds: unknown): UserList[] {
  const raw = Array.isArray(lists) ? (lists as UserList[]) : [];
  const cleaned = raw
    .filter((l) => l && typeof l.id === "string" && Array.isArray(l.entries))
    .map((l) => ({
      id: l.id,
      name: String(l.name || "列表").slice(0, 48),
      locked: l.id === SAVED_LIST_ID || Boolean(l.locked),
      entries: l.entries
        .map((e) => ({
          key: String(e.key || listEntryKey(e.artist || "", e.title || "")),
          artist: String(e.artist || ""),
          title: String(e.title || ""),
          date: e.date,
          pic: e.pic ?? null,
          albumId: e.albumId,
        }))
        .filter((e) => e.key),
    }));
  let next = cleaned.some((l) => l.id === SAVED_LIST_ID) ? cleaned : [makeSavedList(), ...cleaned];
  const fav = next.find((l) => l.id === SAVED_LIST_ID);
  if (fav && fav.entries.length === 0 && Array.isArray(savedIds) && savedIds.length) {
    const migrated = (savedIds as unknown[])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
      .map((id) => ({ key: `id:${id}`, artist: "", title: "", albumId: id }) satisfies ListAlbum);
    next = next.map((l) => (l.id === SAVED_LIST_ID ? { ...l, locked: true, entries: migrated } : l));
  }
  return next.map((l) => (l.id === SAVED_LIST_ID ? { ...l, locked: true } : l));
}

export function listItemToAlbum(e: ListAlbum): CatalogAlbum {
  if (e.albumId?.startsWith("ntes-") && e.artist && e.title) {
    const n = Number(e.albumId.slice(5));
    if (Number.isFinite(n)) {
      return entryToAlbum({
        albumId: n,
        title: e.title,
        artist: e.artist,
        date: e.date || "",
        songId: 0,
        song: "",
        pic: e.pic ?? null,
      });
    }
  }
  const pic = e.pic ?? null;
  return {
    id: e.albumId || `list:${e.key}`,
    title: e.title || e.albumId || e.key,
    artist: e.artist || "—",
    artistMbids: [],
    date: e.date || "",
    dateUnknown: !e.date || isUnknownReleaseDate(e.date),
    type: "Album",
    secondaryType: null,
    tags: [],
    inferredGenres: [],
    hasCover: Boolean(pic),
    coverUrl: pic,
    coverUrlLg: pic,
    listenCount: 0,
    ratingVotes: 0,
    ratingValue: null,
    artistStature: 0,
    isFriday: false,
    inSelectedWeek: true,
    sources: ["列表"],
    links: searchLinks(e.artist || "", e.title || ""),
    listen: { apple: null, spotify: null, netease: null, bandcamp: null },
    gold: false,
    repTrack: null,
  };
}

const BLANK_SCORES = { taste: 0, artist: 0, rating: 0, cover: 0, composite: 0, reasons: [] };

export function asScored(album: CatalogAlbum): ScoredAlbum {
  return { ...album, scores: BLANK_SCORES };
}

export function resolveListAlbums(
  entries: ListAlbum[],
  pool: CatalogAlbum[],
): { album: CatalogAlbum; key: string }[] {
  return entries.map((e) => {
    const hit =
      pool.find((a) => e.albumId && a.id === e.albumId) ??
      pool.find((a) => listEntryKey(a.artist, a.title) === e.key);
    if (hit) {
      return {
        album: {
          ...hit,
          coverUrl: hit.coverUrl || e.pic || hit.coverUrl,
          coverUrlLg: hit.coverUrlLg || e.pic || hit.coverUrlLg,
        },
        key: e.key,
      };
    }
    return { album: listItemToAlbum(e), key: e.key };
  });
}

export function displayListName(list: UserList, fallbackSaved: string): string {
  if (list.id === SAVED_LIST_ID || list.locked) return fallbackSaved;
  return list.name.trim() || fallbackSaved;
}
