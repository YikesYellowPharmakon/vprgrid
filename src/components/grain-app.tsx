import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Bookmark,
  Download,
  EyeOff,
  Globe,
  History,
  Languages,
  LayoutGrid,
  List,
  ListMusic,
  ListPlus,
  LoaderCircle,
  Palette,
  Play,
  RefreshCw,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { startTransition, useCallback, useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { getWeekCatalog } from "@/lib/catalog/api";
import { buildReference, makeExtraEntry, normalizeKey } from "@/lib/catalog/gold";
import { importApple, importArtistRef, importBandcamp, importRss } from "@/lib/catalog/import-sources";
import { importPlaylist } from "@/lib/catalog/playlist-import";
import { ackRefResults, mergeSourceFromItems, pullRefResults, refreshLinkedSource } from "@/lib/catalog/ref-refresh";
import {
  applyPlaylistToBuiltin,
  decodeImportPayload,
  ensureAppleSource,
  ensureBandcampSource,
  ensureBuiltinPlaylist,
  peelForeignPlaylistFromBuiltin,
  itemsToEntries,
  mergeGoldEntries,
  mergeSourceEntries,
  newSourceId,
  normalizeRefUrl,
  sourceEntries,
} from "@/lib/catalog/sources";
import { ALL_TASTE, inferGenres, tastePreset } from "@/lib/catalog/genres";
import { getListenLinks } from "@/lib/catalog/listen";
import { searchGlobal, type GlobalHit } from "@/lib/catalog/search";
import { buildRefGenreProfile, isAssemblyLine, rankAlbums, scoreAlbum } from "@/lib/catalog/score";
import type { CatalogAlbum, ScoredAlbum, WeekCatalog } from "@/lib/catalog/types";
import { displayReleaseDate } from "@/lib/catalog/release-date";
import { daysUntil, fridayOnOrAfter, toIso } from "@/lib/catalog/week";
import {
  EARLIER_KEY,
  FIRST_WEEK_2026,
  formatPeriod,
  formatWeek,
  fridayOfWeek,
  listMonthKeys,
  listWeekKeys,
  mondayOf,
  periodBounds,
  shiftSpan,
  timelineCap,
  weekKeyOf,
  ymOf,
  type Period,
} from "@/lib/catalog/weeks";
import { findLinkedAlbum, hasAlbumTarget, stubAlbumFromLink, type AppSearch } from "@/lib/album-link";
import { exportCsv, exportIcs, exportJson, exportOfflineHtml } from "@/lib/export";
import { getDict, useT } from "@/lib/i18n";
import {
  displayListName,
  ensureSavedList,
  listHasAlbum,
  resolveListAlbums,
  SAVED_LIST_ID,
  savedIdsOf,
} from "@/lib/catalog/lists";
import { useGrain, useTaxonomy, watchHeavyPersist } from "@/lib/store";
import { buildSyncCode, pushSyncCode, type SyncWallItem } from "@/lib/sync";
import { applyTheme } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { isPublicDemo } from "@/lib/demo";
import { backupNow, maybeRestoreVault, startVaultWatch } from "@/lib/vault";
import { AddToListMenu } from "./add-to-list-menu";
import { DemoBanner } from "./demo-banner";
import { AiSheet } from "./ai-sheet";
import { AlbumSheet, ListenLinkRow } from "./album-sheet";
import { CoverHoverAdd, ListGridTile, ListRemoveBtn, SelectCheck, SortableAlbumGrid, SortableAlbumList, type ListedAlbum } from "./list-album-board";
import { ListImportPanel } from "./list-import-panel";
import { ListSelectBar } from "./list-select-bar";
import { PeriodBar, type CustomKind, type Grain } from "./period-bar";
import { RefSheet } from "./ref-sheet";
import { Sleeve } from "./sleeve";
import { TopsterSheet } from "./topster-sheet";
import { UserListsBar } from "./user-lists-bar";
import { VaultPanel } from "./vault-panel";
import { TasteSheet } from "./taste-sheet";
import { ThemeSheet } from "./theme-sheet";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent } from "./ui/sheet";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";

const LIST_PAGE = 64;

export function GrainApp({ initial, openLink = {} }: { initial: WeekCatalog; openLink?: AppSearch }) {
  const currentWeek = initial.weekStart;
  const currentYm = ymOf(currentWeek);
  const [grain, setGrain] = useState<Grain>(() => (openLink.month ? "month" : "week"));
  const [customKind, setCustomKind] = useState<CustomKind>("weeks");
  const [weekKey, setWeekKey] = useState(() => (openLink.week ? mondayOf(openLink.week) : currentWeek));
  const [monthKey, setMonthKey] = useState(() => openLink.month ?? currentYm);
  const [weekFrom, setWeekFrom] = useState(currentWeek);
  const [weekTo, setWeekTo] = useState(currentWeek);
  const [monthFrom, setMonthFrom] = useState(currentYm);
  const [monthTo, setMonthTo] = useState(currentYm);
  const period = useMemo<Period>(() => {
    if (grain === "week") return { mode: "week", key: weekKey };
    if (grain === "month") return { mode: "month", ym: monthKey };
    if (customKind === "weeks") return { mode: "weeks", from: weekFrom, to: weekTo };
    return { mode: "months", from: monthFrom, to: monthTo };
  }, [grain, customKind, weekKey, monthKey, weekFrom, weekTo, monthFrom, monthTo]);
  const bounds = useMemo(() => periodBounds(period), [period]);
  const isEarlier = grain === "week" && weekKey === EARLIER_KEY;
  const nextFriday = fridayOnOrAfter();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"week" | "saved">("week");
  const linkStub = stubAlbumFromLink(openLink);
  const [openId, setOpenId] = useState<string | null>(linkStub?.id ?? null);
  const pendingOpen = useRef<AppSearch | null>(hasAlbumTarget(openLink) ? openLink : null);
  const [settings, setSettings] = useState(false);
  const [install, setInstall] = useState(false);
  const [tasteOpen, setTasteOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [rescanBusy, setRescanBusy] = useState(false);
  const [webImportBusy, setWebImportBusy] = useState(false);
  const [pickedKeys, setPickedKeys] = useState<string[]>([]);
  const [wallOpen, setWallOpen] = useState(false);
  const lastPick = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const taste = useGrain((s) => s.taste);
  const weights = useGrain((s) => s.weights);
  const strictTaste = useGrain((s) => s.strictTaste);
  const skipThinRatings = useGrain((s) => s.skipThinRatings);
  const skipRoughCovers = useGrain((s) => s.skipRoughCovers);
  const skipAssemblyLine = useGrain((s) => s.skipAssemblyLine);
  const types = useGrain((s) => s.types);
  const saved = useGrain((s) => s.saved);
  const userLists = useGrain((s) => s.userLists);
  const activeListId = useGrain((s) => s.activeListId);
  const removeFromList = useGrain((s) => s.removeFromList);
  const reorderList = useGrain((s) => s.reorderList);
  const hidden = useGrain((s) => s.hidden);
  const sleeves = useGrain((s) => s.sleeves);
  const view = useGrain((s) => s.view);
  const theme = useGrain((s) => s.theme);
  const lang = useGrain((s) => s.lang);
  const setLang = useGrain((s) => s.setLang);
  const t = useT();
  const customTheme = useGrain((s) => s.customTheme);
  const refSources = useGrain((s) => s.refSources);
  const addSource = useGrain((s) => s.addSource);
  const updateSource = useGrain((s) => s.updateSource);
  const addRefExtra = useGrain((s) => s.addRefExtra);
  const setWeights = useGrain((s) => s.setWeights);
  const setStrictTaste = useGrain((s) => s.setStrictTaste);
  const setSkipThinRatings = useGrain((s) => s.setSkipThinRatings);
  const setSkipRoughCovers = useGrain((s) => s.setSkipRoughCovers);
  const setSkipAssemblyLine = useGrain((s) => s.setSkipAssemblyLine);
  const setTypes = useGrain((s) => s.setTypes);
  const setView = useGrain((s) => s.setView);
  const toggleSaved = useGrain((s) => s.toggleSaved);
  const toggleHidden = useGrain((s) => s.toggleHidden);
  const setTaste = useGrain((s) => s.setTaste);
  const applyTaste = useCallback((ids: string[]) => {
    startTransition(() => setTaste(ids));
  }, [setTaste]);
  const { families, genres } = useTaxonomy();
  const genreIndex = useMemo(
    () => new Map(families.flatMap((f) => f.children.map((c) => [c.id, { parent: f.label, child: c.label }] as const))),
    [families],
  );

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let dead = false;
    void Promise.resolve(useGrain.persist.rehydrate())
      .catch(() => undefined)
      .then(async () => {
        if (dead) return;
        watchHeavyPersist();
        const sources = useGrain.getState().refSources;
        const next = peelForeignPlaylistFromBuiltin(
          sources.map((src) => ensureBandcampSource(ensureAppleSource(ensureBuiltinPlaylist(src)))),
        );
        if (next.length !== sources.length || next.some((src, i) => src !== sources[i])) {
          useGrain.setState({ refSources: next });
        }
        const st = useGrain.getState();
        const lists = ensureSavedList(st.userLists, st.saved);
        useGrain.setState({
          userLists: lists,
          activeListId: lists.some((l) => l.id === st.activeListId) ? st.activeListId : SAVED_LIST_ID,
          saved: savedIdsOf(lists),
        });
        // 公开演示不读写服务器档案(Vercel 只读盘,也不能让访客共享一份 vault)
        if (!isPublicDemo) {
          const back = await maybeRestoreVault();
          if (dead) return;
          if (back) {
            const d = getDict(useGrain.getState().lang);
            toast.success(d.toastVaultRestored(back.lists, back.albums, back.sources));
            void backupNow();
          }
          startVaultWatch();
        }
        setHydrated(true);
      });
    return () => {
      dead = true;
    };
  }, []);

  const lastWall = useRef<{
    week: string;
    grain?: "week" | "month";
    start?: string;
    end?: string;
    items: SyncWallItem[];
    scanned?: number | null;
    passed?: number | null;
    line?: number | null;
  } | null>(null);

  useEffect(() => {
    applyTheme(theme, customTheme);
  }, [theme, customTheme]);

  const [listShown, setListShown] = useState(LIST_PAGE);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  /** 打开应用时自动刷新 autoSync 源(网易云/Apple/Bandcamp/RSS/艺人/RYM/AOTY),1 小时节流。 */
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(async () => {
      const now = Date.now();
      const stale = useGrain
        .getState()
        .refSources.filter(
          (s) =>
            s.enabled &&
            s.autoSync &&
            s.url &&
            (!s.lastSync || now - Date.parse(s.lastSync) > 60 * 60 * 1000),
        );
      for (const src of stale) {
        try {
          if (src.kind === "netease") {
            const res = await importPlaylist({ data: { playlist: src.url! } });
            if (res.ok) {
              updateSource(src.id, { entries: res.playlist.entries, lastSync: new Date().toISOString() });
            }
          } else if (src.kind === "builtin") {
            const res = await importPlaylist({ data: { playlist: src.url! } });
            if (res.ok) {
              const { entries } = applyPlaylistToBuiltin(src, res.playlist.entries);
              updateSource(src.id, {
                entries,
                lastSync: new Date().toISOString(),
                detail: `${res.playlist.name} · ${res.playlist.entries.length} 首`,
              });
            }
          } else if (src.kind === "apple") {
            const res = await importApple({ data: { url: src.url! } });
            if (res.ok) {
              const incoming = itemsToEntries(`apple:${src.url}`, res.items);
              const { entries } = mergeGoldEntries(src.entries, incoming);
              updateSource(src.id, {
                entries,
                detail: res.detail,
                lastSync: new Date().toISOString(),
              });
            }
          } else if (src.kind === "bandcamp") {
            const res = await importBandcamp({ data: { url: src.url! } });
            if (res.ok) {
              const incoming = itemsToEntries(`bandcamp:${src.url}`, res.items);
              const { entries } = mergeGoldEntries(src.entries, incoming);
              updateSource(src.id, {
                entries,
                detail: res.detail,
                lastSync: new Date().toISOString(),
              });
            }
          } else if (src.kind === "rss") {
            const res = await importRss({ data: { url: src.url! } });
            if (res.ok) {
              updateSource(src.id, {
                entries: itemsToEntries(`rss:${src.url}`, res.items),
                lastSync: new Date().toISOString(),
              });
            }
          } else if (src.kind === "artist") {
            const res = await importArtistRef({ data: { artist: src.url! } });
            if (res.ok) {
              updateSource(src.id, {
                entries: itemsToEntries(`artist:${src.url}`, res.items),
                detail: res.detail,
                lastSync: new Date().toISOString(),
              });
            }
          } else if (src.kind === "rym" || src.kind === "aoty") {
            const res = await refreshLinkedSource(src);
            if (res.mode === "server") {
              const { entries } = mergeSourceFromItems(src, res.items);
              updateSource(src.id, { entries, lastSync: new Date().toISOString() });
            }
            // queued:插件后台打开原链接,结果由下面的轮询合并
          }
        } catch {
          // 单个源刷新失败不打断其他源,下次打开再试
        }
      }
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  /** 收下插件后台刷新完的 RYM/AOTY 清单,按链接合并进已有源(只追加新专辑)。 */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const absorb = async () => {
      const incoming = await pullRefResults();
      if (cancelled || incoming.length === 0) return;
      const acked: string[] = [];
      const sources = useGrain.getState().refSources;
      for (const row of incoming) {
        const src = sources.find((s) => s.url && normalizeRefUrl(s.url) === normalizeRefUrl(row.url));
        if (!src) {
          acked.push(row.url);
          continue;
        }
        const { entries, added } = mergeSourceFromItems(src, row.items ?? []);
        updateSource(src.id, { entries, lastSync: new Date().toISOString() });
        acked.push(row.url);
        if (added > 0) toast(t.toastRefMerged(src.label, entries.length, added));
      }
      await ackRefResults(acked);
    };
    void absorb();
    const id = window.setInterval(() => void absorb(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  /** 导入桥:浏览器插件把 RYM/AOTY 列表经 #refimport= 递进来,落成一个订阅源。 */
  useEffect(() => {
    if (!hydrated) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#refimport=")) return;
    const raw = hash.slice("#refimport=".length);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (raw === "clipboard") {
      setRefOpen(true);
      toast(t.toastClipboardBridge);
      return;
    }
    const payload = decodeImportPayload(raw);
    if (!payload || payload.items.length === 0) {
      toast(t.toastBridgeBad);
      return;
    }
    const entries = itemsToEntries(`${payload.kind}:${payload.url ?? payload.label}`, payload.items);
    const existing = payload.url
      ? useGrain.getState().refSources.find((s) => s.url && normalizeRefUrl(s.url) === normalizeRefUrl(payload.url!))
      : undefined;
    if (existing) {
      const { entries: merged, added } = mergeGoldEntries(existing.entries, entries);
      updateSource(existing.id, {
        entries: merged,
        detail: payload.detail ?? existing.detail,
        lastSync: new Date().toISOString(),
        autoSync: true,
      });
      setRefOpen(true);
      toast(t.toastRefMerged(existing.label, merged.length, added));
    } else {
      addSource({
        id: newSourceId(payload.kind),
        kind: payload.kind,
        label: payload.label,
        url: payload.url,
        detail: payload.detail ?? `${entries.length} 张`,
        enabled: true,
        autoSync: true,
        entries,
        lastSync: new Date().toISOString(),
      });
      setRefOpen(true);
      toast(
        t.toastBridgeDone(
          payload.kind === "rym" ? "RYM" : payload.kind === "aoty" ? "AOTY" : t.bridgeExternal,
          payload.label,
          entries.length,
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const catalog = useQuery({
    queryKey: ["grain-period", bounds?.start ?? "earlier", bounds?.end ?? "earlier"],
    queryFn: () =>
      getWeekCatalog({
        data: {
          friday: fridayOfWeek(mondayOf(bounds!.start)),
          weekStart: bounds!.start,
          weekEnd: bounds!.end,
        },
      }),
    enabled: Boolean(bounds),
    initialData:
      bounds?.start === initial.weekStart && bounds?.end === initial.weekEnd ? initial : undefined,
    // SSR 快路径交来的白卷(partial)视为过期数据,挂载后立即重新拉完整目录
    initialDataUpdatedAt: initial.partial ? 0 : Date.parse(initial.fetchedAt) || Date.now(),
    staleTime: 20 * 60 * 1000,
    // 自动推送：页面开着每 30 分钟拉一次；切回标签页时若数据过期立刻刷新。
    // 周五发行日一到，新专辑无需手动操作即出现在本周列表。
    refetchInterval: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  /** 参考标准:所有开启的订阅源合并去重后的参考池。 */
  const reference = useMemo(() => buildReference(mergeSourceEntries(refSources)), [refSources]);

  /** 参考池艺人集合:自动雷达里这些艺人加权、豁免过滤(艺人追踪的核心)。 */
  const refArtists = useMemo(() => {
    const set = new Set<string>();
    for (const s of refSources) {
      if (!s.enabled) continue;
      for (const e of sourceEntries(s)) set.add(e.artist.trim().toLowerCase());
      if (s.kind === "artist" && s.url) set.add(s.url.trim().toLowerCase());
    }
    return set;
  }, [refSources]);

  /** 周时间轴:2026-W01 至今 + 参考池覆盖的周,最远只看到约一年后(去掉离谱未来年)。 */
  const weeks = useMemo(() => {
    const { lastMonday } = timelineCap();
    const keys = new Set(listWeekKeys());
    keys.add(currentWeek);
    for (const k of reference.byWeek.keys()) {
      if (k !== EARLIER_KEY && k <= lastMonday) keys.add(k);
    }
    keys.delete(EARLIER_KEY);
    return [EARLIER_KEY, ...[...keys].sort()];
  }, [currentWeek, reference]);
  const weekSpanKeys = useMemo(() => weeks.filter((k) => k !== EARLIER_KEY), [weeks]);
  const months = useMemo(() => {
    const { lastYm } = timelineCap();
    const keys = new Set(listMonthKeys());
    keys.add(currentYm);
    for (const k of reference.byWeek.keys()) {
      if (k === EARLIER_KEY) continue;
      const ym = ymOf(k);
      if (ym >= "2026-01" && ym <= lastYm) keys.add(ym);
    }
    return [...keys].sort();
  }, [currentYm, reference]);

  useEffect(() => {
    const { lastMonday, lastYm } = timelineCap();
    if (weekKey !== EARLIER_KEY && weekKey > lastMonday) setWeekKey(currentWeek);
    if (monthKey > lastYm) setMonthKey(currentYm);
    if (weekFrom > lastMonday) setWeekFrom(currentWeek);
    if (weekTo > lastMonday) setWeekTo(currentWeek);
    if (monthFrom > lastYm) setMonthFrom(currentYm);
    if (monthTo > lastYm) setMonthTo(currentYm);
  }, [currentWeek, currentYm, weekKey, monthKey, weekFrom, weekTo, monthFrom, monthTo]);

  /** 参考条目只推断风格一次;口味变化时不再扫整池。 */
  const goldBase = useMemo(() => {
    return reference.albums.map((a) => ({
      ...a,
      inferredGenres: inferGenres(
        { title: a.title, artist: a.artist, tags: a.tags, secondaryType: a.secondaryType },
        genres,
      ),
    }));
  }, [reference, genres]);

  /** 参考池风格画像:参考池里各风格出现的频率,自动雷达按贴合度加分。 */
  const refProfile = useMemo(() => buildRefGenreProfile(goldBase), [goldBase]);

  const scoreGold = useCallback(
    (album: CatalogAlbum): ScoredAlbum => ({
      ...album,
      scores: scoreAlbum(
        album,
        taste,
        weights,
        sleeves[album.id]?.sleeveScore,
        genres,
        refArtists,
        refProfile,
        false,
      ),
    }),
    [taste, weights, sleeves, genres, refArtists, refProfile],
  );

  const goldWeek = useMemo(() => {
    const raw = isEarlier
      ? goldBase.filter((a) => !a.dateUnknown && weekKeyOf(a.date) === EARLIER_KEY)
      : bounds
        ? goldBase.filter((a) => !a.dateUnknown && a.date >= bounds.start && a.date <= bounds.end)
        : [];
    return raw.map(scoreGold);
  }, [goldBase, isEarlier, bounds, scoreGold]);

  /** 自动雷达：本周（自然周）内、通过质量规则、且不与参考标准重复。 */
  const autoRanked = useMemo(() => {
    const raw = (catalog.data?.albums ?? []).filter(
      (a) => a.inSelectedWeek && !reference.dupKeys.has(`${normalizeKey(a.artist)}||${normalizeKey(a.title)}`),
    );
    const albums = raw.map((a) => ({
      ...a,
      inferredGenres:
        a.inferredGenres.length > 0
          ? a.inferredGenres
          : inferGenres(
              { title: a.title, artist: a.artist, tags: a.tags, secondaryType: a.secondaryType },
              genres,
            ),
    }));
    return rankAlbums(
      albums,
      taste,
      weights,
      sleeves,
      {
        strictTaste: tab === "week" ? strictTaste : false,
        types,
        skipThinRatings: tab === "week" ? skipThinRatings : false,
        skipRoughCovers: tab === "week" ? skipRoughCovers : false,
        skipAssemblyLine: tab === "week" ? skipAssemblyLine : false,
        refArtists,
        refProfile,
      },
      genres,
    );
  }, [catalog.data, reference, refArtists, refProfile, taste, weights, sleeves, strictTaste, skipThinRatings, skipRoughCovers, skipAssemblyLine, types, tab, genres]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  /** 全网检索(MusicBrainz,不限时间与风格):输入防抖后触发。 */
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 450);
    return () => clearTimeout(t);
  }, [query]);
  const globalQuery = useQuery({
    queryKey: ["global-search", debouncedQ],
    queryFn: () => searchGlobal({ data: { query: debouncedQ } }),
    enabled: debouncedQ.length >= 2,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 1000,
    retry: 1,
  });
  const globalHits = useMemo(() => {
    if (!globalQuery.data || !globalQuery.data.ok) return [];
    if (globalQuery.isPlaceholderData) return [];
    return globalQuery.data.hits;
  }, [globalQuery.data, globalQuery.isPlaceholderData]);

  function searchHitScore(a: { title: string; artist: string; repTrack?: { name: string } | null }): number {
    if (!q) return 0;
    const title = a.title.toLowerCase();
    const artist = a.artist.toLowerCase();
    const track = a.repTrack?.name.toLowerCase() ?? "";
    if (title === q || artist === q) return 100;
    if (title.startsWith(q) || artist.startsWith(q)) return 80;
    if (title.includes(q)) return 55;
    if (artist.includes(q)) return 45;
    if (track.includes(q)) return 30;
    return 0;
  }

  const matchQ = (a: { title: string; artist: string; repTrack?: { name: string } | null }) =>
    !q || searchHitScore(a) > 0;

  function bySearchHit<T extends { title: string; artist: string; gold?: boolean; repTrack?: { name: string } | null }>(
    a: T,
    b: T,
  ): number {
    return searchHitScore(b) - searchHitScore(a);
  }

  /** 参考标准区块：搜索时全局（跨周）检索，按命中强度排，避免弱匹配永远钉在第一位。 */
  const goldList = useMemo(() => {
    if (tab === "saved") {
      const keep = new Set(saved);
      return goldBase.filter((a) => keep.has(a.id)).filter(matchQ).sort(bySearchHit).map(scoreGold);
    }
    if (searching) return goldBase.filter(matchQ).sort(bySearchHit).slice(0, 80).map(scoreGold);
    return goldWeek;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, searching, q, goldBase, goldWeek, saved, scoreGold]);

  const autoList = useMemo(() => {
    let list = autoRanked;
    if (tab === "week") list = list.filter((a) => !hidden.includes(a.id));
    if (tab === "saved") list = list.filter((a) => saved.includes(a.id));
    list = list.filter(matchQ);
    return searching ? [...list].sort(bySearchHit) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRanked, tab, hidden, saved, q, searching]);

  const merged = useMemo(() => {
    if (!searching) return [...goldList, ...autoList];
    return [...goldList, ...autoList].sort((a, b) => {
      const d = searchHitScore(b) - searchHitScore(a);
      if (d !== 0) return d;
      if (Boolean(a.gold) !== Boolean(b.gold)) return a.gold ? -1 : 1;
      return 0;
    });
  }, [goldList, autoList, searching, q]);

  // 插件直连同步:把过滤开关 + 当周墙快照一起推上去,新标签页直接用这份名单
  useEffect(() => {
    if (!hydrated) return;
    if (tab === "week" && !searching && !isEarlier && merged.length && bounds && (grain === "week" || grain === "month")) {
      const scannedReady = Boolean(catalog.data && !catalog.data.partial);
      let line = 0;
      if (scannedReady) {
        for (const a of catalog.data?.albums ?? []) {
          if (a.inSelectedWeek && isAssemblyLine(a)) line += 1;
        }
      }
      lastWall.current = {
        week: mondayOf(bounds.start),
        grain: grain === "month" ? "month" : "week",
        start: bounds.start,
        end: bounds.end,
        items: merged.slice(0, 80).map((a) => ({
          id: a.id,
          artist: a.artist,
          title: a.title,
          date: a.date,
          pic: a.coverUrl,
          gold: Boolean(a.gold),
        })),
        scanned: scannedReady ? catalog.data!.scanned : null,
        passed: scannedReady ? autoList.length : null,
        line: scannedReady ? line : null,
      };
    }
    const id = window.setTimeout(() => {
      void pushSyncCode(
        buildSyncCode(refSources, taste, weights, {
          filters: {
            strictTaste,
            skipThinRatings,
            skipRoughCovers,
            skipAssemblyLine,
            types,
            hidden,
          },
          wall: lastWall.current ?? undefined,
        }),
      );
    }, 900);
    return () => window.clearTimeout(id);
  }, [
    refSources,
    taste,
    weights,
    theme,
    customTheme,
    strictTaste,
    skipThinRatings,
    skipRoughCovers,
    skipAssemblyLine,
    types,
    hidden,
    grain,
    weekKey,
    monthKey,
    bounds,
    merged,
    tab,
    searching,
    isEarlier,
    hydrated,
    catalog.data,
    autoList.length,
  ]);

  const listenQuery = useQuery({
    queryKey: ["listen-links", bounds?.start, bounds?.end, catalog.data?.fetchedAt, goldWeek.length],
    queryFn: () => {
      const items = [...goldWeek, ...autoRanked].slice(0, 36).map((a) => ({
        id: a.id,
        artist: a.artist,
        title: a.title,
      }));
      return getListenLinks({ data: { items } });
    },
    enabled: goldWeek.length > 0 || autoRanked.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const activeList = userLists.find((l) => l.id === activeListId) ?? userLists[0];
  const listedAlbums = useMemo(() => {
    if (tab !== "saved" || !activeList) return [] as ListedAlbum[];
    const pool = [...goldBase, ...autoRanked, ...(catalog.data?.albums ?? [])];
    const blank = { apple: null, spotify: null, netease: null, bandcamp: null };
    const map = listenQuery.data ?? {};
    return resolveListAlbums(activeList.entries, pool)
      .filter(({ album }) => matchQ(album))
      .map(({ album, key }) => ({
        ...scoreGold(album),
        listKey: key,
        listen: { ...blank, ...album.listen, ...(map[album.id] ?? {}) },
      }));
  }, [tab, activeList, goldBase, autoRanked, catalog.data, q, scoreGold, listenQuery.data]);

  const listedKeys = useMemo(() => listedAlbums.map((a) => a.listKey), [listedAlbums]);
  useEffect(() => {
    setPickedKeys([]);
    lastPick.current = null;
  }, [activeListId, tab]);
  useEffect(() => {
    const keep = new Set(listedKeys);
    setPickedKeys((prev) => {
      const next = prev.filter((k) => keep.has(k));
      return next.length === prev.length ? prev : next;
    });
  }, [listedKeys]);
  useEffect(() => {
    if (tab !== "saved" || pickedKeys.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 必须挂捕获阶段:Radix 的 Esc 在 document 冒泡时就把弹层关掉并同步重渲染了,
      // 冒泡阶段再看已经分不清「Esc 是关弹层还是清勾选」。弹层/菜单开着时让给它们。
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      setPickedKeys([]);
      lastPick.current = null;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tab, pickedKeys.length]);

  function togglePick(key: string, shift: boolean) {
    const keys = listedKeys;
    if (shift && lastPick.current) {
      const a = keys.indexOf(lastPick.current);
      const b = keys.indexOf(key);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = keys.slice(lo, hi + 1);
        setPickedKeys((prev) => [...new Set([...prev, ...range])]);
        lastPick.current = key;
        return;
      }
    }
    lastPick.current = key;
    setPickedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const pickedAlbums = listedAlbums.filter((a) => pickedKeys.includes(a.listKey));

  /** 专辑墙走列表的完整顺序(不分页);有勾选就只用勾选的那些。 */
  const wallAlbums = useMemo(() => {
    const src = pickedKeys.length > 0 ? listedAlbums.filter((a) => pickedKeys.includes(a.listKey)) : listedAlbums;
    return src.map((a) => ({ artist: a.artist, title: a.title, coverUrl: a.coverUrl, coverUrlLg: a.coverUrlLg }));
  }, [listedAlbums, pickedKeys]);

  const weekRanked = useMemo(() => {
    const map = listenQuery.data ?? {};
    const blank = { apple: null, spotify: null, netease: null, bandcamp: null };
    return merged.map((a) => ({
      ...a,
      listen: { ...blank, ...a.listen, ...(map[a.id] ?? {}) },
    }));
  }, [merged, listenQuery.data]);
  const rankedWithListen = tab === "saved" ? listedAlbums : weekRanked;

  useEffect(() => {
    const pending = pendingOpen.current;
    if (!pending) return;
    const found = findLinkedAlbum([...rankedWithListen, ...goldBase, ...(catalog.data?.albums ?? [])], pending);
    if (!found) return;
    pendingOpen.current = null;
    setOpenId(found.id);
    void navigate({
      to: "/",
      search: {
        week: grain === "week" && weekKey !== EARLIER_KEY ? weekKey : undefined,
        month: grain === "month" ? monthKey : undefined,
      },
      replace: true,
    });
  }, [rankedWithListen, goldBase, catalog.data, navigate, grain, weekKey, monthKey]);

  const skipStats = useMemo(() => {
    let line = 0;
    for (const a of catalog.data?.albums ?? []) {
      if (a.inSelectedWeek && isAssemblyLine(a)) line += 1;
    }
    return { line };
  }, [catalog.data]);

  const openAlbumRaw =
    rankedWithListen.find((a) => a.id === openId) ??
    goldBase.find((a) => a.id === openId) ??
    catalog.data?.albums.find((a) => a.id === openId) ??
    (linkStub && openId === linkStub.id ? linkStub : null);
  const openAlbum = useMemo(() => {
    if (!openAlbumRaw) return null;
    return {
      ...openAlbumRaw,
      scores: scoreAlbum(
        openAlbumRaw,
        taste,
        weights,
        sleeves[openAlbumRaw.id]?.sleeveScore,
        genres,
        refArtists,
        refProfile,
        true,
      ),
    };
  }, [openAlbumRaw, taste, weights, sleeves, genres, refArtists, refProfile]);
  const openRank = Math.max(1, rankedWithListen.findIndex((a) => a.id === openId) + 1);
  const until = daysUntil(nextFriday);
  const hero = tab === "week" && !searching ? rankedWithListen[0] : null;
  useEffect(() => {
    setListShown(LIST_PAGE);
  }, [bounds?.start, bounds?.end, q, tab, view, grain, activeListId]);
  const visibleAlbums = rankedWithListen.slice(0, listShown);
  const moreCount = rankedWithListen.length - visibleAlbums.length;
  const weekLabel = formatPeriod(period, lang);
  const firstWeek = weekSpanKeys[0] ?? FIRST_WEEK_2026;
  const lastWeek = weekSpanKeys[weekSpanKeys.length - 1] ?? currentWeek;
  const firstMonth = months[0] ?? "2026-01";
  const lastMonth = months[months.length - 1] ?? currentYm;
  const weekIdx = weeks.indexOf(weekKey);
  const monthIdx = months.indexOf(monthKey);
  const isCurrentPeriod =
    (grain === "week" && weekKey === currentWeek) ||
    (grain === "month" && monthKey === currentYm) ||
    (grain === "custom" && customKind === "weeks" && weekFrom === currentWeek && weekTo === currentWeek) ||
    (grain === "custom" && customKind === "months" && monthFrom === currentYm && monthTo === currentYm);
  const goldTotal = goldBase.length;
  const enabledSources = refSources.filter((s) => s.enabled);
  const refName =
    enabledSources.length === 1 && enabledSources[0].kind === "builtin"
      ? t.refNameBuiltin
      : t.refNameSources(enabledSources.length);

  /** 当前口味对应的预设(默认全库 / 自定义)。 */
  const preset = tastePreset(taste);
  const customGenreIds = useMemo(() => genres.filter((g) => g.custom).map((g) => g.id), [genres]);

  /** 回扫补遗:对选定时期近十周绕过缓存深翻 MusicBrainz,补齐漏网发行。 */
  async function rescanWeek() {
    if (!bounds || rescanBusy) return;
    setRescanBusy(true);
    toast(t.toastRescanStart);
    try {
      const res = await getWeekCatalog({
        data: {
          friday: fridayOfWeek(mondayOf(bounds.start)),
          weekStart: bounds.start,
          weekEnd: bounds.end,
          deep: true,
        },
      });
      queryClient.setQueryData(["grain-period", bounds.start, bounds.end], res);
      toast(t.toastRescanDone(res.scanned));
    } catch {
      toast(t.toastRescanFail);
    } finally {
      setRescanBusy(false);
    }
  }

  function goPrevPeriod() {
    if (grain === "week") {
      if (weekIdx > 0) setWeekKey(weeks[weekIdx - 1]);
      return;
    }
    if (grain === "month") {
      if (monthIdx > 0) setMonthKey(months[monthIdx - 1]);
      return;
    }
    if (customKind === "weeks") {
      const next = shiftSpan(weekFrom, weekTo, -1, firstWeek, lastWeek);
      setWeekFrom(next.from);
      setWeekTo(next.to);
      return;
    }
    const next = shiftSpan(monthFrom, monthTo, -1, firstMonth, lastMonth);
    setMonthFrom(next.from);
    setMonthTo(next.to);
  }

  function goNextPeriod() {
    if (grain === "week") {
      if (weekIdx >= 0 && weekIdx < weeks.length - 1) setWeekKey(weeks[weekIdx + 1]);
      return;
    }
    if (grain === "month") {
      if (monthIdx >= 0 && monthIdx < months.length - 1) setMonthKey(months[monthIdx + 1]);
      return;
    }
    if (customKind === "weeks") {
      const next = shiftSpan(weekFrom, weekTo, 1, firstWeek, lastWeek);
      setWeekFrom(next.from);
      setWeekTo(next.to);
      return;
    }
    const next = shiftSpan(monthFrom, monthTo, 1, firstMonth, lastMonth);
    setMonthFrom(next.from);
    setMonthTo(next.to);
  }

  const prevDisabled =
    grain === "week"
      ? weekIdx <= 0
      : grain === "month"
        ? monthIdx <= 0
        : customKind === "weeks"
          ? (weekFrom <= weekTo ? weekFrom : weekTo) <= firstWeek
          : (monthFrom <= monthTo ? monthFrom : monthTo) <= firstMonth;

  const nextDisabled =
    grain === "week"
      ? weekIdx < 0 || weekIdx >= weeks.length - 1
      : grain === "month"
        ? monthIdx < 0 || monthIdx >= months.length - 1
        : customKind === "weeks"
          ? (weekFrom >= weekTo ? weekFrom : weekTo) >= lastWeek
          : (monthFrom >= monthTo ? monthFrom : monthTo) >= lastMonth;

  function changeGrain(next: Grain) {
    if (next === "month") {
      setMonthKey(weekKey === EARLIER_KEY ? currentYm : ymOf(weekKey));
    }
    if (next === "custom") {
      if (grain === "month") {
        setCustomKind("months");
        setMonthFrom(monthKey);
        setMonthTo(monthKey);
      } else {
        setCustomKind("weeks");
        const w = weekKey === EARLIER_KEY ? currentWeek : weekKey;
        setWeekFrom(w);
        setWeekTo(w);
      }
    }
    setGrain(next);
  }

  function resetPeriod() {
    setWeekKey(currentWeek);
    setMonthKey(currentYm);
    setWeekFrom(currentWeek);
    setWeekTo(currentWeek);
    setMonthFrom(currentYm);
    setMonthTo(currentYm);
  }

  /** 打开已登录的 RYM / AOTY 新发行页,由插件把本页新专写入扫描池。 */
  async function importLoggedNew() {
    if (webImportBusy) return;
    setWebImportBusy(true);
    try {
      const r = await fetch("/api/web-releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enqueue-new" }),
      });
      if (!r.ok) throw new Error("enqueue");
      toast(t.toastWebImportQueued);
      window.setTimeout(() => void catalog.refetch(), 10000);
      window.setTimeout(() => void catalog.refetch(), 22000);
    } catch {
      toast(t.toastWebImportFail);
    } finally {
      setWebImportBusy(false);
    }
  }

  /** 结果里直接删掉不想要的专辑(可撤销)。 */
  function hideAlbum(album: ScoredAlbum) {
    toggleHidden(album.id);
    toast(t.toastHidden(album.title), {
      action: { label: t.undo, onClick: () => toggleHidden(album.id) },
    });
  }

  /** 把全网检索结果加入参考体系(手动条目,按发行日期归周)。 */
  function addHitToReference(hit: GlobalHit) {
    const date = fullDate(hit.date);
    addRefExtra(makeExtraEntry({ sourceId: hit.id, title: hit.title, artist: hit.artist, date, pic: hit.coverUrl }));
    toast(t.toastAddedToRef(hit.title, formatWeek(weekKeyOf(date), lang).title));
  }

  function doExport(kind: "json" | "csv" | "html" | "ics") {
    if (kind === "ics") {
      exportIcs();
      toast(t.toastIcs);
      return;
    }
    if (!catalog.data) return;
    if (kind === "json") exportJson(catalog.data, rankedWithListen);
    if (kind === "csv") exportCsv(catalog.data, rankedWithListen);
    if (kind === "html") exportOfflineHtml(catalog.data, rankedWithListen);
    toast(t.toastDownloaded);
  }

  return (
    <div className="min-h-dvh">
      <DemoBanner />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="masthead">
              <p className="brandmark">VprGrid.SYS</p>
              <h1 className="masthead-title">{t.appTitle}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 px-2 text-xs"
                aria-label={t.ariaLang}
                onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              >
                <Languages className="size-4" />
                {t.langBtn}
              </Button>
              <Button variant="ghost" size="icon" aria-label={t.ariaRef} onClick={() => setRefOpen(true)}>
                <ListMusic className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={t.ariaTheme} onClick={() => setThemeOpen(true)}>
                <Palette className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={t.ariaAi} onClick={() => setAiOpen(true)}>
                <Sparkles className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={t.ariaRefresh} onClick={() => catalog.refetch()}>
                <RefreshCw className={cn("size-4", catalog.isFetching && "animate-spin")} />
              </Button>
              <Button variant="ghost" size="icon" aria-label={t.ariaSettings} onClick={() => setSettings(true)}>
                <Settings2 className="size-4" />
              </Button>
              <Button variant="secondary" size="sm" className="hidden sm:inline-flex" onClick={() => setInstall(true)}>
                <Download className="size-4" />
                {t.downloadMac}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <PeriodBar
              grain={grain}
              onGrain={changeGrain}
              customKind={customKind}
              onCustomKind={setCustomKind}
              label={weekLabel}
              onPrev={goPrevPeriod}
              onNext={goNextPeriod}
              prevDisabled={prevDisabled}
              nextDisabled={nextDisabled}
              weekKey={weekKey}
              weeks={weeks}
              onWeekKey={setWeekKey}
              monthKey={monthKey}
              months={months}
              onMonthKey={setMonthKey}
              weekFrom={weekFrom}
              weekTo={weekTo}
              onWeekFrom={setWeekFrom}
              onWeekTo={setWeekTo}
              monthFrom={monthFrom}
              monthTo={monthTo}
              onMonthFrom={setMonthFrom}
              onMonthTo={setMonthTo}
              lang={lang}
              showReset={!isCurrentPeriod}
              onReset={resetPeriod}
            />
            {!isEarlier ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={rescanBusy}
                onClick={() => void rescanWeek()}
                title={t.rescanHint}
              >
                {rescanBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : <History className="size-3.5" />}
                {rescanBusy ? t.rescanBusy : t.rescanWeek}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={webImportBusy}
              onClick={() => void importLoggedNew()}
              title={t.webImportHint}
            >
              {webImportBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}
              {webImportBusy ? t.webImportBusy : t.webImport}
            </Button>
            <Badge tone="accent">
              {until === 0 ? t.fridayToday : until > 0 ? t.daysToFriday(until) : t.viewingHistory}
            </Badge>
            <span className="statbar text-xs text-subtle">
              <span className="tabular-nums">{t.statRef(goldWeek.length)}</span>
              {!isEarlier ? (
                <PoolStats
                  scanned={catalog.data && !catalog.data.partial ? catalog.data.scanned : null}
                  passed={catalog.data && !catalog.data.partial ? autoList.length : null}
                  pending={
                    catalog.isFetching || !catalog.data || Boolean(catalog.data.partial)
                  }
                />
              ) : null}
              {!isEarlier && skipAssemblyLine && skipStats.line > 0 ? (
                <span className="tabular-nums">{t.statLine(skipStats.line)}</span>
              ) : null}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setTasteOpen(true)}>
                {t.tasteAZ}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setRefOpen(true)}>
                {t.refSettings}
              </Button>
              <div className="flex items-center gap-0.5 rounded-md bg-raised p-0.5 shadow-[var(--shadow-border)]" suppressHydrationWarning>
                <button
                  type="button"
                  onClick={() => applyTaste([...new Set([...ALL_TASTE, ...customGenreIds])])}
                  className={cn(
                    "h-7 rounded-sm px-2.5 text-xs",
                    preset === "all" ? "bg-surface text-fg shadow-[var(--shadow-border)]" : "text-muted hover:text-fg",
                  )}
                >
                  {t.presetAll}
                </button>
                {preset === "custom" ? (
                  <span className="h-7 rounded-sm bg-surface px-2.5 text-xs leading-7 text-fg shadow-[var(--shadow-border)]">
                    {t.presetCustom}
                  </span>
                ) : null}
              </div>
              <span className="text-xs text-subtle tabular-nums">
                {t.tasteSummary(families.length, taste.length, genres.length, refName)}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1 rounded-md bg-raised p-1">
            <TabBtn on={tab === "week"} onClick={() => setTab("week")}>
              {grain === "month" ? t.tabMonth : grain === "custom" ? t.tabCustom : t.tabWeek}
            </TabBtn>
            <TabBtn on={tab === "saved"} onClick={() => setTab("saved")}>
              <List className="size-3.5" />
              {t.tabSaved}{" "}
              {userLists.reduce((n, l) => n + l.entries.length, 0) || ""}
            </TabBtn>
          </div>
          <div className="flex flex-1 items-center gap-2 sm:max-w-md sm:justify-end">
            <div className="relative w-full">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              suppressHydrationWarning
              className="h-11 w-full rounded-md bg-surface px-3 pr-10 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query.trim() ? (
              <button
                type="button"
                aria-label={t.clearSearch}
                onClick={() => {
                  setQuery("");
                  setDebouncedQ("");
                }}
                className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted hover:bg-raised hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
            </div>
            <Button variant="ghost" size="icon" aria-label={t.ariaView} onClick={() => setView(view === "list" ? "grid" : "list")}>
              {view === "list" ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
            </Button>
          </div>
        </div>

        {tab === "week" && catalog.isError && !isEarlier ? (
          <p className="mt-8 text-sm text-danger">{t.errCatalog}</p>
        ) : null}
        {tab === "week" &&
        !isEarlier &&
        (!catalog.data || (catalog.data.partial && catalog.isFetching)) &&
        !catalog.isError &&
        goldWeek.length === 0 ? (
          <LoadingState />
        ) : null}
        {tab === "week" && catalog.data?.error && !isEarlier ? (
          <p className="mt-8 text-sm text-danger">{t.errCatalogWith(catalog.data.error)}</p>
        ) : null}

        {tab === "saved" && activeList ? (
          <>
            <UserListsBar lists={userLists} activeId={activeList.id} />
            <ListImportPanel list={activeList} />
            <ListSelectBar
              total={listedAlbums.length}
              selected={pickedKeys.length}
              albums={pickedAlbums}
              excludeListId={activeList.id}
              onWall={() => setWallOpen(true)}
              onSelectAll={() => setPickedKeys(listedKeys)}
              onClear={() => {
                setPickedKeys([]);
                lastPick.current = null;
              }}
            />
          </>
        ) : null}

        {tab === "week" &&
        merged.length === 0 &&
        (isEarlier || (catalog.data && !(catalog.data.partial && catalog.isFetching))) &&
        !(searching && (globalHits.length > 0 || globalQuery.isFetching)) ? (
          <EmptyState strict={strictTaste} searching={searching} onRelax={() => setStrictTaste(false)} />
        ) : null}
        {tab === "saved" && !searching && listedAlbums.length === 0 ? (
          <div className="mt-10 max-w-md">
            <h2 className="font-display text-2xl">{t.listEmptyTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.listEmptyBody}</p>
          </div>
        ) : null}

        {hero && view === "list" ? (
          <article
            className="mt-6 rounded-xl p-3 shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-fast)] hover:shadow-[var(--shadow-border-hover)] sm:p-4"
            style={{
              background:
                "linear-gradient(160deg, color-mix(in srgb, var(--color-raised) 80%, var(--color-surface)), var(--color-surface) 58%)",
            }}
          >
            <div className="grid w-full grid-cols-1 items-end gap-5 sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
              <div className="group relative">
                <button type="button" onClick={() => setOpenId(hero.id)} className="block w-full text-left">
                  <Sleeve album={hero} size="hero" />
                </button>
                <CoverHoverAdd album={hero} />
              </div>
              <button
                type="button"
                onClick={() => setOpenId(hero.id)}
                className="px-2 pb-2 text-left sm:px-1 sm:pb-4"
              >
                <p className="font-display text-subtle italic">
                  {hero.gold ? "Curator's pick of the week" : "Head of the week"}
                </p>
                <p className="mt-3 text-sm text-muted">{hero.artist}</p>
                <h2 className="font-display mt-1 text-3xl leading-tight font-medium tracking-[-0.03em] sm:text-4xl">
                  {hero.title}
                </h2>
                <p className="mt-3 text-sm text-subtle">
                  {displayReleaseDate(hero.date, t.unknownDate)}
                  {hero.gold ? t.heroPickTag : t.heroAutoTag(hero.type, hero.scores.composite)}
                </p>
                {hero.repTrack ? (
                  <p className="mt-2 text-sm text-muted">
                    {t.repTrack} <span className="text-fg">{hero.repTrack.name}</span>
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {hero.gold ? <Badge tone="accent">{t.badgePick}</Badge> : null}
                  {hero.inferredGenres.map((id) => {
                    const hit = genreIndex.get(id);
                    return <Badge key={id}>{hit ? `${hit.parent} / ${hit.child}` : id}</Badge>;
                  })}
                </div>
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 px-1">
              {hero.repTrack ? <RepTrackLink track={hero.repTrack} /> : null}
              <ListenLinkRow listen={hero.listen} loading={listenQuery.isFetching && !hero.listen.apple && !hero.listen.spotify && !hero.listen.netease && !hero.listen.bandcamp} />
              <AddToListMenu album={hero} triggerClassName="h-9 px-3 text-xs">
                <ListPlus className="size-3.5" />
                {t.addToList}
              </AddToListMenu>
            </div>
          </article>
        ) : null}

        {tab === "saved" && view === "list" && listedAlbums.length > 0 ? (
          <SortableAlbumList
            albums={visibleAlbums as ListedAlbum[]}
            enabled={!searching}
            onReorder={(from, to) => activeList && reorderList(activeList.id, from, to)}
            renderRow={(album, handle) => (
              <AlbumRow
                album={album}
                rank={visibleAlbums.findIndex((a) => ("listKey" in a ? a.listKey : a.id) === album.listKey) + 1}
                saved={listHasAlbum(userLists.find((l) => l.id === SAVED_LIST_ID), album) || saved.includes(album.id)}
                searching={searching}
                selected={pickedKeys.includes(album.listKey)}
                dragHandle={handle}
                childLabel={genreIndex.get(album.inferredGenres[0] ?? "")?.child}
                onToggleSelect={(shift) => togglePick(album.listKey, shift)}
                onOpen={() => setOpenId(album.id)}
                onSave={() => toggleSaved(album)}
                onHide={
                  activeList
                    ? () => removeFromList(activeList.id, album.listKey)
                    : undefined
                }
              />
            )}
          />
        ) : null}

        {tab === "saved" && view === "grid" ? (
          <SortableAlbumGrid
            albums={visibleAlbums as ListedAlbum[]}
            enabled={!searching}
            onReorder={(from, to) => activeList && reorderList(activeList.id, from, to)}
            renderTile={(album, handle) => (
              <ListGridTile
                album={album}
                rank={(visibleAlbums as ListedAlbum[]).findIndex((a) => a.listKey === album.listKey) + 1}
                selected={pickedKeys.includes(album.listKey)}
                dragHandle={handle}
                onToggleSelect={(shift) => togglePick(album.listKey, shift)}
                onOpen={() => setOpenId(album.id)}
                onRemove={() => activeList && removeFromList(activeList.id, album.listKey)}
              />
            )}
          />
        ) : null}

        {tab === "week" && view === "list" ? (
          <>
            {goldList.length > 0 && !searching ? (
              <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs tracking-[0.22em] text-subtle">
                  {t.refSectionTitle(refName)}
                  {t.refSectionCount(goldList.length)}
                </p>
                <button type="button" onClick={() => setRefOpen(true)} className="text-xs text-muted hover:text-fg">
                  {t.refSettings}
                </button>
              </div>
            ) : null}
            <ol className="mt-1 divide-y divide-border">
              {visibleAlbums.map((album, i) => {
                if (hero && album.id === hero.id) return null;
                const isFirstAuto = !album.gold && (i === 0 || Boolean(visibleAlbums[i - 1]?.gold));
                return (
                  <li key={album.id} className="album-row">
                    {isFirstAuto && goldList.length > 0 && !searching ? (
                      <p className="pt-5 pb-2 text-xs tracking-[0.22em] text-subtle">{t.autoSection}</p>
                    ) : null}
                    <AlbumRow
                      album={album}
                      rank={i + 1}
                      saved={listHasAlbum(userLists.find((l) => l.id === SAVED_LIST_ID), album) || saved.includes(album.id)}
                      searching={searching}
                      childLabel={genreIndex.get(album.inferredGenres[0] ?? "")?.child}
                      onOpen={() => setOpenId(album.id)}
                      onSave={() => toggleSaved(album)}
                      onHide={!album.gold ? () => hideAlbum(album) : undefined}
                    />
                  </li>
                );
              })}
            </ol>
          </>
        ) : null}

        {tab === "week" && view === "grid" ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visibleAlbums.map((album, i) => (
              <div
                key={album.id}
                className="album-tile group relative text-left transition-transform duration-[var(--motion-fast)] ease-[var(--ease-smooth-out)] hover:-translate-y-1"
              >
                <div className="relative">
                  <button type="button" onClick={() => setOpenId(album.id)} className="block w-full text-left">
                    <Sleeve album={album} size="tile" />
                    <span className="font-display absolute top-2 left-2 rounded-sm bg-bg/75 px-1.5 text-xs italic tabular-nums backdrop-blur-sm">
                      {album.gold ? t.rankPick : i + 1}
                    </span>
                  </button>
                  <CoverHoverAdd album={album} />
                </div>
                <button type="button" onClick={() => setOpenId(album.id)} className="mt-2.5 block w-full text-left">
                  <p className="truncate text-xs text-muted">{album.artist}</p>
                  <p className="truncate text-sm transition-colors group-hover:text-fg">{album.title}</p>
                  {album.repTrack ? <p className="truncate text-[11px] text-subtle">{t.repTrack} · {album.repTrack.name}</p> : null}
                </button>
                {!album.gold ? (
                  <button
                    type="button"
                    aria-label={t.ariaHide}
                    onClick={(e) => {
                      e.stopPropagation();
                      hideAlbum(album);
                    }}
                    className="absolute top-2 right-2 rounded-sm bg-bg/75 p-1.5 text-muted opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
                  >
                    <EyeOff className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {moreCount > 0 ? (
          <div className="mt-5 flex justify-center">
            <Button type="button" variant="secondary" onClick={() => setListShown((n) => n + LIST_PAGE)}>
              {t.showMoreEntries}
              <span className="ml-2 text-subtle">+{Math.min(LIST_PAGE, moreCount)}</span>
            </Button>
          </div>
        ) : null}

        {searching ? (
          <section className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs tracking-[0.22em] text-subtle">{t.globalTitle}</p>
              <span className="text-xs text-subtle">
                MusicBrainz · iTunes · Deezer · Discogs
                {globalQuery.isFetching ? t.globalSearching : globalHits.length ? t.globalHits(globalHits.length) : ""}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
              <span>{t.continueOn}</span>
              {(
                [
                  ["RYM", `https://rateyourmusic.com/search?searchterm=${encodeURIComponent(query.trim())}`],
                  ["AOTY", `https://www.albumoftheyear.org/search/?q=${encodeURIComponent(query.trim())}`],
                  ["Discogs", `https://www.discogs.com/search/?q=${encodeURIComponent(query.trim())}&type=release`],
                  ["Bandcamp", `https://bandcamp.com/search?q=${encodeURIComponent(query.trim())}`],
                ] as const
              ).map(([label, href]) => (
                <a key={label} href={href} target="_blank" rel="noreferrer" className="text-muted underline decoration-border underline-offset-4 hover:text-fg">
                  {label} ↗
                </a>
              ))}
            </div>
            {debouncedQ.length < 2 ? (
              <p className="mt-3 text-sm text-subtle">{t.typeMore}</p>
            ) : null}
            {globalQuery.data && !globalQuery.data.ok ? (
              <p className="mt-3 text-sm text-danger">{t.globalFail(globalQuery.data.error)}</p>
            ) : null}
            {globalQuery.isFetching && globalHits.length === 0 ? (
              <p className="mt-3 text-sm text-subtle">{t.globalLoading}</p>
            ) : null}
            {!globalQuery.isFetching && globalQuery.data?.ok && globalHits.length === 0 && debouncedQ.length >= 2 ? (
              <p className="mt-3 text-sm text-subtle">{t.globalEmpty}</p>
            ) : null}
            <ol className="mt-2 divide-y divide-border">
              {globalHits.map((hit) => {
                const inRef = reference.dupKeys.has(`${normalizeKey(hit.artist)}||${normalizeKey(hit.title)}`);
                return (
                  <li key={hit.id}>
                    <GlobalHitRow hit={hit} inRef={inRef} onAdd={() => addHitToReference(hit)} />
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <footer className="mt-16 mb-8 flex flex-col gap-3 border-t border-border pt-6 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            {t.footer(refName, goldTotal).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <button type="button" className="text-muted hover:text-fg sm:hidden" onClick={() => setInstall(true)}>
            {t.downloadMac}
          </button>
        </footer>
      </div>

      <AlbumSheet album={openAlbum} rank={openRank} open={Boolean(openAlbum)} onOpenChange={(v) => !v && setOpenId(null)} families={families} />
      <TasteSheet open={tasteOpen} onOpenChange={setTasteOpen} />
      <ThemeSheet open={themeOpen} onOpenChange={setThemeOpen} />
      <TopsterSheet
        open={wallOpen}
        onOpenChange={setWallOpen}
        listName={activeList ? displayListName(activeList, t.listDefaultName) : t.listWall}
        albums={wallAlbums}
      />
      <RefSheet open={refOpen} onOpenChange={setRefOpen} />
      <AiSheet open={aiOpen} onOpenChange={setAiOpen} />

      <Sheet open={settings} onOpenChange={setSettings}>
        <SheetContent title={t.settingsTitle}>
          <ScrollArea className="h-full">
            <div className="px-5 py-8 sm:px-7">
              <h2 className="font-display text-2xl">{t.weightsTitle}</h2>
              <p className="mt-1 text-sm text-muted">{t.weightsDesc}</p>
              <WeightRow label={t.wTaste} value={weights.taste} onChange={(n) => setWeights({ ...weights, taste: n })} />
              <WeightRow label={t.wArtist} value={weights.artist} onChange={(n) => setWeights({ ...weights, artist: n })} />
              <WeightRow label={t.wRating} value={weights.rating} onChange={(n) => setWeights({ ...weights, rating: n })} />
              <WeightRow label={t.wCover} value={weights.cover} onChange={(n) => setWeights({ ...weights, cover: n })} />

              <div className="mt-8 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">{t.strictTitle}</p>
                  <p className="text-xs text-subtle">{t.strictDesc}</p>
                </div>
                <Switch checked={strictTaste} onCheckedChange={setStrictTaste} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">{t.lineTitle}</p>
                  <p className="text-xs text-subtle">{t.lineDesc}</p>
                </div>
                <Switch checked={skipAssemblyLine} onCheckedChange={setSkipAssemblyLine} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">{t.thinTitle}</p>
                  <p className="text-xs text-subtle">{t.thinDesc}</p>
                </div>
                <Switch checked={skipThinRatings} onCheckedChange={setSkipThinRatings} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">{t.roughTitle}</p>
                  <p className="text-xs text-subtle">{t.roughDesc}</p>
                </div>
                <Switch checked={skipRoughCovers} onCheckedChange={setSkipRoughCovers} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm">{t.inclAlbum}</p>
                <Switch
                  checked={types.includes("Album")}
                  onCheckedChange={(v) =>
                    setTypes(v ? [...new Set([...types, "Album" as const])] : types.filter((t) => t !== "Album"))
                  }
                />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm">{t.inclEp}</p>
                <Switch
                  checked={types.includes("EP")}
                  onCheckedChange={(v) =>
                    setTypes(v ? [...new Set([...types, "EP" as const])] : types.filter((t) => t !== "EP"))
                  }
                />
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Sheet open={install} onOpenChange={setInstall}>
        <SheetContent title={t.installTitle}>
          <ScrollArea className="h-full">
            <div className="px-5 py-8 sm:px-7">
              <h2 className="font-display text-2xl">{t.installHeading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{t.installDesc}</p>
              <ol className="mt-6 space-y-3 text-sm text-muted">
                {t.installSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="mt-6 grid grid-cols-1 gap-2">
                <Button variant="secondary" asChild>
                  <a href="/install.html" target="_blank" rel="noreferrer">
                    {t.installGuide}
                  </a>
                </Button>
                <Button variant="secondary" onClick={() => doExport("html")}>
                  {t.dlHtml}
                </Button>
                <Button variant="secondary" onClick={() => doExport("json")}>
                  {t.dlJson}
                </Button>
                <Button variant="secondary" onClick={() => doExport("csv")}>
                  {t.dlCsv}
                </Button>
                <Button variant="secondary" onClick={() => doExport("ics")}>
                  {t.dlIcs}
                </Button>
              </div>
              <VaultPanel open={install} />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TabBtn({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-xs",
        on ? "bg-surface text-fg shadow-[var(--shadow-border)]" : "text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function WeightRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{value}</span>
      </div>
      <Slider min={0} max={80} step={1} value={[value]} onValueChange={(v) => onChange(v[0] ?? 0)} />
    </div>
  );
}

/** MusicBrainz 的首发日期可能只有年或年月,补全为可归周的完整日期。 */
function fullDate(d: string | null): string {
  if (!d) return toIso(new Date());
  if (/^\d{4}$/.test(d)) return `${d}-01-01`;
  if (/^\d{4}-\d{2}$/.test(d)) return `${d}-01`;
  return d;
}

function GlobalHitRow({ hit, inRef, onAdd }: { hit: GlobalHit; inRef: boolean; onAdd: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 py-3 sm:gap-4">
      <Sleeve
        album={{ id: hit.id, artist: hit.artist, title: hit.title, coverUrl: hit.coverUrl }}
        size="sm"
        className="size-12 rounded-sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted">{hit.artist}</p>
        <p className="truncate text-sm sm:text-base">{hit.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-subtle">
          {hit.date ?? t.unknownDate} · {hit.type} · {hit.source}
        </p>
      </div>
      <AddToListMenu
        album={{ id: hit.id, artist: hit.artist, title: hit.title, date: hit.date ?? "", coverUrl: hit.coverUrl }}
        triggerClassName="size-9"
      />
      {inRef ? (
        <span className="shrink-0 text-xs text-gold">{t.inRef}</span>
      ) : (
        <Button variant="secondary" size="sm" className="shrink-0" onClick={onAdd}>
          {t.addToRef}
        </Button>
      )}
    </div>
  );
}

function RepTrackLink({ track, compact = false }: { track: { name: string; url: string }; compact?: boolean }) {
  const t = useT();
  return (
    <a
      href={track.url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm text-muted shadow-[var(--shadow-border)] hover:bg-raised hover:text-fg",
        compact ? "h-8 px-2 text-[11px]" : "h-9 px-3 text-xs",
      )}
    >
      <Play className="size-3" />
      {t.repTrack} · {track.name.length > 28 ? `${track.name.slice(0, 28)}…` : track.name}
    </a>
  );
}

function AlbumRow({
  album,
  rank,
  saved,
  childLabel,
  searching,
  selected,
  dragHandle,
  onToggleSelect,
  onOpen,
  onSave,
  onHide,
}: {
  album: ScoredAlbum;
  rank: number;
  saved: boolean;
  childLabel?: string;
  searching?: boolean;
  selected?: boolean;
  dragHandle?: ReactNode;
  onToggleSelect?: (shift: boolean) => void;
  onOpen: () => void;
  onSave: () => void;
  onHide?: () => void;
}) {
  const t = useT();
  const lang = useGrain((s) => s.lang);
  const weekLabel =
    searching && album.gold
      ? album.dateUnknown
        ? t.unknownDate
        : formatWeek(weekKeyOf(album.date), lang).title
      : null;
  return (
    <div className={cn("-mx-2 rounded-lg px-2 py-3 transition-colors duration-[var(--motion-quick)] hover:bg-surface/70 sm:-mx-3 sm:px-3", selected && "bg-raised/80")}>
      <div className="flex items-center gap-3 sm:gap-4">
        {onToggleSelect ? (
          <SelectCheck checked={Boolean(selected)} label={t.ariaSelectAlbum(album.title)} onToggle={onToggleSelect} />
        ) : null}
        {dragHandle}
        <button type="button" onClick={onOpen} className="group flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4">
          <span className="font-display w-7 shrink-0 text-right text-sm italic text-subtle tabular-nums transition-colors group-hover:text-muted sm:w-8">
            {album.gold ? t.rankPick : rank}
          </span>
          <Sleeve album={album} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted">{album.artist}</p>
            <p className="truncate text-sm sm:text-base">{album.title}</p>
            <p className="mt-0.5 truncate text-[11px] text-subtle">
              {displayReleaseDate(album.date, t.unknownDate)}
              {album.gold ? t.heroPickTag : ` · ${album.type}`}
              {childLabel ? ` · ${childLabel}` : ""}
              {weekLabel ? ` · ${weekLabel}` : ""}
            </p>
          </div>
          <span className="font-display hidden w-10 shrink-0 text-right text-lg tabular-nums sm:block">
            {album.gold ? <span className="text-sm text-gold">{t.scorePick}</span> : album.scores.composite}
          </span>
        </button>
        <AddToListMenu album={album} triggerClassName="size-9" />
        <Button variant="ghost" size="icon-sm" aria-label={t.ariaSave} onClick={onSave}>
          {saved ? <Bookmark className="size-4 fill-current" /> : <Bookmark className="size-4" />}
        </Button>
        {onHide ? (
          dragHandle ? (
            <ListRemoveBtn onClick={onHide} />
          ) : (
          <Button variant="ghost" size="icon-sm" aria-label={t.ariaHide} className="text-subtle hover:text-fg" onClick={onHide}>
            <EyeOff className="size-4" />
          </Button>
          )
        ) : null}
      </div>
      {album.repTrack || album.listen.apple || album.listen.spotify || album.listen.netease || album.listen.bandcamp ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-10 sm:pl-28">
          {album.repTrack ? <RepTrackLink track={album.repTrack} compact /> : null}
          <ListenLinkRow listen={album.listen} compact />
        </div>
      ) : null}
    </div>
  );
}

function useTweenNumber(target: number) {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  shownRef.current = shown;
  useEffect(() => {
    const from = shownRef.current;
    const to = target;
    if (from === to) return;
    const dur = Math.min(880, 280 + Math.abs(to - from) * 6);
    let start = 0;
    let raf = 0;
    const ease = (p: number) => 1 - (1 - p) ** 3;
    const step = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / dur);
      const next = Math.round(from + (to - from) * ease(p));
      shownRef.current = next;
      setShown(next);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

function PoolStats({
  scanned,
  passed,
  pending,
}: {
  scanned: number | null;
  passed: number | null;
  pending: boolean;
}) {
  const t = useT();
  const scanN = useTweenNumber(scanned ?? 0);
  const passN = useTweenNumber(passed ?? 0);
  const scanHold = pending && scanned == null;
  const passHold = pending && passed == null;
  return (
    <span className={cn("stat-pool", pending && "is-pending")}>
      <span>· {t.statPoolLabel}</span>
      <span className="stat-num">{scanHold ? "···" : scanN}</span>
      <span>· {t.statPassLabel}</span>
      <span className="stat-num">{passHold ? "···" : passN}</span>
    </span>
  );
}

function LoadingState() {
  const t = useT();
  return (
    <div className="load-skel mt-8">
      <div className="mb-6 flex items-center gap-2 text-muted">
        <LoaderCircle className="size-4 animate-spin" />
        <p className="text-sm">{t.loading}</p>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <div className="sk h-4 w-7 rounded-sm" />
            <div className="sk size-16 rounded-sm" />
            <div className="flex-1 space-y-2">
              <div className="sk h-3 w-1/3 rounded-sm" />
              <div className="sk h-4 w-2/3 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ strict, searching, onRelax }: { strict: boolean; searching: boolean; onRelax: () => void }) {
  const t = useT();
  return (
    <div className="mt-16 max-w-md">
      <h2 className="font-display text-2xl">{searching ? t.emptySearchTitle : t.emptyWeekTitle}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {searching ? t.emptySearchBody : strict ? t.emptyStrictBody : t.emptyWeekBody}
      </p>
      {strict && !searching ? (
        <Button className="mt-4" variant="secondary" onClick={onRelax}>
          {t.showAll}
        </Button>
      ) : null}
    </div>
  );
}
