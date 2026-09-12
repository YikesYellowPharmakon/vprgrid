/**
 * 封面兜底检索:CAA 经常对 MusicBrainz 补充条目 404。
 * 用艺人 + 专辑名去公开目录再找一张图,宁缺毋滥。
 */

const GRAIN_UA = "VprGrid.SYS/1.0 (weekly album radar)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type LookedCover = { sm: string; lg: string };

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function coverLookupKey(artist: string, title: string): string {
  return `lookup:${norm(artist)}|${norm(title)}`;
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
  const strip = (s: string) =>
    norm(s).replace(/\b(deluxe|expanded|remaster(ed)?|anniversary|edition|reissue|ep)\b/g, "").trim();
  const na = strip(a);
  const nb = strip(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return Math.min(na.length, nb.length) >= 4;
  const ta = new Set(na.split(" ").filter((t) => t.length > 2));
  const tb = nb.split(" ").filter((t) => t.length > 2);
  const hit = tb.filter((t) => ta.has(t)).length;
  return hit >= Math.min(2, ta.size, tb.length);
}

function https(url: string): string {
  return url.startsWith("http://") ? `https://${url.slice(7)}` : url;
}

function itunesArt(url: string | undefined, px: number): string | null {
  if (!url) return null;
  return https(
    url
      .replace("/100x100bb.", `/${px}x${px}bb.`)
      .replace("/250x250bb.", `/${px}x${px}bb.`)
      .replace("{w}x{h}bb.{f}", `${px}x${px}bb.jpg`),
  );
}

async function readJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function fromItunes(artist: string, title: string): Promise<LookedCover | null> {
  const q = encodeURIComponent(`${artist} ${title}`);
  const body = (await readJson(`https://itunes.apple.com/search?term=${q}&entity=album&limit=8`, {
    headers: { Accept: "application/json", "User-Agent": GRAIN_UA },
  })) as {
    results?: Array<{ artistName?: string; collectionName?: string; artworkUrl100?: string }>;
  };
  for (const row of body.results ?? []) {
    if (!namesMatch(artist, row.artistName ?? "")) continue;
    if (!titleMatch(title, row.collectionName ?? "")) continue;
    const sm = itunesArt(row.artworkUrl100, 300);
    const lg = itunesArt(row.artworkUrl100, 800);
    if (sm && lg) return { sm, lg };
  }
  return null;
}

async function fromDeezer(artist: string, title: string): Promise<LookedCover | null> {
  const q = encodeURIComponent(`artist:"${artist}" album:"${title}"`);
  const body = (await readJson(`https://api.deezer.com/search/album?q=${q}&limit=8`, {
    headers: { Accept: "application/json", "User-Agent": GRAIN_UA },
  })) as {
    data?: Array<{ title?: string; cover_medium?: string; cover_xl?: string; artist?: { name?: string } }>;
  };
  for (const row of body.data ?? []) {
    if (!namesMatch(artist, row.artist?.name ?? "")) continue;
    if (!titleMatch(title, row.title ?? "")) continue;
    const sm = row.cover_medium ? https(row.cover_medium) : null;
    const lg = row.cover_xl ? https(row.cover_xl) : sm;
    if (sm && lg) return { sm, lg };
  }
  return null;
}

async function fromNetease(artist: string, title: string): Promise<LookedCover | null> {
  const q = encodeURIComponent(`${artist} ${title}`);
  const body = (await readJson(`https://music.163.com/api/search/get?s=${q}&type=10&limit=8&offset=0`, {
    headers: {
      Accept: "application/json",
      "User-Agent": BROWSER_UA,
      Referer: "https://music.163.com/",
    },
  })) as {
    result?: {
      albums?: Array<{ name?: string; picUrl?: string; artist?: { name?: string } }>;
    };
  };
  for (const row of body.result?.albums ?? []) {
    if (!row.picUrl) continue;
    if (!namesMatch(artist, row.artist?.name ?? "")) continue;
    if (!titleMatch(title, row.name ?? "")) continue;
    const base = https(row.picUrl).split("?")[0];
    return { sm: `${base}?param=300y300`, lg: `${base}?param=800y800` };
  }
  return null;
}

const lookupInflight = new Map<string, Promise<LookedCover | null>>();

/** 按艺人+专辑名找一张能用的封面。并发同一对名字只打一次目录。 */
export function lookupCoverUrls(artist: string, title: string): Promise<LookedCover | null> {
  const a = artist.trim();
  const t = title.trim();
  if (!a || !t) return Promise.resolve(null);
  const key = coverLookupKey(a, t);
  const running = lookupInflight.get(key);
  if (running) return running;
  const job = (async () => {
    for (const fn of [fromItunes, fromDeezer, fromNetease]) {
      try {
        const hit = await fn(a, t);
        if (hit) return hit;
      } catch {
        // 单源失败换下一个
      }
    }
    return null;
  })().finally(() => lookupInflight.delete(key));
  lookupInflight.set(key, job);
  return job;
}
