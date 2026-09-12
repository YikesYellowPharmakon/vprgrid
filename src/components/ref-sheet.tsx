import { Copy, LoaderCircle, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { GoldEntry } from "@/lib/catalog/gold";
import { displayReleaseDate } from "@/lib/catalog/release-date";
import { inferGenres } from "@/lib/catalog/genres";
import { importApple, importArtistRef, importBandcamp, importRss, importWebList } from "@/lib/catalog/import-sources";
import { importPlaylist } from "@/lib/catalog/playlist-import";
import { mergeSourceFromItems, refreshLinkedSource } from "@/lib/catalog/ref-refresh";
import {
  applyPlaylistToBuiltin,
  BUILTIN_SOURCE_ID,
  describeAotyUrl,
  describeRymUrl,
  detectSourceKind,
  itemsToEntries,
  mergeGoldEntries,
  mergeSourceEntries,
  newSourceId,
  parsePastedRef,
  rymLabelFromUrl,
  sourceEntries,
  type ImportItem,
  type RefSource,
  type RefSourceKind,
} from "@/lib/catalog/sources";
import { useT } from "@/lib/i18n";
import { useGrain, useTaxonomy } from "@/lib/store";
import { buildSyncCode, copyText, pushSyncCode } from "@/lib/sync";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent } from "./ui/sheet";
import { Switch } from "./ui/switch";

const LIST_PAGE = 80;

function SourceAlbumList({
  entries,
  canRemove,
  onRemove,
}: {
  entries: GoldEntry[];
  canRemove: boolean;
  onRemove: (albumId: number, title: string) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [cap, setCap] = useState(LIST_PAGE);
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return entries;
    return entries.filter(
      (e) => e.artist.toLowerCase().includes(needle) || e.title.toLowerCase().includes(needle),
    );
  }, [entries, needle]);
  const shown = filtered.slice(0, cap);
  return (
    <div className="mt-3 border-t border-border pt-3">
      {entries.length > 12 ? (
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCap(LIST_PAGE);
          }}
          placeholder={t.filterEntries}
          autoComplete="off"
          spellCheck={false}
          className="mb-2.5 h-9 w-full rounded-md bg-surface px-3 text-xs text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : null}
      <ul className="space-y-1.5">
        {shown.map((e) => (
          <li key={e.albumId} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="text-muted">{e.artist}</span> — {e.title}
              <span className="text-xs text-subtle"> · {displayReleaseDate(e.date, t.unknownDate)}</span>
            </span>
            {canRemove ? (
              <button
                type="button"
                aria-label={t.ariaRemoveEntry(e.title)}
                className="shrink-0 text-subtle hover:text-danger"
                onClick={() => onRemove(e.albumId, e.title)}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {filtered.length > shown.length ? (
        <button
          type="button"
          onClick={() => setCap((c) => c + LIST_PAGE)}
          className="mt-2 text-xs text-muted hover:text-fg"
        >
          {t.showMoreEntries} · {t.entryListMore(filtered.length - shown.length)}
        </button>
      ) : null}
    </div>
  );
}

export function RefSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const refSources = useGrain((s) => s.refSources);
  const strictTaste = useGrain((s) => s.strictTaste);
  const skipThinRatings = useGrain((s) => s.skipThinRatings);
  const skipRoughCovers = useGrain((s) => s.skipRoughCovers);
  const skipAssemblyLine = useGrain((s) => s.skipAssemblyLine);
  const types = useGrain((s) => s.types);
  const hidden = useGrain((s) => s.hidden);

  function timeAgo(iso?: string): string {
    if (!iso) return t.never;
    const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (mins < 2) return t.justNow;
    if (mins < 60) return t.minsAgo(mins);
    const hours = Math.round(mins / 60);
    if (hours < 48) return t.hoursAgo(hours);
    return t.daysAgo(Math.round(hours / 24));
  }
  const addSource = useGrain((s) => s.addSource);
  const updateSource = useGrain((s) => s.updateSource);
  const removeSource = useGrain((s) => s.removeSource);
  const removeSourceEntry = useGrain((s) => s.removeSourceEntry);
  const toggleSource = useGrain((s) => s.toggleSource);
  const setAllSources = useGrain((s) => s.setAllSources);
  const soloSource = useGrain((s) => s.soloSource);
  const addRefExtra = useGrain((s) => s.addRefExtra);
  const removeRefExtra = useGrain((s) => s.removeRefExtra);
  const taste = useGrain((s) => s.taste);
  const setTaste = useGrain((s) => s.setTaste);
  const weights = useGrain((s) => s.weights);
  const { genres } = useTaxonomy();

  const [urlInput, setUrlInput] = useState("");
  const [rymUrl, setRymUrl] = useState<string | null>(null);
  const [rymPaste, setRymPaste] = useState("");
  const [artistInput, setArtistInput] = useState("");
  const [albumInput, setAlbumInput] = useState("");
  const [pasteInput, setPasteInput] = useState("");
  const [pasteLabel, setPasteLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  function startRename(src: RefSource) {
    setRenaming(src.id);
    setRenameDraft(src.label);
  }

  function commitRename(src: RefSource) {
    const name = renameDraft.replace(/\s+/g, " ").trim().slice(0, 48);
    setRenaming(null);
    if (!name || name === src.label) return;
    updateSource(src.id, { label: name });
    toast(t.toastSourceRenamed(name));
  }

  /** 识别新条目的风格并入口味(品味自动调整的入口)。 */
  function absorbTaste(entries: GoldEntry[]): number {
    const hits = new Set<string>();
    for (const e of entries) {
      for (const gid of inferGenres({ title: e.title, artist: e.artist, tags: [], secondaryType: null }, genres)) {
        hits.add(gid);
      }
    }
    const added = [...hits].filter((gid) => !taste.includes(gid));
    if (added.length) setTaste([...taste, ...added]);
    return added.length;
  }

  function finishAdd(src: RefSource) {
    addSource(src);
    const n = absorbTaste(src.entries);
    toast(t.toastSubscribed(src.label, src.entries.length) + (n ? t.toastGenresAdded(n) : ""));
  }

  async function addFromUrl() {
    const value = urlInput.trim();
    if (!value || busy) return;
    const kind = detectSourceKind(value);
    setBusy("url");
    try {
      if (kind === "spotify") {
        toast(t.toastSpotify);
        return;
      }
      if (kind === "unsupported") {
        toast(t.toastUnsupportedStream);
        return;
      }
      if (kind === "rym") {
        // RYM 有站点防护,服务器直抓必被拦——不再尝试,转入专属导入路径(插件/粘贴)。
        setRymUrl(value);
        setRymPaste("");
        setUrlInput("");
        return;
      }
      if (kind === "netease") {
        const res = await importPlaylist({ data: { playlist: value } });
        if (!res.ok) return void toast(res.error);
        finishAdd({
          id: newSourceId("netease"),
          kind: "netease",
          label: res.playlist.name,
          url: value,
          detail: t.neteaseDetail,
          enabled: true,
          autoSync: true,
          entries: res.playlist.entries,
          lastSync: new Date().toISOString(),
        });
      } else if (kind === "aoty") {
        const res = await importWebList({ data: { url: value } });
        if (!res.ok) return void toast(res.error, { duration: 9000 });
        finishAdd({
          id: newSourceId(kind),
          kind,
          label: res.label,
          url: value,
          detail: describeAotyUrl(value),
          enabled: true,
          autoSync: true,
          entries: itemsToEntries(`${kind}:${value}`, res.items),
          lastSync: new Date().toISOString(),
        });
      } else if (kind === "apple") {
        const res = await importApple({ data: { url: value } });
        if (!res.ok) return void toast(res.error, { duration: 8000 });
        finishAdd({
          id: newSourceId("apple"),
          kind: "apple",
          label: res.label,
          url: value,
          detail: res.detail,
          enabled: true,
          autoSync: true,
          entries: itemsToEntries(`apple:${value}`, res.items),
          lastSync: new Date().toISOString(),
        });
      } else if (kind === "bandcamp") {
        const res = await importBandcamp({ data: { url: value } });
        if (!res.ok) return void toast(res.error, { duration: 8000 });
        finishAdd({
          id: newSourceId("bandcamp"),
          kind: "bandcamp",
          label: res.label,
          url: value,
          detail: res.detail,
          enabled: true,
          autoSync: true,
          entries: itemsToEntries(`bandcamp:${value}`, res.items),
          lastSync: new Date().toISOString(),
        });
      } else if (kind === "rss") {
        const res = await importRss({ data: { url: value } });
        if (!res.ok) return void toast(res.error, { duration: 8000 });
        finishAdd({
          id: newSourceId("rss"),
          kind: "rss",
          label: res.label,
          url: value,
          detail: res.detail,
          enabled: true,
          autoSync: true,
          entries: itemsToEntries(`rss:${value}`, res.items),
          lastSync: new Date().toISOString(),
        });
      } else {
        toast(t.toastUrlUnknown);
        return;
      }
      setUrlInput("");
    } finally {
      setBusy(null);
    }
  }

  async function addArtist() {
    const value = artistInput.trim();
    if (!value || busy) return;
    setBusy("artist");
    try {
      const res = await importArtistRef({ data: { artist: value } });
      if (!res.ok) return void toast(res.error, { duration: 7000 });
      finishAdd({
        id: newSourceId("artist"),
        kind: "artist",
        label: res.label,
        url: res.label,
        detail: res.detail,
        enabled: true,
        autoSync: true,
        entries: itemsToEntries(`artist:${res.label}`, res.items),
        lastSync: new Date().toISOString(),
      });
      setArtistInput("");
    } finally {
      setBusy(null);
    }
  }

  /** RYM 专属路径:把粘贴内容解析成条目,并绑定这条 RYM 链接建成订阅源。 */
  function subscribeRymFromPaste() {
    if (!rymUrl) return;
    const text = rymPaste.trim();
    if (!text) return;
    const { items } = parsePastedRef(text);
    if (!items.length) {
      toast(t.toastPasteFail);
      return;
    }
    finishAdd({
      id: newSourceId("rym"),
      kind: "rym",
      label: rymLabelFromUrl(rymUrl),
      url: rymUrl,
      detail: describeRymUrl(rymUrl),
      enabled: true,
      autoSync: true,
      entries: itemsToEntries(`rym:${rymUrl}`, items),
      lastSync: new Date().toISOString(),
    });
    setRymUrl(null);
    setRymPaste("");
  }

  /** 直接添加单张专辑(「艺人 - 专辑名 (年份)」),进「手动亲选」源。 */
  function addAlbum() {
    const text = albumInput.trim();
    if (!text) return;
    const { items } = parsePastedRef(text);
    if (!items.length) {
      toast(t.toastAlbumParseFail);
      return;
    }
    const entries = itemsToEntries(`manual:${Date.now()}`, items);
    for (const e of entries) addRefExtra(e);
    const n = absorbTaste(entries);
    toast(t.toastAlbumAdded(entries.length) + (n ? t.toastGenresAdded(n) : ""));
    setAlbumInput("");
  }

  function addFromPaste() {
    const text = pasteInput.trim();
    if (!text || busy) return;
    const { items, format } = parsePastedRef(text);
    if (!items.length) {
      toast(t.toastPasteFail);
      return;
    }
    const label = pasteLabel.trim() || (format === "rym-csv" ? t.pasteDefaultRym : t.pasteDefaultName);
    finishAdd({
      id: newSourceId("paste"),
      kind: "paste",
      label,
      detail: format === "rym-csv" ? t.fmtRymCsv : format === "csv" ? t.fmtCsv : t.fmtLines,
      enabled: true,
      autoSync: false,
      entries: itemsToEntries(`paste:${label}:${Date.now()}`, items),
    });
    setPasteInput("");
    setPasteLabel("");
  }

  async function syncSource(src: RefSource) {
    if (busy) return;
    setBusy(src.id);
    try {
      let items: ImportItem[] | null = null;
      let detail = src.detail;
      if ((src.kind === "netease" || src.kind === "builtin") && src.url) {
        const res = await importPlaylist({ data: { playlist: src.url } });
        if (!res.ok) return void toast(res.error);
        if (src.kind === "builtin") {
          const { entries, added } = applyPlaylistToBuiltin(src, res.playlist.entries);
          updateSource(src.id, {
            entries,
            lastSync: new Date().toISOString(),
            detail: `${res.playlist.name} · ${res.playlist.entries.length} 首`,
          });
          toast(t.toastRefMerged(src.label, entries.length, added));
          return;
        }
        updateSource(src.id, { entries: res.playlist.entries, lastSync: new Date().toISOString() });
        toast(t.toastSynced(src.label, res.playlist.entries.length));
        return;
      }
      if (src.kind === "apple" && src.url) {
        const res = await importApple({ data: { url: src.url } });
        if (!res.ok) return void toast(res.error, { duration: 8000 });
        const incoming = itemsToEntries(`apple:${src.url}`, res.items);
        const { entries, added } = mergeGoldEntries(src.entries, incoming);
        updateSource(src.id, {
          entries,
          detail: res.detail,
          lastSync: new Date().toISOString(),
        });
        const n = absorbTaste(entries);
        toast(t.toastRefMerged(src.label, entries.length, added) + (n ? t.toastSyncedGenres(n) : ""));
        return;
      }
      if (src.kind === "bandcamp" && src.url) {
        const res = await importBandcamp({ data: { url: src.url } });
        if (!res.ok) return void toast(res.error, { duration: 8000 });
        const incoming = itemsToEntries(`bandcamp:${src.url}`, res.items);
        const { entries, added } = mergeGoldEntries(src.entries, incoming);
        updateSource(src.id, {
          entries,
          detail: res.detail,
          lastSync: new Date().toISOString(),
        });
        const n = absorbTaste(entries);
        toast(t.toastRefMerged(src.label, entries.length, added) + (n ? t.toastSyncedGenres(n) : ""));
        return;
      }
      if (src.kind === "rss" && src.url) {
        const res = await importRss({ data: { url: src.url } });
        if (!res.ok) return void toast(res.error);
        items = res.items;
      } else if (src.kind === "artist" && src.url) {
        const res = await importArtistRef({ data: { artist: src.url } });
        if (!res.ok) return void toast(res.error);
        items = res.items;
        detail = res.detail;
      } else if ((src.kind === "rym" || src.kind === "aoty") && src.url) {
        const res = await refreshLinkedSource(src);
        if (res.mode === "queued") {
          toast(t.toastRefQueued(src.label), { duration: 7000 });
          return;
        }
        if (res.mode === "fail") return void toast(res.error, { duration: 9000 });
        const { entries, added } = mergeSourceFromItems(src, res.items);
        updateSource(src.id, { entries, lastSync: new Date().toISOString() });
        const n = absorbTaste(entries);
        toast(t.toastRefMerged(src.label, entries.length, added) + (n ? t.toastSyncedGenres(n) : ""));
        return;
      } else {
        toast(t.toastNoSyncUrl);
        return;
      }
      const entries = itemsToEntries(`${src.kind}:${src.url}`, items);
      updateSource(src.id, { entries, detail, lastSync: new Date().toISOString() });
      const n = absorbTaste(entries);
      toast(t.toastSynced(src.label, entries.length) + (n ? t.toastSyncedGenres(n) : ""));
    } finally {
      setBusy(null);
    }
  }

  async function copySyncCode() {
    const code = buildSyncCode(refSources, taste, weights, {
      filters: {
        strictTaste,
        skipThinRatings,
        skipRoughCovers,
        skipAssemblyLine,
        types,
        hidden,
      },
    });
    const n = mergeSourceEntries(refSources).length;
    // 顺手推一份到 /api/sync:就算复制失败,插件也已经拿得到最新数据
    void pushSyncCode(code);
    if (await copyText(code)) {
      toast(t.toastSyncCopied(n));
    } else {
      // 剪贴板彻底不可用:直连同步已完成,提示用户走免复制路径
      toast(t.toastCopyFailPushed);
    }
  }

  const canAutoSync = (k: RefSourceKind) =>
    k === "builtin" ||
    k === "netease" ||
    k === "apple" ||
    k === "bandcamp" ||
    k === "rss" ||
    k === "artist" ||
    k === "rym" ||
    k === "aoty";
  const canSyncNow = (s: RefSource) =>
    Boolean(s.url) && s.kind !== "paste" && s.kind !== "manual";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t.refTitle}>
        <ScrollArea className="h-full">
          <div className="px-5 py-8 sm:px-7">
            <h2 className="font-display text-2xl">{t.refTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.refIntro}</p>

            {/* 批量控制:全选 / 全不选 */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-xs text-subtle tabular-nums">
                {t.sourcesEnabled(refSources.filter((s) => s.enabled).length, refSources.length)}
              </span>
              <button type="button" onClick={() => setAllSources(true)} className="text-xs text-muted hover:text-fg">
                {t.enableAll}
              </button>
              <button type="button" onClick={() => setAllSources(false)} className="text-xs text-muted hover:text-fg">
                {t.disableAll}
              </button>
            </div>

            {/* 订阅源列表 */}
            <div className="mt-2 space-y-2">
              {refSources.map((src) => {
                const n = sourceEntries(src).length;
                const isExpanded = expanded === src.id;
                return (
                  <div key={src.id} className="rounded-lg bg-raised p-3.5 shadow-[var(--shadow-border)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={src.enabled ? "accent" : "muted"}>{t.kindLabel[src.kind]}</Badge>
                          {renaming === src.id ? (
                            <input
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={() => commitRename(src)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  (e.target as HTMLInputElement).blur();
                                }
                                if (e.key === "Escape") setRenaming(null);
                              }}
                              autoFocus
                              maxLength={48}
                              aria-label={t.renameSource}
                              placeholder={t.phRenameSource}
                              className="font-display h-8 min-w-0 flex-1 rounded-sm bg-surface px-2 text-base leading-tight text-fg shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                          ) : (
                            <p className="font-display truncate text-base leading-tight">{src.label}</p>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-subtle tabular-nums">
                          {t.nEntries(n)}
                          {src.detail ? ` · ${src.detail}` : ""}
                          {src.kind !== "manual" ? ` · ${timeAgo(src.lastSync)}` : ""}
                        </p>
                      </div>
                      <Switch checked={src.enabled} onCheckedChange={() => toggleSource(src.id)} aria-label={t.ariaEnable(src.label)} />
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {canSyncNow(src) ? (
                        <button
                          type="button"
                          disabled={busy === src.id}
                          onClick={() => void syncSource(src)}
                          className="flex items-center gap-1 text-xs text-muted hover:text-fg disabled:opacity-50"
                        >
                          {busy === src.id ? (
                            <LoaderCircle className="size-3 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3" />
                          )}
                          {t.syncNow}
                        </button>
                      ) : null}
                      {canAutoSync(src.kind) ? (
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                          <input
                            type="checkbox"
                            checked={src.autoSync}
                            onChange={() => updateSource(src.id, { autoSync: !src.autoSync })}
                            className="size-3.5 accent-[var(--color-accent)]"
                          />
                          {t.autoRefresh}
                        </label>
                      ) : null}
                      {n > 0 ? (
                        <button
                          type="button"
                          onClick={() => setExpanded(isExpanded ? null : src.id)}
                          className="text-xs text-muted hover:text-fg"
                        >
                          {isExpanded ? t.hideList : t.showList}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => startRename(src)}
                        className="flex items-center gap-1 text-xs text-muted hover:text-fg"
                      >
                        <Pencil className="size-3" />
                        {t.renameSource}
                      </button>
                      {refSources.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            soloSource(src.id);
                            toast(t.toastSolo(src.label));
                          }}
                          className="text-xs text-muted hover:text-fg"
                        >
                          {t.soloSource}
                        </button>
                      ) : null}
                      {src.id !== BUILTIN_SOURCE_ID ? (
                        <button
                          type="button"
                          onClick={() => {
                            removeSource(src.id);
                            toast(t.toastSourceDeleted(src.label));
                          }}
                          className="ml-auto flex items-center gap-1 text-xs text-subtle hover:text-danger"
                        >
                          <Trash2 className="size-3" />
                          {t.del}
                        </button>
                      ) : null}
                    </div>
                    {isExpanded && n > 0 ? (
                      <SourceAlbumList
                        entries={sourceEntries(src)}
                        canRemove={src.id !== BUILTIN_SOURCE_ID}
                        onRemove={(albumId, title) => {
                          if (src.kind === "manual") removeRefExtra(albumId);
                          else removeSourceEntry(src.id, albumId);
                          toast(t.toastEntryRemoved(title));
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* 添加:链接 */}
            <form
              className="mt-8"
              onSubmit={(e) => {
                e.preventDefault();
                void addFromUrl();
              }}
            >
              <p className="text-sm">{t.addUrlTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-subtle">{t.addUrlDesc}</p>
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={t.phUrl}
                autoComplete="off"
                spellCheck={false}
                className="mt-2.5 h-11 w-full rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="submit" className="mt-2.5" variant="secondary" size="sm" disabled={busy !== null || !urlInput.trim()}>
                {busy === "url" ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {busy === "url" ? t.btnReadingUrl : t.btnSubscribeUrl}
              </Button>
            </form>

            {/* RYM 专属导入路径(站点防护,无法直抓) */}
            {rymUrl ? (
              <div className="mt-4 rounded-lg bg-raised p-4 shadow-[var(--shadow-border)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm">{t.rymPathTitle}</p>
                    <p className="mt-1 text-xs text-subtle tabular-nums">RYM · {describeRymUrl(rymUrl)}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={t.cancel}
                    onClick={() => setRymUrl(null)}
                    className="shrink-0 text-subtle hover:text-fg"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <ol className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted">
                  <li>{t.rymPathStep1}</li>
                  <li>{t.rymPathStep2}</li>
                </ol>
                <textarea
                  value={rymPaste}
                  onChange={(e) => setRymPaste(e.target.value)}
                  placeholder={t.phRymPaste}
                  rows={4}
                  spellCheck={false}
                  className="mt-3 w-full rounded-md bg-surface px-3 py-2.5 font-mono text-xs leading-relaxed text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button className="mt-2.5" variant="secondary" size="sm" disabled={!rymPaste.trim()} onClick={subscribeRymFromPaste}>
                  {t.btnRymParse}
                </Button>
              </div>
            ) : null}

            {/* 添加:艺人 */}
            <form
              className="mt-6"
              onSubmit={(e) => {
                e.preventDefault();
                void addArtist();
              }}
            >
              <p className="text-sm">{t.addArtistTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-subtle">{t.addArtistDesc}</p>
              <div className="mt-2.5 flex gap-2">
                <input
                  value={artistInput}
                  onChange={(e) => setArtistInput(e.target.value)}
                  placeholder={t.phArtist}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-11 min-w-0 flex-1 rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button type="submit" variant="secondary" size="sm" className="h-11" disabled={busy !== null || !artistInput.trim()}>
                  {busy === "artist" ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  {t.btnTrack}
                </Button>
              </div>
            </form>

            {/* 添加:单张专辑 */}
            <form
              className="mt-6"
              onSubmit={(e) => {
                e.preventDefault();
                addAlbum();
              }}
            >
              <p className="text-sm">{t.addAlbumTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-subtle">{t.addAlbumDesc}</p>
              <div className="mt-2.5 flex gap-2">
                <input
                  value={albumInput}
                  onChange={(e) => setAlbumInput(e.target.value)}
                  placeholder={t.phAlbum}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-11 min-w-0 flex-1 rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button type="submit" variant="secondary" size="sm" className="h-11" disabled={!albumInput.trim()}>
                  {t.btnAddAlbum}
                </Button>
              </div>
            </form>

            {/* 添加:粘贴 */}
            <form
              className="mt-6"
              onSubmit={(e) => {
                e.preventDefault();
                addFromPaste();
              }}
            >
              <p className="text-sm">{t.addPasteTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-subtle">{t.addPasteDesc}</p>
              <input
                value={pasteLabel}
                onChange={(e) => setPasteLabel(e.target.value)}
                placeholder={t.phPasteName}
                autoComplete="off"
                className="mt-2.5 h-9 w-full rounded-md bg-surface px-3 text-xs text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
              />
              <textarea
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                placeholder={t.phPasteBody}
                rows={4}
                spellCheck={false}
                className="mt-2 w-full rounded-md bg-surface px-3 py-2.5 font-mono text-xs leading-relaxed text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="submit" className="mt-2.5" variant="secondary" size="sm" disabled={!pasteInput.trim()}>
                {t.btnParse}
              </Button>
            </form>

            {/* 同步码 */}
            <div className="mt-8 rounded-lg bg-raised p-4">
              <p className="text-sm">{t.syncCodeTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-subtle">{t.syncCodeDesc}</p>
              <Button className="mt-3" variant="ghost" size="sm" onClick={() => void copySyncCode()}>
                <Copy className="size-3.5" />
                {t.btnCopySync}
              </Button>
            </div>

            <p className="mt-6 text-xs leading-relaxed text-subtle">{t.refFootnote}</p>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
