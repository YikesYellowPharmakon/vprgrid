import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_TASTE,
  GENRE_FAMILIES,
  mergeTaxonomy,
  slugify,
  type CustomFamily,
  type CustomGenre,
} from "./catalog/genres";
import type { ArtistNote } from "./catalog/artist-ai";
import type { GoldEntry } from "./catalog/gold";
import { neutralizeGuessedDates } from "./catalog/release-date";
import { DEFAULT_WEIGHTS } from "./catalog/score";
import {
  BUILTIN_SOURCE_ID,
  entryKey,
  ensureAppleSource,
  ensureBandcampSource,
  ensureBuiltinPlaylist,
  makeBuiltinSource,
  mergeGoldEntries,
  newSourceId,
  normalizeRefUrl,
  type RefSource,
} from "./catalog/sources";
import { grainStorage, writeHeavy } from "./grain-storage";
import type { CoverReading, ScoreWeights } from "./catalog/types";
import { applyTheme, DEFAULT_CUSTOM, normalizeThemeId, type CustomTheme, type ThemeId } from "./themes";

type GrainState = {
  taste: string[];
  weights: ScoreWeights;
  strictTaste: boolean;
  skipThinRatings: boolean;
  skipRoughCovers: boolean;
  skipAssemblyLine: boolean;
  theme: ThemeId;
  /** 界面语言(中文/English),只翻界面框架文案,不翻数据。 */
  lang: "zh" | "en";
  /** 「自定义」主题的用户设定(背景图/颜色/纹理)。 */
  customTheme: CustomTheme;
  /** 艺人 AI 背景分析缓存(键:小写艺名)。 */
  artistNotes: Record<string, ArtistNote>;
  /** 用户自设的 AI 接口(密钥只存本机浏览器,随每次 AI 调用传给自己的服务端)。 */
  aiConf: { apiKey: string; baseUrl: string; model: string };
  /** 参考订阅源列表(内置/网易云/RYM/AOTY/RSS/艺人/粘贴/手动),合并去重后形成参考池。 */
  refSources: RefSource[];
  types: Array<"Album" | "EP">;
  saved: string[];
  hidden: string[];
  sleeves: Record<string, CoverReading>;
  view: "list" | "grid";
  customFamilies: CustomFamily[];
  customGenres: CustomGenre[];
  toggleTaste: (id: string) => void;
  setTaste: (ids: string[]) => void;
  toggleFamily: (childIds: string[]) => void;
  setWeights: (w: ScoreWeights) => void;
  setStrictTaste: (v: boolean) => void;
  setSkipThinRatings: (v: boolean) => void;
  setSkipRoughCovers: (v: boolean) => void;
  setSkipAssemblyLine: (v: boolean) => void;
  setTheme: (t: ThemeId) => void;
  setLang: (l: "zh" | "en") => void;
  setCustomTheme: (c: Partial<CustomTheme>) => void;
  setArtistNote: (artist: string, note: ArtistNote) => void;
  setAiConf: (patch: Partial<{ apiKey: string; baseUrl: string; model: string }>) => void;
  addSource: (s: RefSource) => void;
  updateSource: (id: string, patch: Partial<RefSource>) => void;
  removeSource: (id: string) => void;
  /** 从任意订阅源里删掉一张专辑(内置歌单除外)。 */
  removeSourceEntry: (sourceId: string, albumId: number) => void;
  toggleSource: (id: string) => void;
  /** 全选/全不选参考源。 */
  setAllSources: (enabled: boolean) => void;
  /** 单选:只启用这一个源,其余全部停用。 */
  soloSource: (id: string) => void;
  /** 手动亲选:加进「手动」源(不存在则创建)。 */
  addRefExtra: (e: GoldEntry) => void;
  removeRefExtra: (albumId: number) => void;
  setTypes: (t: Array<"Album" | "EP">) => void;
  toggleSaved: (id: string) => void;
  toggleHidden: (id: string) => void;
  setSleeve: (id: string, reading: CoverReading) => void;
  setView: (v: "list" | "grid") => void;
  addCustomFamily: (label: string, zh: string) => string | null;
  addCustomGenre: (parentId: string, label: string, zh: string, synonyms: string[]) => string | null;
  removeCustomFamily: (id: string) => void;
  removeCustomGenre: (id: string) => void;
};

function cleanLabel(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 48);
}

function uniqueId(prefix: string, label: string, taken: Set<string>): string {
  const base = `${prefix}-${slugify(label)}`;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export const useGrain = create<GrainState>()(
  persist(
    (set, get) => ({
      taste: DEFAULT_TASTE,
      weights: DEFAULT_WEIGHTS,
      strictTaste: true,
      skipThinRatings: false,
      skipRoughCovers: true,
      skipAssemblyLine: true,
      theme: "matrix",
      lang: "zh",
      customTheme: DEFAULT_CUSTOM,
      artistNotes: {},
      aiConf: { apiKey: "", baseUrl: "", model: "" },
      refSources: [makeBuiltinSource(true)],
      types: ["Album", "EP"],
      saved: [],
      hidden: [],
      sleeves: {},
      view: "list",
      customFamilies: [],
      customGenres: [],
      toggleTaste: (id) => {
        const cur = get().taste;
        set({ taste: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
      },
      setTaste: (ids) => set({ taste: ids }),
      toggleFamily: (childIds) => {
        const cur = get().taste;
        const allOn = childIds.length > 0 && childIds.every((id) => cur.includes(id));
        set({
          taste: allOn ? cur.filter((id) => !childIds.includes(id)) : [...new Set([...cur, ...childIds])],
        });
      },
      setWeights: (w) => set({ weights: w }),
      setStrictTaste: (v) => set({ strictTaste: v }),
      setSkipThinRatings: (v) => set({ skipThinRatings: v }),
      setSkipRoughCovers: (v) => set({ skipRoughCovers: v }),
      setSkipAssemblyLine: (v) => set({ skipAssemblyLine: v }),
      setTheme: (t) => {
        const id = normalizeThemeId(t);
        set({ theme: id });
        applyTheme(id, get().customTheme);
      },
      setLang: (l) => set({ lang: l }),
      setCustomTheme: (c) => {
        const next = { ...get().customTheme, ...c };
        set({ customTheme: next });
        applyTheme(get().theme, next);
      },
      setArtistNote: (artist, note) =>
        set({ artistNotes: { ...get().artistNotes, [artist.trim().toLowerCase()]: note } }),
      setAiConf: (patch) => set((s) => ({ aiConf: { ...s.aiConf, ...patch } })),
      addSource: (src) =>
        set((s) => {
          if (src.url) {
            const key = normalizeRefUrl(src.url);
            const hit = s.refSources.find((x) => x.url && normalizeRefUrl(x.url) === key);
            if (hit) {
              const { entries } = mergeGoldEntries(hit.entries, src.entries);
              return {
                refSources: s.refSources.map((x) =>
                  x.id === hit.id
                    ? { ...x, ...src, id: hit.id, kind: hit.kind, entries, lastSync: src.lastSync ?? x.lastSync }
                    : x,
                ),
              };
            }
          }
          if (s.refSources.some((x) => x.id === src.id)) return s;
          return { refSources: [...s.refSources, src] };
        }),
      updateSource: (id, patch) =>
        set((s) => ({ refSources: s.refSources.map((x) => (x.id === id ? { ...x, ...patch, id: x.id, kind: x.kind } : x)) })),
      removeSource: (id) =>
        set((s) => (id === BUILTIN_SOURCE_ID ? s : { refSources: s.refSources.filter((x) => x.id !== id) })),
      removeSourceEntry: (sourceId, albumId) =>
        set((s) => {
          if (sourceId === BUILTIN_SOURCE_ID) return s;
          const next = s.refSources.map((x) => {
            if (x.id !== sourceId) return x;
            const hit = x.entries.find((e) => e.albumId === albumId);
            const key = hit ? entryKey(hit) : "";
            return {
              ...x,
              entries: x.entries.filter((e) => e.albumId !== albumId),
              excluded: key ? [...new Set([...(x.excluded ?? []), key])] : x.excluded,
            };
          });
          return {
            refSources: next.filter((x) => !(x.id === sourceId && x.kind === "manual" && x.entries.length === 0)),
          };
        }),
      toggleSource: (id) =>
        set((s) => ({ refSources: s.refSources.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)) })),
      setAllSources: (enabled) =>
        set((s) => ({ refSources: s.refSources.map((x) => ({ ...x, enabled })) })),
      soloSource: (id) =>
        set((s) => ({ refSources: s.refSources.map((x) => ({ ...x, enabled: x.id === id })) })),
      addRefExtra: (e) =>
        set((s) => {
          const key = entryKey(e);
          const manual = s.refSources.find((x) => x.kind === "manual");
          if (manual) {
            if (manual.entries.some((x) => x.albumId === e.albumId || entryKey(x) === key)) {
              return {
                refSources: s.refSources.map((x) =>
                  x.id === manual.id
                    ? { ...x, excluded: (x.excluded ?? []).filter((k) => k !== key) }
                    : x,
                ),
              };
            }
            return {
              refSources: s.refSources.map((x) =>
                x.id === manual.id
                  ? {
                      ...x,
                      entries: [...x.entries, e],
                      excluded: (x.excluded ?? []).filter((k) => k !== key),
                    }
                  : x,
              ),
            };
          }
          return {
            refSources: [
              ...s.refSources,
              {
                id: newSourceId("manual"),
                kind: "manual" as const,
                label: "手动亲选",
                detail: "来自搜索与自动雷达",
                enabled: true,
                autoSync: false,
                entries: [e],
              },
            ],
          };
        }),
      removeRefExtra: (albumId) =>
        set((s) => ({
          refSources: s.refSources
            .map((x) => {
              if (x.kind !== "manual") return x;
              const hit = x.entries.find((e) => e.albumId === albumId);
              const key = hit ? entryKey(hit) : "";
              return {
                ...x,
                entries: x.entries.filter((e) => e.albumId !== albumId),
                excluded: key ? [...new Set([...(x.excluded ?? []), key])] : x.excluded,
              };
            })
            .filter((x) => !(x.kind === "manual" && x.entries.length === 0)),
        })),
      setTypes: (t) => set({ types: t.length ? t : ["Album", "EP"] }),
      toggleSaved: (id) => {
        const cur = get().saved;
        set({ saved: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
      },
      toggleHidden: (id) => {
        const cur = get().hidden;
        set({ hidden: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
      },
      setSleeve: (id, reading) => set({ sleeves: { ...get().sleeves, [id]: reading } }),
      setView: (v) => set({ view: v }),
      addCustomFamily: (label, zh) => {
        const name = cleanLabel(label);
        const zhName = cleanLabel(zh);
        if (!name) return null;
        const { customFamilies } = get();
        const clash = [...GENRE_FAMILIES, ...customFamilies].some(
          (f) => f.label.toLowerCase() === name.toLowerCase(),
        );
        if (clash) return null;
        const taken = new Set([...GENRE_FAMILIES, ...customFamilies].map((f) => f.id));
        const id = uniqueId("cf", name, taken);
        set({ customFamilies: [...customFamilies, { id, label: name, zh: zhName }] });
        return id;
      },
      addCustomGenre: (parentId, label, zh, synonyms) => {
        const name = cleanLabel(label);
        const zhName = cleanLabel(zh);
        if (!name) return null;
        const { customFamilies, customGenres, taste } = get();
        const parentOk =
          GENRE_FAMILIES.some((f) => f.id === parentId) || customFamilies.some((f) => f.id === parentId);
        if (!parentOk) return null;
        const siblings = [
          ...(GENRE_FAMILIES.find((f) => f.id === parentId)?.children ?? []),
          ...customGenres.filter((g) => g.parentId === parentId),
        ];
        if (siblings.some((g) => g.label.toLowerCase() === name.toLowerCase())) return null;
        const taken = new Set([
          ...GENRE_FAMILIES.flatMap((f) => f.children.map((c) => c.id)),
          ...customGenres.map((g) => g.id),
        ]);
        const id = uniqueId("cg", name, taken);
        const extra = synonyms
          .map((s) => s.replace(/\s+/g, " ").trim().toLowerCase())
          .filter((s) => s.length > 1)
          .slice(0, 8);
        const syn = [...new Set([name.toLowerCase(), ...extra])];
        set({
          customGenres: [...customGenres, { id, label: name, zh: zhName, synonyms: syn, parentId }],
          taste: taste.includes(id) ? taste : [...taste, id],
        });
        return id;
      },
      removeCustomFamily: (id) => {
        const { customFamilies, customGenres, taste } = get();
        const childIds = customGenres.filter((g) => g.parentId === id).map((g) => g.id);
        const drop = new Set([id, ...childIds]);
        set({
          customFamilies: customFamilies.filter((f) => f.id !== id),
          customGenres: customGenres.filter((g) => g.parentId !== id),
          taste: taste.filter((t) => !drop.has(t)),
        });
      },
      removeCustomGenre: (id) => {
        set({
          customGenres: get().customGenres.filter((g) => g.id !== id),
          taste: get().taste.filter((t) => t !== id),
        });
      },
    }),
    {
      name: "grain-friday-v4",
      skipHydration: true,
      storage: createJSONStorage(() => grainStorage),
      version: 9,
      partialize: (s) => ({
        taste: s.taste,
        weights: s.weights,
        strictTaste: s.strictTaste,
        skipThinRatings: s.skipThinRatings,
        skipRoughCovers: s.skipRoughCovers,
        skipAssemblyLine: s.skipAssemblyLine,
        theme: s.theme,
        lang: s.lang,
        customTheme: s.customTheme,
        aiConf: s.aiConf,
        types: s.types,
        saved: s.saved,
        hidden: s.hidden,
        view: s.view,
        customFamilies: s.customFamilies,
        customGenres: s.customGenres,
      }),
      migrate: (persisted, version) => {
        // v1 → v2:refPlaylist(单一歌单)+ refExtras(手动)迁移为多源订阅。
        const s = persisted as Record<string, unknown> & {
          refPlaylist?: { id: string; name: string; entries: GoldEntry[] } | null;
          refExtras?: GoldEntry[];
          refSources?: RefSource[];
        };
        if (version < 2 && s && !Array.isArray(s.refSources)) {
          const sources: RefSource[] = [makeBuiltinSource(!s.refPlaylist)];
          if (s.refPlaylist) {
            sources.push({
              id: newSourceId("netease"),
              kind: "netease",
              label: s.refPlaylist.name,
              url: s.refPlaylist.id,
              detail: "导入的网易云歌单",
              enabled: true,
              autoSync: false,
              entries: s.refPlaylist.entries ?? [],
            });
          }
          if (Array.isArray(s.refExtras) && s.refExtras.length) {
            sources.push({
              id: newSourceId("manual"),
              kind: "manual",
              label: "手动亲选",
              detail: "来自搜索与自动雷达",
              enabled: true,
              autoSync: false,
              entries: s.refExtras,
            });
          }
          s.refSources = sources;
          delete s.refPlaylist;
          delete s.refExtras;
        }
        // v2 → v3:GRAIN("default")与 PictoChat 主题下线,旧值统一落到默认 Matrix
        if (version < 3) {
          (s as { theme?: unknown }).theme = normalizeThemeId((s as { theme?: unknown }).theme);
        }
        // v3 → v4:「薄评分but分高」过滤默认改为关闭(零关注门槛已在算法层接手,
        // 这条会误杀 Bandcamp 等无评分体系来源的好发行)
        if (version < 4) {
          (s as { skipThinRatings?: boolean }).skipThinRatings = false;
        }
        // v4 → v5:已导入的 RYM / AOTY 链接默认打开时自动刷新
        if (version < 5 && Array.isArray(s.refSources)) {
          s.refSources = s.refSources.map((src) =>
            src.kind === "rym" || src.kind === "aoty" ? { ...src, autoSync: Boolean(src.url) || src.autoSync } : src,
          );
        }
        // v5 → v6:歌单缺发行日曾用「今天/加入日」顶替,万级歌单会灌进当周墙
        if (version < 6 && Array.isArray(s.refSources)) {
          s.refSources = s.refSources.map((src) =>
            src.kind === "builtin" ? src : { ...src, entries: neutralizeGuessedDates(src.entries ?? []) },
          );
        }
        // v6 → v7:内置参考挂上网易云歌单,打开时自动刷新,歌单里新加的会并进来
        if (version < 7 && Array.isArray(s.refSources)) {
          s.refSources = s.refSources.map((src) => ensureBuiltinPlaylist(src));
        }
        // v7 → v8:旧存档把 Apple 链写成 RSS,升成正式源并打开时自动刷新
        if (version < 8 && Array.isArray(s.refSources)) {
          s.refSources = s.refSources.map((src) => ensureAppleSource(src));
        }
        if (version < 9 && Array.isArray(s.refSources)) {
          s.refSources = s.refSources.map((src) => ensureBandcampSource(src));
        }
        return s;
      },
    },
  ),
);

let heavyWatching = false;

/** 水合完成后再盯参考池,避免默认空源把 IndexedDB 里的万级歌单盖掉。 */
export function watchHeavyPersist() {
  if (heavyWatching || typeof window === "undefined") return;
  heavyWatching = true;
  const s0 = useGrain.getState();
  let lastRef = s0.refSources;
  let lastNotes = s0.artistNotes;
  let lastSleeves = s0.sleeves;
  void writeHeavy({ refSources: lastRef, artistNotes: lastNotes, sleeves: lastSleeves });
  useGrain.subscribe((s) => {
    if (s.refSources === lastRef && s.artistNotes === lastNotes && s.sleeves === lastSleeves) return;
    lastRef = s.refSources;
    lastNotes = s.artistNotes;
    lastSleeves = s.sleeves;
    void writeHeavy({ refSources: lastRef, artistNotes: lastNotes, sleeves: lastSleeves });
  });
}

export function useTaxonomy() {
  const customFamilies = useGrain((s) => s.customFamilies);
  const customGenres = useGrain((s) => s.customGenres);
  return useMemo(() => {
    const families = mergeTaxonomy(customFamilies, customGenres);
    const genres = families.flatMap((f) => f.children);
    const letters = [...new Set(families.map((f) => f.letter))];
    return { families, genres, letters };
  }, [customFamilies, customGenres]);
}
