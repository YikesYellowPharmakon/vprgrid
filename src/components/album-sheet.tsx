import { Bookmark, BookmarkCheck, EyeOff, ExternalLink, ListPlus, ScanSearch, Sparkles, Star } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { analyzeCover } from "@/lib/catalog/analyze";
import { analyzeArtist } from "@/lib/catalog/artist-ai";
import { makeExtraEntry } from "@/lib/catalog/gold";
import { displayReleaseDate } from "@/lib/catalog/release-date";
import { getListenLinks } from "@/lib/catalog/listen";
import type { GenreFamily } from "@/lib/catalog/genres";
import type { ListenLinks, ScoredAlbum } from "@/lib/catalog/types";
import { listHasAlbum, SAVED_LIST_ID } from "@/lib/catalog/lists";
import { useT } from "@/lib/i18n";
import { useGrain } from "@/lib/store";
import { aiOverrideOf } from "./ai-sheet";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent } from "./ui/sheet";
import { AddToListMenu } from "./add-to-list-menu";
import { CoverHoverAdd } from "./list-album-board";
import { ArtistMusicMap } from "./music-map";
import { Sleeve } from "./sleeve";

const CATALOG_LINKS: Array<[keyof ScoredAlbum["links"], string]> = [
  ["musicbrainz", "MusicBrainz"],
  ["discogs", "Discogs"],
  ["aoty", "AOTY"],
  ["rym", "RateYourMusic"],
];

const LISTEN_LINKS: Array<[keyof ListenLinks, string]> = [
  ["apple", "Apple Music"],
  ["spotify", "Spotify"],
  ["netease", "网易云音乐"],
  ["bandcamp", "Bandcamp"],
];

export function ListenLinkRow({
  listen,
  loading,
  compact = false,
}: {
  listen?: ListenLinks | null;
  loading?: boolean;
  compact?: boolean;
}) {
  const t = useT();
  const present = LISTEN_LINKS.filter(([key]) => Boolean(listen?.[key]));
  if (loading && present.length === 0) {
    return <p className="text-xs text-subtle">{t.listenFinding}</p>;
  }
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {present.map(([key, label]) => (
        <a
          key={key}
          href={listen![key]!}
          target="_blank"
          rel="noreferrer"
          className={
            compact
              ? "inline-flex h-8 items-center gap-1 rounded-sm px-2 text-[11px] text-muted shadow-[var(--shadow-border)] hover:bg-raised hover:text-fg"
              : "inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-xs text-muted shadow-[var(--shadow-border)] hover:bg-raised hover:text-fg"
          }
        >
          {label}
          <ExternalLink className="size-3" />
        </a>
      ))}
    </div>
  );
}

export function AlbumSheet({
  album,
  rank,
  open,
  onOpenChange,
  families,
}: {
  album: ScoredAlbum | null;
  rank: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  families: GenreFamily[];
}) {
  const saved = useGrain((s) => s.saved);
  const userLists = useGrain((s) => s.userLists);
  const aiConf = useGrain((s) => s.aiConf);
  const hidden = useGrain((s) => s.hidden);
  const sleeves = useGrain((s) => s.sleeves);
  const taste = useGrain((s) => s.taste);
  const toggleSaved = useGrain((s) => s.toggleSaved);
  const toggleHidden = useGrain((s) => s.toggleHidden);
  const setSleeve = useGrain((s) => s.setSleeve);
  const addRefExtra = useGrain((s) => s.addRefExtra);
  const artistNotes = useGrain((s) => s.artistNotes);
  const setArtistNote = useGrain((s) => s.setArtistNote);
  const t = useT();
  const [artistBusy, setArtistBusy] = useState(false);

  const detailListen = useQuery({
    queryKey: ["listen-one", album?.id],
    queryFn: () =>
      getListenLinks({
        data: {
          items: [{ id: album!.id, artist: album!.artist, title: album!.title }],
          includeMb: true,
        },
      }),
    enabled: Boolean(open && album),
    staleTime: 24 * 60 * 60 * 1000,
  });

  if (!album) return null;
  const isSaved = listHasAlbum(userLists.find((l) => l.id === SAVED_LIST_ID), album) || saved.includes(album.id);
  const reading = sleeves[album.id];
  const artistNote = artistNotes[album.artist.trim().toLowerCase()];
  const noteEmpty =
    artistNote &&
    artistNote.works.length === 0 &&
    !artistNote.lineage &&
    !artistNote.achievements &&
    artistNote.similar.length === 0;
  const coverSrc = album.coverUrlLg || album.coverUrl;
  const albumId = album.id;
  const albumTitle = album.title;
  const albumArtist = album.artist;
  const listen = { ...album.listen, ...(detailListen.data?.[album.id] ?? {}) };
  const genreIndex = new Map(families.flatMap((f) => f.children.map((c) => [c.id, { parent: f.label, child: c.label }] as const)));

  async function onAnalyze() {
    if (!coverSrc) {
      toast(t.toastNoCover);
      return;
    }
    const used = Number(sessionStorage.getItem("grain-ai") ?? "0");
    if (used >= 8) {
      toast(t.toastAiLimit);
      return;
    }
    const loadingId = toast.loading(t.toastReading);
    const res = await analyzeCover({
      data: {
        title: albumTitle,
        artist: albumArtist,
        coverUrl: coverSrc,
        taste,
        ai: aiOverrideOf(aiConf),
      },
    });
    toast.dismiss(loadingId);
    if (!res.ok) {
      toast(res.error);
      return;
    }
    sessionStorage.setItem("grain-ai", String(used + 1));
    setSleeve(albumId, res.reading);
    toast(t.toastCoverDone);
  }

  async function onAnalyzeArtist() {
    if (artistBusy) return;
    setArtistBusy(true);
    const loadingId = toast.loading(t.toastArtistLoading);
    try {
      const res = await analyzeArtist({ data: { artist: albumArtist, albumTitle, ai: aiOverrideOf(aiConf) } });
      toast.dismiss(loadingId);
      if (!res.ok) {
        toast(res.error);
        return;
      }
      setArtistNote(albumArtist, res.note);
      const empty =
        res.note.works.length === 0 && !res.note.lineage && !res.note.achievements && res.note.similar.length === 0;
      toast(empty ? t.toastArtistEmpty : t.toastArtistDone);
    } finally {
      setArtistBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={`${album.artist} — ${album.title}`} className="sm:max-w-xl">
        <ScrollArea className="h-full">
          <div className="px-5 pt-6 pb-12 sm:px-7">
            <p className="font-display text-subtle italic tabular-nums">
              {album.gold ? t.detailPickTag : t.detailNo(rank)}
            </p>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-[160px_minmax(0,1fr)]">
              <div className="group relative w-40">
                <Sleeve album={album} size="lg" className="w-40" />
                <CoverHoverAdd album={album} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted">{album.artist}</p>
                <h2 className="font-display mt-1 text-2xl leading-tight font-medium tracking-[-0.03em]">
                  {album.title}
                </h2>
                <p className="mt-2 text-xs text-subtle tabular-nums">
                  {displayReleaseDate(album.date, t.unknownDate)} · {album.type}
                  {album.secondaryType ? ` · ${album.secondaryType}` : ""}
                </p>
                {album.repTrack ? (
                  <p className="mt-2 text-sm text-muted">
                    {t.repTrack}{" "}
                    <a
                      href={album.repTrack.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
                    >
                      {album.repTrack.name}
                    </a>
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {album.gold ? <Badge tone="accent">{t.badgePick}</Badge> : null}
                  {album.inferredGenres.map((id) => {
                    const hit = genreIndex.get(id);
                    return <Badge key={id}>{hit ? `${hit.parent} / ${hit.child}` : id}</Badge>;
                  })}
                  {album.tags.slice(0, 6).map((t) => (
                    <Badge key={t} tone="muted">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {album.gold ? (
              <p className="mt-6 rounded-lg bg-raised p-4 text-sm leading-relaxed text-muted">{t.goldExplainer}</p>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <ScoreCell label={t.scComposite} value={album.scores.composite} />
                  <ScoreCell label={t.scTaste} value={album.scores.taste} />
                  <ScoreCell label={t.scArtist} value={album.scores.artist} />
                  <ScoreCell label={t.scCover} value={album.scores.cover} />
                </div>

                <ul className="mt-5 space-y-1.5 text-sm text-muted">
                  {album.scores.reasons.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-subtle" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <ArtistMusicMap key={album.artist} artist={album.artist} active={open} />

            {reading ? (
              <div className="mt-6 rounded-lg bg-raised p-4">
                <p className="text-xs tracking-wide text-subtle uppercase">Sleeve</p>
                <p className="mt-1 text-sm text-fg">{reading.aesthetic}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{reading.notes}</p>
              </div>
            ) : null}

            {artistNote ? (
              <div className="mt-6 rounded-lg bg-raised p-4">
                <p className="text-xs tracking-wide text-subtle uppercase">{t.artistAiTitle}</p>
                {noteEmpty ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t.artistAiEmpty}</p>
                ) : (
                  <div className="mt-2 space-y-3">
                    {artistNote.works.length > 0 ? (
                      <div>
                        <p className="text-xs text-subtle">{t.aiWorks}</p>
                        <ul className="mt-1 space-y-0.5 text-sm text-fg">
                          {artistNote.works.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {artistNote.lineage ? (
                      <div>
                        <p className="text-xs text-subtle">{t.aiLineage}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted">{artistNote.lineage}</p>
                      </div>
                    ) : null}
                    {artistNote.achievements ? (
                      <div>
                        <p className="text-xs text-subtle">{t.aiAchievements}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted">{artistNote.achievements}</p>
                      </div>
                    ) : null}
                    {artistNote.similar.length > 0 ? (
                      <div>
                        <p className="text-xs text-subtle">{t.aiSimilar}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {artistNote.similar.map((s) => (
                            <Badge key={s} tone="muted">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={isSaved ? "default" : "secondary"}
                onClick={() => toggleSaved(album)}
              >
                {isSaved ? <BookmarkCheck /> : <Bookmark />}
                {isSaved ? t.btnSaved : t.btnSave}
              </Button>
              <AddToListMenu album={album} triggerClassName="h-9 px-3 text-xs">
                <ListPlus className="size-3.5" />
                {t.addToList}
              </AddToListMenu>
              <Button size="sm" variant="secondary" onClick={() => onAnalyze()}>
                <ScanSearch />
                {t.btnReadCover}
              </Button>
              <Button size="sm" variant="secondary" disabled={artistBusy} onClick={() => onAnalyzeArtist()}>
                <Sparkles />
                {artistNote ? t.btnArtistAiAgain : t.btnArtistAi}
              </Button>
              {!album.gold ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      addRefExtra(
                        makeExtraEntry({
                          sourceId: album.id,
                          title: album.title,
                          artist: album.artist,
                          date: album.date,
                          pic: album.coverUrlLg ?? album.coverUrl,
                        }),
                      );
                      toast(t.toastAddedPermanent(album.title));
                      onOpenChange(false);
                    }}
                  >
                    <Star />
                    {t.addToRef}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      toggleHidden(album.id);
                      onOpenChange(false);
                    }}
                  >
                    <EyeOff />
                    {hidden.includes(album.id) ? t.btnUnhide : t.btnHide}
                  </Button>
                </>
              ) : null}
            </div>

            <p className="mt-8 text-xs tracking-[0.22em] text-subtle">{t.listenTitle}</p>
            <div className="mt-3">
              <ListenLinkRow listen={listen} loading={detailListen.isFetching} />
              {!detailListen.isFetching && !LISTEN_LINKS.some(([key]) => listen[key]) ? (
                <p className="text-xs text-subtle">{t.noListenLinks}</p>
              ) : null}
            </div>

            <p className="mt-8 text-xs text-subtle">{t.catalogNote}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CATALOG_LINKS.map(([key, label]) => (
                <a
                  key={key}
                  href={album.links[key]}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-xs text-muted shadow-[var(--shadow-border)] hover:bg-raised hover:text-fg"
                >
                  {label}
                  <ExternalLink className="size-3" />
                </a>
              ))}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function ScoreCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-raised px-3 py-2.5">
      <div className="text-[11px] tracking-wide text-subtle">{label}</div>
      <div className="font-display text-xl tabular-nums">{value}</div>
      <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-bg">
        <div className="h-full bg-accent" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
