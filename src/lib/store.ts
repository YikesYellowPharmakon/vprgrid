import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_TASTE,
  normalizePersistedTaste,
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
import { isPublicDemo } from "./demo";
import { grainStorage, writeHeavy } from "./grain-storage";
import {
  albumToListItem,
  ensureSavedList,
  makeSavedList,
  mergeListEntries,
  newListId,
  SAVED_LIST_ID,
  savedIdsOf,
  type AlbumSnap,
  type ListAlbum,
  type UserList,
} from "./catalog/lists";
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
  /** 用户专辑列表;收藏是默认且不可删的那一份。 */
  userLists: UserList[];
  activeListId: string;
  hidden: string[];
  sleeves: Record<string, CoverReading>;
  view: "list" | "grid";
  customFamilies: CustomFamily[];
  customGenres: CustomGenre[];
  /** 存下来的口味选择:一套勾选一份,随时切回去。 */
  tastePresets: TastePreset[];
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
  toggleSaved: (album: AlbumSnap) => void;
  addToList: (listId: string, album: AlbumSnap) => boolean;
  addManyToList: (listId: string, items: ListAlbum[]) => { added: number; skipped: number };
  removeFromList: (listId: string, key: string) => void;
  reorderList: (listId: string, fromKey: string, toKey: string) => void;
  createList: (name: string) => string | null;
  renameList: (id: string, name: string) => void;
  removeList: (id: string) => void;
  setActiveList: (id: string) => void;
  toggleHidden: (id: string) => void;
  setSleeve: (id: string, reading: CoverReading) => void;
  setView: (v: "list" | "grid") => void;
  addCustomFamily: (label: string, zh: string) => string | null;
  addCustomGenre: (parentId: string, label: string, zh: string, synonyms: string[]) => string | null;
  removeCustomFamily: (id: string) => void;
  removeCustomGenre: (id: string) => void;
  /** 把当前勾选存成一份口味;同名则覆盖。返回 id,空名或空勾选返回 null。 */
  saveTastePreset: (name: string) => string | null;
  applyTastePreset: (id: string) => void;
  removeTastePreset: (id: string) => void;
};

export type TastePreset = {
  id: string;
  name: string;
  ids: string[];
  savedAt: string;
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
      userLists: [makeSavedList()],
      activeListId: SAVED_LIST_ID,
      hidden: [],
      sleeves: {},
      view: "list",
      customFamilies: [],
      customGenres: [],
      tastePresets: [],
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
                  x.id === hit.id ? { ...x, entries, lastSync: src.lastSync ?? x.lastSync } : x,
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
      toggleSaved: (album) => {
        const lists = ensureSavedList(get().userLists, get().saved);
        const item = albumToListItem(album);
        if (!item) return;
        const fav = lists.find((l) => l.id === SAVED_LIST_ID) ?? makeSavedList();
        const has = fav.entries.some((e) => e.key === item.key || (item.albumId && e.albumId === item.albumId));
        const entries = has
          ? fav.entries.filter((e) => e.key !== item.key && e.albumId !== item.albumId)
          : [...fav.entries, item];
        const userLists = lists.map((l) => (l.id === SAVED_LIST_ID ? { ...fav, locked: true, entries } : l));
        set({ userLists, saved: savedIdsOf(userLists) });
      },
      addToList: (listId, album) => {
        const item = albumToListItem(album);
        if (!item) return false;
        const lists = ensureSavedList(get().userLists, get().saved);
        const target = lists.find((l) => l.id === listId);
        if (!target) return false;
        if (target.entries.some((e) => e.key === item.key || (item.albumId && e.albumId === item.albumId))) return false;
        const userLists = lists.map((l) => (l.id === listId ? { ...l, entries: [...l.entries, item] } : l));
        set({ userLists, saved: savedIdsOf(userLists) });
        return true;
      },
      addManyToList: (listId, items) => {
        const lists = ensureSavedList(get().userLists, get().saved);
        const target = lists.find((l) => l.id === listId);
        if (!target) return { added: 0, skipped: items.length };
        const merged = mergeListEntries(target.entries, items);
        const userLists = lists.map((l) => (l.id === listId ? { ...l, entries: merged.entries } : l));
        set({ userLists, saved: savedIdsOf(userLists) });
        return { added: merged.added, skipped: merged.skipped };
      },
      removeFromList: (listId, key) => {
        const lists = ensureSavedList(get().userLists, get().saved);
        const userLists = lists.map((l) =>
          l.id === listId ? { ...l, entries: l.entries.filter((e) => e.key !== key && e.albumId !== key) } : l,
        );
        set({ userLists, saved: savedIdsOf(userLists) });
      },
      reorderList: (listId, fromKey, toKey) => {
        if (fromKey === toKey) return;
        const lists = ensureSavedList(get().userLists, get().saved);
        const userLists = lists.map((l) => {
          if (l.id !== listId) return l;
          const from = l.entries.findIndex((e) => e.key === fromKey);
          const to = l.entries.findIndex((e) => e.key === toKey);
          if (from < 0 || to < 0) return l;
          const next = l.entries.slice();
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return { ...l, entries: next };
        });
        set({ userLists });
      },
      createList: (name) => {
        const label = cleanLabel(name);
        if (!label) return null;
        const lists = ensureSavedList(get().userLists, get().saved);
        const id = newListId();
        const userLists = [...lists, { id, name: label, locked: false, entries: [] }];
        set({ userLists });
        return id;
      },
      renameList: (id, name) => {
        if (id === SAVED_LIST_ID) return;
        const label = cleanLabel(name);
        if (!label) return;
        set({
          userLists: ensureSavedList(get().userLists, get().saved).map((l) => (l.id === id ? { ...l, name: label } : l)),
        });
      },
      removeList: (id) => {
        if (id === SAVED_LIST_ID) return;
        const lists = ensureSavedList(get().userLists, get().saved).filter((l) => l.id !== id);
        const activeListId = get().activeListId === id ? SAVED_LIST_ID : get().activeListId;
        set({ userLists: lists, activeListId, saved: savedIdsOf(lists) });
      },
      setActiveList: (id) => {
        const lists = ensureSavedList(get().userLists, get().saved);
        if (!lists.some((l) => l.id === id)) return;
        set({ activeListId: id });
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
      saveTastePreset: (name) => {
        const label = cleanLabel(name);
        const ids = get().taste;
        if (!label || ids.length === 0) return null;
        const presets = get().tastePresets;
        const savedAt = new Date().toISOString();
        const hit = presets.find((p) => p.name.toLowerCase() === label.toLowerCase());
        if (hit) {
          set({ tastePresets: presets.map((p) => (p.id === hit.id ? { ...p, ids: [...ids], savedAt } : p)) });
          return hit.id;
        }
        // 名字多是中文,slugify 出不来可用的 id,直接给一个时间戳 id
        const id = `tp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        set({ tastePresets: [...presets, { id, name: label, ids: [...ids], savedAt }] });
        return id;
      },
      applyTastePreset: (id) => {
        const hit = get().tastePresets.find((p) => p.id === id);
        if (!hit) return;
        set({ taste: [...hit.ids] });
      },
      removeTastePreset: (id) => set({ tastePresets: get().tastePresets.filter((p) => p.id !== id) }),
    }),
    {
      name: isPublicDemo ? "vprgrid-demo-v4" : "grain-friday-v4",
      skipHydration: true,
      storage: createJSONStorage(() => grainStorage),
      version: 13,
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
        activeListId: s.activeListId,
        hidden: s.hidden,
        view: s.view,
        customFamilies: s.customFamilies,
        customGenres: s.customGenres,
        tastePresets: s.tastePresets,
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
        if (version < 10) {
          const next = s as { userLists?: UserList[]; saved?: string[]; activeListId?: string };
          next.userLists = ensureSavedList(next.userLists, next.saved);
          next.activeListId = next.activeListId && next.userLists.some((l) => l.id === next.activeListId)
            ? next.activeListId
            : SAVED_LIST_ID;
          next.saved = savedIdsOf(next.userLists);
        }
        // v10 → v11:冷门风格已并进内置谱系,清掉当时挂在自定义「冷门与地域」下的重复项
        if (version < 11) {
          const next = s as { customFamilies?: CustomFamily[]; customGenres?: CustomGenre[] };
          next.customGenres = (next.customGenres ?? []).filter((g) => g.parentId !== "cf-rare-regional");
          next.customFamilies = (next.customFamilies ?? []).filter((f) => f.id !== "cf-rare-regional");
        }
        // v11 → v13:默认改为全库;还停在旧 Baseline 的存档跟着升上去
        if (version < 13) {
          const next = s as { taste?: string[] };
          next.taste = normalizePersistedTaste(Array.isArray(next.taste) ? next.taste : []);
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
  let lastLists = s0.userLists;
  void writeHeavy({ refSources: lastRef, artistNotes: lastNotes, sleeves: lastSleeves, userLists: lastLists });
  useGrain.subscribe((s) => {
    if (s.refSources === lastRef && s.artistNotes === lastNotes && s.sleeves === lastSleeves && s.userLists === lastLists) return;
    lastRef = s.refSources;
    lastNotes = s.artistNotes;
    lastSleeves = s.sleeves;
    lastLists = s.userLists;
    void writeHeavy({ refSources: lastRef, artistNotes: lastNotes, sleeves: lastSleeves, userLists: lastLists });
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
