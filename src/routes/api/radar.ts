/**
 * 只读雷达 API(供浏览器插件的新标签页/弹窗拉取,开放 CORS):
 *   GET /api/radar?week=2026-08-24&taste=ambient,drone
 *   GET /api/radar?start=2026-08-01&end=2026-08-31
 *   - week:自然周周一(缺省当前周)
 *   - start+end:日期闭区间(插件月墙);与 week 同时出现时优先区间
 *   - 过滤/权重/参考池优先用查询参数,其次用 /api/sync 里最新负载
 *   - 若同步负载带有同一周的 wall 快照,直接返回(与完整应用当周列表一致)
 *   - 月墙截到前列约 48 张(参考优先);周墙仍给较完整名单
 */
import { createFileRoute } from "@tanstack/react-router";
import { getWeekCatalog } from "@/lib/catalog/api";
import { buildReference, normalizeKey, syntheticId, DEFAULT_REF_ENTRIES, type GoldEntry } from "@/lib/catalog/gold";
import { ALL_GENRES, DEFAULT_TASTE, inferGenres } from "@/lib/catalog/genres";
import { buildRefGenreProfile, DEFAULT_WEIGHTS, isAssemblyLine, rankAlbums } from "@/lib/catalog/score";
import { getLatestSyncPayload } from "@/lib/catalog/sync-store";
import type { ScoreWeights } from "@/lib/catalog/types";
import { fridayOfWeek, mondayOf, monthEnd, sundayOf } from "@/lib/catalog/weeks";
import { toIso } from "@/lib/catalog/week";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseWindow(url: URL): { start: string; end: string; week: string; grain: "week" | "month" } {
  const startP = url.searchParams.get("start");
  const endP = url.searchParams.get("end");
  if (ISO_DAY.test(startP ?? "") && ISO_DAY.test(endP ?? "") && startP! <= endP!) {
    const start = startP!;
    const end = endP!;
    const ym = start.slice(0, 7);
    const month =
      start === `${ym}-01` && end === monthEnd(ym) && end.slice(0, 7) === ym ? "month" : "week";
    return { start, end, week: mondayOf(start), grain: month };
  }
  const weekParam = url.searchParams.get("week");
  const week = ISO_DAY.test(weekParam ?? "") ? mondayOf(weekParam!) : mondayOf(toIso(new Date()));
  return { start: week, end: sundayOf(week), week, grain: "week" };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type RadarItem = {
  id: string;
  artist: string;
  title: string;
  date: string;
  type: string;
  cover: string | null;
  coverLg: string | null;
  gold: boolean;
  score: number | null;
  repTrack: string | null;
};

function flag(url: URL, key: string, synced: boolean | undefined, fallback: boolean): boolean {
  const raw = url.searchParams.get(key);
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  if (typeof synced === "boolean") return synced;
  return fallback;
}

function parseWeights(url: URL, synced: unknown): ScoreWeights {
  const raw = url.searchParams.get("w");
  if (raw) {
    const [taste, artist, rating, cover] = raw.split(",").map(Number);
    if ([taste, artist, rating, cover].every((n) => Number.isFinite(n))) {
      return { taste, artist, rating, cover };
    }
  }
  if (synced && typeof synced === "object") {
    const w = synced as Record<string, unknown>;
    const taste = Number(w.taste);
    const artist = Number(w.artist);
    const rating = Number(w.rating);
    const cover = Number(w.cover);
    if ([taste, artist, rating, cover].every((n) => Number.isFinite(n))) {
      return { taste, artist, rating, cover };
    }
  }
  return DEFAULT_WEIGHTS;
}

function entriesFromSync(raw: unknown): GoldEntry[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: GoldEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const e = row as { artist?: unknown; title?: unknown; date?: unknown; pic?: unknown };
    const artist = String(e.artist ?? "").trim();
    const title = String(e.title ?? "").trim();
    const date = String(e.date ?? "").trim();
    if (!artist || !title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({
      albumId: syntheticId(`${artist}|${title}`),
      artist,
      title,
      date,
      songId: 0,
      song: "",
      pic: typeof e.pic === "string" ? e.pic : null,
    });
  }
  return out.length ? out : null;
}

function snapshotItems(raw: unknown): RadarItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: RadarItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const e = row as { id?: unknown; artist?: unknown; title?: unknown; date?: unknown; pic?: unknown; gold?: unknown };
    const artist = String(e.artist ?? "").trim();
    const title = String(e.title ?? "").trim();
    if (!artist || !title) continue;
    const gold = Boolean(e.gold);
    const rawId = typeof e.id === "string" ? e.id.trim() : "";
    out.push({
      id: rawId || `${gold ? "wall-g" : "wall-a"}-${normalizeKey(artist)}-${normalizeKey(title)}`,
      artist,
      title,
      date: String(e.date ?? ""),
      type: "Album",
      cover: typeof e.pic === "string" ? e.pic : null,
      coverLg: typeof e.pic === "string" ? e.pic : null,
      gold,
      score: null,
      repTrack: null,
    });
  }
  return out.length ? out : null;
}

export const Route = createFileRoute("/api/radar")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const { start, end, week, grain } = parseWindow(url);
          const synced = getLatestSyncPayload();
          const syncFilters = (synced?.filters && typeof synced.filters === "object" ? synced.filters : {}) as Record<
            string,
            unknown
          >;
          const syncWall = (synced?.wall && typeof synced.wall === "object" ? synced.wall : null) as {
            week?: unknown;
            start?: unknown;
            end?: unknown;
            items?: unknown;
            scanned?: unknown;
            passed?: unknown;
            line?: unknown;
          } | null;
          const wallStart = String(syncWall?.start ?? "");
          const wallEnd = String(syncWall?.end ?? "");
          const wallMatches = Boolean(
            syncWall &&
              ((wallStart && wallEnd && wallStart === start && wallEnd === end) ||
                (grain === "week" && !wallStart && String(syncWall.week ?? "") === week)),
          );

          if (wallMatches && syncWall) {
            const items = snapshotItems(syncWall.items);
            if (items) {
              return Response.json(
                {
                  week,
                  start,
                  end,
                  grain,
                  friday: fridayOfWeek(week),
                  generatedAt: new Date().toISOString(),
                  scanned: typeof syncWall.scanned === "number" && Number.isFinite(syncWall.scanned) ? syncWall.scanned : null,
                  passed: typeof syncWall.passed === "number" && Number.isFinite(syncWall.passed) ? syncWall.passed : null,
                  line: typeof syncWall.line === "number" && Number.isFinite(syncWall.line) ? syncWall.line : null,
                  partial: false,
                  fromWall: true,
                  reference: items.filter((a) => a.gold),
                  auto: items.filter((a) => !a.gold),
                },
                { headers: { ...CORS, "Cache-Control": "no-store" } },
              );
            }
          }

          const tasteParam = (url.searchParams.get("taste") ?? "").trim();
          const taste = tasteParam
            ? tasteParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 400)
            : Array.isArray(synced?.taste)
              ? (synced.taste as unknown[]).map(String).filter(Boolean).slice(0, 400)
              : DEFAULT_TASTE;
          const weights = parseWeights(url, synced?.weights);
          const typesParam = url.searchParams.get("types");
          const types = (typesParam
            ? typesParam.split(",")
            : Array.isArray(syncFilters.types)
              ? (syncFilters.types as unknown[]).map(String)
              : ["Album", "EP"]
          ).filter((t): t is "Album" | "EP" => t === "Album" || t === "EP");
          const hidden = new Set(
            [
              ...(url.searchParams.get("hidden") ?? "").split(","),
              ...(Array.isArray(syncFilters.hidden) ? (syncFilters.hidden as unknown[]).map(String) : []),
            ]
              .map((s) => s.trim())
              .filter(Boolean),
          );
          const goldEntries = entriesFromSync(synced?.entries) ?? DEFAULT_REF_ENTRIES;
          const reference = buildReference(goldEntries);
          const goldCap = grain === "month" ? 36 : 80;
          const totalCap = grain === "month" ? 48 : 200;
          const goldInRange = reference.albums
            .filter((a) => !a.dateUnknown && a.date >= start && a.date <= end)
            .slice(0, goldCap);
          const goldWeek = goldInRange.map<RadarItem>((a) => ({
            id: a.id,
            artist: a.artist,
            title: a.title,
            date: a.date,
            type: a.type,
            cover: a.coverUrl,
            coverLg: a.coverUrlLg,
            gold: true,
            score: null,
            repTrack: a.repTrack?.name ?? null,
          }));

          const catalog = await getWeekCatalog({
            data: { friday: fridayOfWeek(mondayOf(start)), weekStart: start, weekEnd: end },
          });
          const raw = (catalog.albums ?? []).filter(
            (a) => a.inSelectedWeek && !reference.dupKeys.has(`${normalizeKey(a.artist)}||${normalizeKey(a.title)}`),
          );
          const withGenres = raw.map((a) => ({
            ...a,
            inferredGenres: inferGenres(
              { title: a.title, artist: a.artist, tags: a.tags, secondaryType: a.secondaryType },
              ALL_GENRES,
            ),
          }));
          const goldWithGenres = goldInRange.map((a) => ({
            ...a,
            inferredGenres:
              a.inferredGenres.length > 0
                ? a.inferredGenres
                : inferGenres(
                    { title: a.title, artist: a.artist, tags: a.tags, secondaryType: a.secondaryType },
                    ALL_GENRES,
                  ),
          }));
          const artistParam = url.searchParams.get("artists");
          const refArtists = new Set<string>(
            [
              ...(artistParam ? artistParam.split(",") : []),
              ...(Array.isArray(synced?.artists) ? (synced.artists as unknown[]).map(String) : []),
              ...goldWithGenres.map((a) => a.artist),
            ]
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean),
          );

          const ranked = rankAlbums(
            withGenres,
            taste,
            weights,
            {},
            {
              strictTaste: flag(url, "strict", syncFilters.strictTaste as boolean | undefined, true),
              types: types.length ? types : ["Album", "EP"],
              skipThinRatings: flag(url, "thin", syncFilters.skipThinRatings as boolean | undefined, false),
              skipRoughCovers: flag(url, "rough", syncFilters.skipRoughCovers as boolean | undefined, true),
              skipAssemblyLine: flag(url, "line", syncFilters.skipAssemblyLine as boolean | undefined, true),
              refArtists,
              refProfile: buildRefGenreProfile(goldWithGenres),
            },
            ALL_GENRES,
          );
          const auto = ranked
            .filter((a) => !hidden.has(a.id))
            .slice(0, Math.max(0, totalCap - goldWeek.length))
            .map<RadarItem>((a) => ({
              id: a.id,
              artist: a.artist,
              title: a.title,
              date: a.date,
              type: a.type,
              cover: a.coverUrl,
              coverLg: a.coverUrlLg,
              gold: false,
              score: a.scores.composite,
              repTrack: a.repTrack?.name ?? null,
            }));

          const debug = url.searchParams.get("debug")
            ? {
                weekPool: withGenres.length,
                withReleaseGenres: withGenres.filter((a) => a.inferredGenres.length > 0).length,
                withArtistGenres: withGenres.filter((a) => (a.artistGenres?.length ?? 0) > 0).length,
                artistGenresOnly: withGenres.filter(
                  (a) => a.inferredGenres.length === 0 && (a.artistGenres?.length ?? 0) > 0,
                ).length,
                rankedTotal: ranked.length,
                rankedViaArtist: ranked.filter((a) =>
                  a.scores.reasons.some((r) => r.startsWith("艺人风格贴口味")),
                ).length,
                srcAoty: raw.filter((a) => a.sources.includes("AOTY")).length,
                srcBandcamp: raw.filter((a) => a.sources.includes("Bandcamp")).length,
                srcRym: raw.filter((a) => a.sources.includes("RYM")).length,
                srcWiki: raw.filter((a) => a.sources.includes("Wikipedia")).length,
                srcAotyInjected: raw.filter((a) => a.sources.includes("AOTY") && a.sources.length > 1).length,
                fromWall: false,
              }
            : undefined;

          const passed = ranked.filter((a) => !hidden.has(a.id)).length;
          const line = (catalog.albums ?? []).filter((a) => a.inSelectedWeek && isAssemblyLine(a)).length;
          const cache = catalog.partial ? "no-store" : "public, max-age=60";
          return Response.json(
            {
              week,
              start,
              end,
              grain,
              friday: fridayOfWeek(mondayOf(start)),
              generatedAt: new Date().toISOString(),
              scanned: catalog.partial ? null : (catalog.scanned ?? null),
              passed: catalog.partial ? null : passed,
              line: catalog.partial ? null : line,
              partial: Boolean(catalog.partial),
              ...(catalog.error && !(catalog.albums ?? []).length ? { error: catalog.error } : {}),
              reference: goldWeek,
              auto,
              ...(debug ? { debug } : {}),
            },
            { headers: { ...CORS, "Cache-Control": cache } },
          );
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "radar api failed" },
            { status: 500, headers: CORS },
          );
        }
      },
    },
  },
});
