import { createServerFn } from "@tanstack/react-start";
import type { ListenLinks } from "./types";

const GRAIN_UA = "VprGrid.SYS/1.0 (weekly album radar)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type ListenItem = { id: string; artist: string; title: string };

const cache = new Map<string, ListenLinks>();

function empty(): ListenLinks {
  return { apple: null, spotify: null, netease: null, bandcamp: null };
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = na.split(" ").filter((t) => t.length > 2);
  const tb = new Set(nb.split(" ").filter((t) => t.length > 2));
  if (ta.length === 0 || tb.size === 0) return false;
  const hit = ta.filter((t) => tb.has(t)).length;
  return hit >= Math.min(2, ta.length, tb.size);
}

function titleMatch(a: string, b: string): boolean {
  const na = norm(a).replace(/\b(deluxe|expanded|remaster(ed)?|anniversary|edition|reissue|ep)\b/g, "").trim();
  const nb = norm(b).replace(/\b(deluxe|expanded|remaster(ed)?|anniversary|edition|reissue|ep)\b/g, "").trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return Math.min(na.length, nb.length) >= 4;
  const ta = new Set(na.split(" ").filter((t) => t.length > 2));
  const tb = nb.split(" ").filter((t) => t.length > 2);
  const hit = tb.filter((t) => ta.has(t)).length;
  return hit >= Math.min(2, ta.size, tb.length);
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function readJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function findApple(artist: string, title: string): Promise<string | null> {
  const q = encodeURIComponent(`${artist} ${title}`);
  const body = (await readJson(`https://itunes.apple.com/search?term=${q}&entity=album&limit=5`, {
    headers: { Accept: "application/json", "User-Agent": GRAIN_UA },
  })) as {
    results?: Array<{ artistName?: string; collectionName?: string; collectionViewUrl?: string }>;
  };
  for (const row of body.results ?? []) {
    if (!row.collectionViewUrl) continue;
    if (!namesMatch(artist, row.artistName ?? "")) continue;
    if (!titleMatch(title, row.collectionName ?? "")) continue;
    return row.collectionViewUrl.replace("?uo=4", "").replace("&uo=4", "");
  }
  return null;
}

async function findNetease(artist: string, title: string): Promise<string | null> {
  const q = encodeURIComponent(`${artist} ${title}`);
  const body = (await readJson(`https://music.163.com/api/search/get?s=${q}&type=10&limit=5&offset=0`, {
    headers: {
      Accept: "application/json",
      "User-Agent": BROWSER_UA,
      Referer: "https://music.163.com/",
    },
  })) as {
    result?: {
      albums?: Array<{ id?: number; name?: string; artist?: { name?: string } }>;
    };
  };
  for (const row of body.result?.albums ?? []) {
    if (!row.id) continue;
    if (!namesMatch(artist, row.artist?.name ?? "")) continue;
    if (!titleMatch(title, row.name ?? "")) continue;
    return `https://music.163.com/album?id=${row.id}`;
  }
  return null;
}

async function findBandcamp(artist: string, title: string): Promise<string | null> {
  const res = await fetch("https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": GRAIN_UA,
    },
    body: JSON.stringify({ search_text: `${artist} ${title}`, search_filter: "a", full_page: false }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    auto?: { results?: Array<{ type?: string; name?: string; band_name?: string; item_url_path?: string }> };
  };
  for (const row of body.auto?.results ?? []) {
    if (row.type !== "a" || !row.item_url_path) continue;
    if (!namesMatch(artist, row.band_name ?? "")) continue;
    if (!titleMatch(title, row.name ?? "")) continue;
    return row.item_url_path;
  }
  return null;
}

function parseUrlRels(relations: Array<{ url?: { resource?: string } }> | undefined): Partial<ListenLinks> {
  const out: Partial<ListenLinks> = {};
  for (const rel of relations ?? []) {
    const u = rel.url?.resource ?? "";
    if (!u) continue;
    if (!out.spotify && /open\.spotify\.com\/(album|track)\//i.test(u)) out.spotify = u;
    if (!out.apple && /(music\.apple\.com|itunes\.apple\.com)\//i.test(u)) out.apple = u;
    if (!out.bandcamp && /bandcamp\.com\//i.test(u)) out.bandcamp = u;
    if (!out.netease && /music\.163\.com\//i.test(u)) out.netease = u;
  }
  return out;
}

async function findMbListen(mbid: string): Promise<Partial<ListenLinks>> {
  const rg = (await readJson(`https://musicbrainz.org/ws/2/release-group/${mbid}?inc=url-rels&fmt=json`, {
    headers: { Accept: "application/json", "User-Agent": GRAIN_UA },
  })) as { relations?: Array<{ url?: { resource?: string } }> };
  const out = parseUrlRels(rg.relations);
  if (out.spotify && out.apple && out.bandcamp && out.netease) return out;
  const browse = (await readJson(
    `https://musicbrainz.org/ws/2/release?release-group=${mbid}&inc=url-rels&fmt=json&limit=8`,
    { headers: { Accept: "application/json", "User-Agent": GRAIN_UA } },
  )) as { releases?: Array<{ relations?: Array<{ url?: { resource?: string } }> }> };
  for (const rel of browse.releases ?? []) {
    const extra = parseUrlRels(rel.relations);
    out.spotify ??= extra.spotify;
    out.apple ??= extra.apple;
    out.bandcamp ??= extra.bandcamp;
    out.netease ??= extra.netease;
  }
  return out;
}

async function resolveOne(item: ListenItem, includeMb: boolean): Promise<ListenLinks> {
  const cached = cache.get(item.id);
  if (cached && (!includeMb || cached.spotify || cached.apple || cached.bandcamp || cached.netease)) {
    if (cached.spotify || !includeMb) return cached;
  }
  const base = cached ? { ...cached } : empty();
  const [apple, netease, bandcamp] = await Promise.all([
    base.apple ? Promise.resolve(base.apple) : findApple(item.artist, item.title).catch(() => null),
    base.netease ? Promise.resolve(base.netease) : findNetease(item.artist, item.title).catch(() => null),
    base.bandcamp ? Promise.resolve(base.bandcamp) : findBandcamp(item.artist, item.title).catch(() => null),
  ]);
  let spotify = base.spotify;
  if (includeMb && !spotify) {
    const mb = await findMbListen(item.id).catch(() => ({} as Partial<ListenLinks>));
    spotify = mb.spotify ?? null;
    const merged: ListenLinks = {
      apple: apple ?? mb.apple ?? null,
      spotify,
      netease: netease ?? mb.netease ?? null,
      bandcamp: bandcamp ?? mb.bandcamp ?? null,
    };
    cache.set(item.id, merged);
    return merged;
  }
  const merged: ListenLinks = { apple, spotify: spotify ?? null, netease, bandcamp };
  cache.set(item.id, merged);
  return merged;
}

export const getListenLinks = createServerFn({ method: "POST" })
  .validator((d: { items: ListenItem[]; includeMb?: boolean }) => d)
  .handler(async ({ data }): Promise<Record<string, ListenLinks>> => {
    const items = data.items.slice(0, 40);
    const includeMb = Boolean(data.includeMb) && items.length <= 3;
    const bag: Record<string, ListenLinks> = {};
    await Promise.race([
      mapPool(items, includeMb ? 2 : 6, async (item) => {
        const links = await resolveOne(item, includeMb);
        bag[item.id] = links;
      }),
      new Promise<void>((resolve) => setTimeout(resolve, includeMb ? 8000 : 12000)),
    ]);
    return bag;
  });
