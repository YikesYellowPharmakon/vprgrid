/**
 * 全网检索(服务端聚合),不限时间与风格。并行查询多个公开目录:
 *   - MusicBrainz:专辑名检索 + 艺人名精确检索(命中后直接列出该艺人全部专辑,
 *     特殊字符如「/f」做 Lucene 转义,不再搜不到);
 *   - iTunes Search API(Apple 全量目录,免密钥);
 *   - Deezer(免密钥,补充欧洲/电子目录);
 *   - Discogs(可选:设置环境变量 DISCOGS_TOKEN 后启用官方 API)。
 * RYM / AOTY 不提供公开 API(Cloudflare 防护 + 无开放接口),
 * 由前端提供站内搜索直达链接兜底。
 */
import { createServerFn } from "@tanstack/react-start";
import { normalizeKey } from "./gold";

const UA = "GRAIN-weekly-radar/1.0 (album radar; contact: none)";
const HEADERS = { "User-Agent": UA, Accept: "application/json" };

export type GlobalHit = {
  /** 带来源前缀的唯一 id,如 mb:… / itunes:… / deezer:… / discogs:… */
  id: string;
  title: string;
  artist: string;
  /** 首发日期,可能只有年份或缺失。 */
  date: string | null;
  type: string;
  coverUrl: string | null;
  source: string;
};

async function getJson(url: string, timeout = 12000): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** MusicBrainz 限速较严(1 rps),busy/503 时等待重试一次,不让艺人检索被静默吞掉。 */
async function mbJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const body = await getJson(url);
      if (body && typeof body === "object" && "error" in (body as Record<string, unknown>)) {
        throw new Error("busy");
      }
      return body;
    } catch (err) {
      if (attempt >= 1) throw err;
      await sleep(1200);
    }
  }
}

/** Lucene 特殊字符转义(/f、AC/DC、!!! 这类名字必须转义才能命中)。 */
function escapeLucene(s: string): string {
  return s.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");
}

type MbReleaseGroup = {
  id: string;
  title: string;
  "first-release-date"?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  "artist-credit"?: Array<{ name: string; joinphrase?: string }>;
};

function mbCredit(rg: MbReleaseGroup): string {
  return (
    (rg["artist-credit"] ?? [])
      .map((a) => `${a.name}${a.joinphrase ?? ""}`)
      .join("")
      .trim() || "未知艺人"
  );
}

function mbHit(rg: MbReleaseGroup, artistFallback?: string): GlobalHit {
  return {
    id: `mb:${rg.id}`,
    title: rg.title,
    artist: mbCredit(rg) === "未知艺人" && artistFallback ? artistFallback : mbCredit(rg),
    date: rg["first-release-date"] || null,
    type: rg["primary-type"] ?? "Release",
    coverUrl: `https://coverartarchive.org/release-group/${rg.id}/front-250`,
    source: "MusicBrainz",
  };
}

function noCompilation(rg: MbReleaseGroup): boolean {
  return !(rg["secondary-types"] ?? []).includes("Compilation");
}

/**
 * MusicBrainz:只有完全同名艺人才展开其专辑(避免模糊命中把别人的专钉在第一位);
 * 否则只做专辑名检索。一次往返,避免串行 1 rps 把整次搜索拖死。
 */
async function searchMusicBrainz(q: string): Promise<{ artistHits: GlobalHit[]; rgHits: GlobalHit[] }> {
  const artistHits: GlobalHit[] = [];
  const rgHits: GlobalHit[] = [];
  const phrase = q.replace(/"/g, '\\"');

  try {
    const body = (await mbJson(
      `https://musicbrainz.org/ws/2/artist/?query=artist:"${encodeURIComponent(phrase)}"&fmt=json&limit=3`,
    )) as { artists?: Array<{ id: string; name: string; score?: number }> };
    const exact = (body.artists ?? []).filter((a) => a.name.toLowerCase() === q.toLowerCase()).slice(0, 1);
    if (exact[0]) {
      const rgs = (await mbJson(
        `https://musicbrainz.org/ws/2/release-group?artist=${exact[0].id}&fmt=json&limit=20`,
      )) as { "release-groups"?: MbReleaseGroup[] };
      const list = (rgs["release-groups"] ?? [])
        .filter(noCompilation)
        .sort((a, b) => (b["first-release-date"] ?? "").localeCompare(a["first-release-date"] ?? ""));
      artistHits.push(...list.map((rg) => mbHit(rg, exact[0].name)));
      return { artistHits, rgHits };
    }
  } catch {
    // 艺人检索失败不影响专辑名检索
  }

  try {
    const body = (await mbJson(
      `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(escapeLucene(q))}&fmt=json&limit=20`,
    )) as { "release-groups"?: MbReleaseGroup[] };
    rgHits.push(...(body["release-groups"] ?? []).filter(noCompilation).map((rg) => mbHit(rg)));
  } catch {
    // 单源失败静默
  }
  return { artistHits, rgHits };
}

async function searchItunes(q: string): Promise<GlobalHit[]> {
  try {
    const body = (await getJson(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=20`,
    )) as {
      results?: Array<{
        collectionId: number;
        collectionName: string;
        artistName: string;
        releaseDate?: string;
        artworkUrl100?: string;
      }>;
    };
    return (body.results ?? []).map((r) => ({
      id: `itunes:${r.collectionId}`,
      title: r.collectionName,
      artist: r.artistName,
      date: r.releaseDate ? r.releaseDate.slice(0, 10) : null,
      type: "Album",
      coverUrl: r.artworkUrl100 ? r.artworkUrl100.replace("100x100", "250x250") : null,
      source: "iTunes",
    }));
  } catch {
    return [];
  }
}

async function searchDeezer(q: string): Promise<GlobalHit[]> {
  try {
    const body = (await getJson(`https://api.deezer.com/search/album?q=${encodeURIComponent(q)}&limit=12`)) as {
      data?: Array<{ id: number; title: string; cover_medium?: string; record_type?: string; artist?: { name: string } }>;
    };
    const items = body.data ?? [];
    return items.map((a) => ({
      id: `deezer:${a.id}`,
      title: a.title,
      artist: a.artist?.name ?? "未知艺人",
      date: null,
      type: a.record_type === "ep" ? "EP" : "Album",
      coverUrl: a.cover_medium ?? null,
      source: "Deezer",
    }));
  } catch {
    return [];
  }
}

async function searchDiscogs(q: string): Promise<GlobalHit[]> {
  const token = process.env.DISCOGS_TOKEN;
  if (!token) return [];
  try {
    const body = (await getJson(
      `https://api.discogs.com/database/search?q=${encodeURIComponent(q)}&type=master&per_page=15&token=${token}`,
    )) as { results?: Array<{ id: number; title: string; year?: string; cover_image?: string }> };
    return (body.results ?? []).map((r) => {
      const [artist, ...rest] = r.title.split(" - ");
      return {
        id: `discogs:${r.id}`,
        title: rest.join(" - ") || r.title,
        artist: artist?.trim() || "未知艺人",
        date: r.year ? `${r.year}` : null,
        type: "Release",
        coverUrl: r.cover_image ?? null,
        source: "Discogs",
      };
    });
  } catch {
    return [];
  }
}

export const searchGlobal = createServerFn({ method: "POST" })
  .validator((d: { query: string }) => d)
  .handler(async ({ data }): Promise<{ ok: true; hits: GlobalHit[] } | { ok: false; error: string }> => {
    const q = data.query.trim();
    if (q.length < 2) return { ok: true, hits: [] };
    try {
      const settle = <T,>(p: Promise<T>, ms: number, fallback: T) =>
        new Promise<T>((resolve) => {
          const timer = setTimeout(() => resolve(fallback), ms);
          p.then((v) => {
            clearTimeout(timer);
            resolve(v);
          }).catch(() => {
            clearTimeout(timer);
            resolve(fallback);
          });
        });
      const [mb, itunes, deezer, discogs] = await Promise.all([
        settle(searchMusicBrainz(q), 6500, { artistHits: [], rgHits: [] }),
        settle(searchItunes(q), 4500, []),
        settle(searchDeezer(q), 4500, []),
        settle(searchDiscogs(q), 4500, []),
      ]);
      const merged: GlobalHit[] = [];
      const seen = new Set<string>();
      for (const hit of [...mb.artistHits, ...mb.rgHits, ...itunes, ...deezer, ...discogs]) {
        const key = `${normalizeKey(hit.artist)}||${normalizeKey(hit.title)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(hit);
      }
      const ql = q.toLowerCase();
      const rank = (hit: GlobalHit) => {
        const title = hit.title.toLowerCase();
        const artist = hit.artist.toLowerCase();
        if (title === ql) return 100;
        if (artist === ql) return 90;
        if (title.startsWith(ql) || artist.startsWith(ql)) return 80;
        if (title.includes(ql)) return 55;
        if (artist.includes(ql)) return 45;
        return 10;
      };
      merged.sort((a, b) => rank(b) - rank(a));
      if (merged.length === 0) return { ok: true, hits: [] };
      return { ok: true, hits: merged.slice(0, 60) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "检索失败" };
    }
  });
