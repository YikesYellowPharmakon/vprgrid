import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchMusicMap, isVariousArtistCredit, type MusicMapGraph, type MusicMapNode } from "@/lib/catalog/music-map";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const W = 640;
const H = 360;

type Pt = MusicMapNode & { x: number; y: number; i: number };

function layout(graph: MusicMapGraph): Pt[] {
  const cx = W / 2;
  const cy = H / 2 + 6;
  const rest = graph.nodes.slice(1);
  const n = rest.length;
  return graph.nodes.map((node, i) => {
    if (i === 0) return { ...node, x: cx, y: cy, i };
    const inner = i <= 7;
    const ring = inner ? 0.24 : 0.46;
    const stretch = 1 - node.sim * 0.12;
    const r = Math.min(W, H) * ring * stretch;
    const slot = inner ? i - 1 : i - 8;
    const count = inner ? Math.min(7, n) : Math.max(1, n - 7);
    const angle = -Math.PI / 2 + (2 * Math.PI * slot) / count + (inner ? 0.18 : -0.08);
    return { ...node, x: cx + Math.cos(angle) * r * 1.22, y: cy + Math.sin(angle) * r * 0.9, i };
  });
}

export function ArtistMusicMap({ artist, active }: { artist: string; active: boolean }) {
  const t = useT();
  const seed = artist.split(/\s*(?:\/|&|,|feat\.?|ft\.?)\s*/i)[0]?.trim() || artist.trim();
  const various = isVariousArtistCredit(seed);
  const [focus, setFocus] = useState(seed);
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    setFocus(seed);
  }, [seed]);
  const query = useQuery({
    queryKey: ["music-map", focus],
    queryFn: () => fetchMusicMap({ data: { artist: focus } }),
    enabled: active && wanted && focus.length > 0 && !isVariousArtistCredit(focus),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
  const graph = query.data?.ok ? query.data.graph : null;
  const pts = useMemo(() => (graph ? layout(graph) : []), [graph]);
  const traveled = focus.trim().toLowerCase() !== seed.trim().toLowerCase();

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs tracking-[0.22em] text-subtle">{t.musicMapTitle}</p>
          <p className="mt-1 text-xs text-muted">{t.musicMapHint}</p>
        </div>
        {graph ? (
          <a
            href={graph.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"
          >
            Music-Map ↗
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>

      {various ? (
        <p className="mt-3 text-sm text-muted">{t.musicMapEmpty}</p>
      ) : !wanted ? (
        <button
          type="button"
          onClick={() => setWanted(true)}
          className="mt-3 rounded-md border border-border bg-raised px-3 py-2 text-xs text-fg hover:border-accent/50 hover:text-accent"
        >
          {t.musicMapOpen}
        </button>
      ) : null}

      {traveled ? (
        <button
          type="button"
          onClick={() => setFocus(seed)}
          className="mt-2 text-xs text-accent hover:underline"
        >
          {t.musicMapBack(seed)}
        </button>
      ) : null}

      <div className={cn("music-map-field relative mt-3 overflow-hidden rounded-lg shadow-[var(--shadow-border)]", !wanted && "hidden")}>
        {query.isFetching && !graph ? (
          <p className="px-4 py-16 text-center text-sm text-subtle">{t.musicMapLoading}</p>
        ) : null}
        {query.data && !query.data.ok ? (
          <p className="px-4 py-16 text-center text-sm text-muted">
            {query.data.error === "not-found" ? t.musicMapEmpty : t.musicMapFail}
          </p>
        ) : null}
        {graph ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-[min(58vw,22rem)] w-full text-accent" role="img" aria-label={t.musicMapTitle}>
            <defs>
              <filter id="mm-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.6" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g filter="url(#mm-glow)">
              {graph.edges.map((e) => {
                const a = pts[e.a];
                const b = pts[e.b];
                if (!a || !b) return null;
                const fromCenter = e.a === 0;
                return (
                  <line
                    key={`${e.a}-${e.b}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="currentColor"
                    strokeWidth={fromCenter ? 0.9 + e.w * 1.1 : 0.55}
                    opacity={fromCenter ? 0.22 + e.w * 0.45 : 0.1 + e.w * 0.2}
                  />
                );
              })}
            </g>
            {pts.map((p) => (
              <g key={p.slug + p.i}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.i === 0 ? 7.5 : 3.2 + p.sim * 2.2}
                  fill={p.i === 0 ? "var(--color-accent)" : "var(--color-raised)"}
                  stroke="currentColor"
                  strokeWidth={p.i === 0 ? 1.6 : 1}
                  opacity={p.i === 0 ? 1 : 0.55 + p.sim * 0.45}
                />
                {p.i === 0 ? (
                  <circle cx={p.x} cy={p.y} r="12.5" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.35" />
                ) : null}
              </g>
            ))}
            {pts.map((p) => {
              const label = p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name;
              const below = p.y >= H / 2 + 8;
              return (
                <text
                  key={`t-${p.slug}-${p.i}`}
                  x={p.x}
                  y={below ? p.y + 16 : p.y - 12}
                  textAnchor="middle"
                  className={cn("music-map-label", p.i === 0 && "music-map-label-core")}
                  fill={p.i === 0 ? "var(--color-fg)" : "var(--color-muted)"}
                >
                  {label}
                </text>
              );
            })}
            {pts.map((p) =>
              p.i === 0 ? null : (
                <circle
                  key={`hit-${p.slug}`}
                  cx={p.x}
                  cy={p.y}
                  r="16"
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={() => setFocus(p.name)}
                >
                  <title>{p.name}</title>
                </circle>
              ),
            )}
          </svg>
        ) : null}
      </div>
    </section>
  );
}
