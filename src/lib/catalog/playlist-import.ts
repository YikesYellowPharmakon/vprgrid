/**
 * 导入任意网易云歌单作为参考标准(服务端执行,规避浏览器跨域)。
 * 全量分页拉取(歌单 detail 的 trackIds 常在 1000 截断),再分批补曲目详情。
 * 一专取一首代表曲,上限覆盖万级歌单。
 */
import { createServerFn } from "@tanstack/react-start";
import type { GoldEntry } from "./gold";
import { inferEntryDate } from "./release-date";

const HEADERS = {
  Accept: "application/json",
  Referer: "https://music.163.com/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};
/** 万级歌单 + 一点余量;再大就容易把本机参考池 / 同步负载撑爆。 */
const MAX_TRACKS = 12000;
const TRACK_PAGE = 1000;
const SONG_BATCH = 200;

export function parsePlaylistId(input: string): string | null {
  const m = String(input).match(/(\d{5,})/);
  return m ? m[1] : null;
}

async function getJson(url: string, timeout = 30000): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`网易云接口 ${res.status}`);
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

type NeteaseSong = {
  id: number;
  name: string;
  publishTime?: number;
  ar: Array<{ name: string }>;
  al: { id: number; name: string; picUrl?: string; publishTime?: number };
};

type TrackId = { id: number; at?: number };

export type ImportedPlaylist = {
  id: string;
  name: string;
  trackCount: number;
  entries: GoldEntry[];
};

function asSongs(raw: unknown): NeteaseSong[] {
  if (!raw || typeof raw !== "object") return [];
  const songs = (raw as { songs?: unknown }).songs;
  return Array.isArray(songs) ? (songs as NeteaseSong[]) : [];
}

async function fetchPlaylistMeta(id: string): Promise<{
  name: string;
  trackCount: number;
  trackIds: TrackId[];
}> {
  const detail = (await getJson(
    `https://music.163.com/api/v6/playlist/detail?id=${id}&n=${MAX_TRACKS}`,
  )) as {
    playlist?: { name?: string; trackCount?: number; trackIds?: TrackId[] };
  };
  const playlist = detail.playlist;
  return {
    name: playlist?.name ?? `歌单 ${id}`,
    trackCount: playlist?.trackCount ?? playlist?.trackIds?.length ?? 0,
    trackIds: playlist?.trackIds ?? [],
  };
}

/** 大歌单用分页接口补全 trackIds(detail 经常只给前 1000 个 id)。 */
async function fetchAllTrackIds(id: string, meta: { trackCount: number; trackIds: TrackId[] }): Promise<TrackId[]> {
  const seen = new Map<number, TrackId>();
  for (const t of meta.trackIds) {
    if (t?.id) seen.set(t.id, t);
  }
  const want = Math.min(meta.trackCount || MAX_TRACKS, MAX_TRACKS);
  if (seen.size >= want && seen.size >= meta.trackIds.length) return [...seen.values()].slice(0, MAX_TRACKS);

  for (let offset = 0; offset < want; offset += TRACK_PAGE) {
    try {
      const body = (await getJson(
        `https://music.163.com/api/v6/playlist/track/all?id=${id}&limit=${TRACK_PAGE}&offset=${offset}`,
      )) as { songs?: Array<{ id?: number }>; privileges?: Array<{ id?: number }> };
      const pageIds = [
        ...(body.songs ?? []).map((s) => s.id).filter((n): n is number => typeof n === "number"),
        ...(body.privileges ?? []).map((p) => p.id).filter((n): n is number => typeof n === "number"),
      ];
      if (!pageIds.length) break;
      for (const sid of pageIds) {
        if (!seen.has(sid)) seen.set(sid, { id: sid });
      }
      if (pageIds.length < TRACK_PAGE) break;
      await sleep(80);
    } catch {
      break;
    }
  }
  return [...seen.values()].slice(0, MAX_TRACKS);
}

async function fetchSongsByIds(ids: number[]): Promise<NeteaseSong[]> {
  const songs: NeteaseSong[] = [];
  for (const group of chunks(ids, SONG_BATCH)) {
    const c = encodeURIComponent(JSON.stringify(group.map((sid) => ({ id: sid }))));
    const body = await getJson(`https://music.163.com/api/v3/song/detail?c=${c}`);
    songs.push(...asSongs(body));
    if (ids.length > 400) await sleep(80);
  }
  return songs;
}

function songsToEntries(songs: NeteaseSong[]): GoldEntry[] {
  const entries: GoldEntry[] = [];
  const seen = new Set<number>();
  for (const s of songs) {
    if (!s?.al?.id || seen.has(s.al.id)) continue;
    seen.add(s.al.id);
    const title = s.al.name;
    const guessed = inferEntryDate(title, s.publishTime ?? s.al.publishTime);
    const entry: GoldEntry = {
      albumId: s.al.id,
      title,
      artist: (s.ar ?? []).map((a) => a.name).join(" / ") || "未知艺人",
      date: guessed.date,
      songId: s.id,
      song: s.name,
      pic: s.al.picUrl || null,
    };
    if (guessed.dateApprox) entry.dateApprox = true;
    if (guessed.dateUnknown) entry.dateUnknown = true;
    entries.push(entry);
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return entries;
}

export const importPlaylist = createServerFn({ method: "POST" })
  .validator((d: { playlist: string }) => d)
  .handler(
    async ({ data }): Promise<{ ok: true; playlist: ImportedPlaylist } | { ok: false; error: string }> => {
      const id = parsePlaylistId(data.playlist);
      if (!id) return { ok: false, error: "无法识别歌单链接或 ID" };

      try {
        const meta = await fetchPlaylistMeta(id);
        if (!meta.trackCount && !meta.trackIds.length) {
          return { ok: false, error: "歌单为空,或为隐私歌单无法访问" };
        }

        const trackIds = await fetchAllTrackIds(id, meta);
        if (!trackIds.length) return { ok: false, error: "歌单为空,或为隐私歌单无法访问" };

        const songs = await fetchSongsByIds(trackIds.map((t) => t.id));
        if (!songs.length) return { ok: false, error: "拉取曲目失败,请稍后重试" };

        const entries = songsToEntries(songs);

        return {
          ok: true,
          playlist: {
            id,
            name: meta.name,
            trackCount: meta.trackCount || trackIds.length,
            entries,
          },
        };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "导入失败" };
      }
    },
  );
