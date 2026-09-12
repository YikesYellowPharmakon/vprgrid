import { useEffect, useMemo, useState } from "react";
import { coverFallbacks, coverScale, proxiedCover } from "@/lib/catalog/links";
import { cn } from "@/lib/utils";
import type { CatalogAlbum } from "@/lib/catalog/types";

export type SleeveAlbum = Pick<CatalogAlbum, "id" | "artist" | "title" | "coverUrl"> & {
  coverUrlLg?: string | null;
};

function initials(album: SleeveAlbum) {
  const a = album.artist.trim()[0] ?? "G";
  const t = album.title.trim()[0] ?? "R";
  return `${a}${t}`.toUpperCase();
}

/**
 * 专辑封面「唱片袋」:封面图 + 顶部高光/底部压暗的玻璃层 + 内描边。
 * 首屏只拉已预热的小图;大格在小图落地后再换清晰版,不和首屏抢带宽。
 * 清晰版失败退回已出的小图;小图失败再走代理 / 艺人+专名检索,不立刻变字母。
 */
export function Sleeve({
  album,
  size = "md",
  className,
}: {
  album: SleeveAlbum;
  size?: "sm" | "md" | "lg" | "hero" | "tile";
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hi, setHi] = useState(false);
  const [hiFailed, setHiFailed] = useState(false);
  const [baseIdx, setBaseIdx] = useState(0);
  const detail = size === "hero" || size === "lg";
  const tile = size === "tile";
  const who = { artist: album.artist, title: album.title };
  const bases = useMemo(
    () => coverFallbacks(album.coverUrl, who),
    [album.coverUrl, album.artist, album.title],
  );
  const lo = bases[baseIdx] ?? null;
  const sharpUrl = detail || tile ? coverScale(album.coverUrlLg || album.coverUrl, detail ? 800 : 500) : null;
  const hiSrc = sharpUrl
    ? proxiedCover(sharpUrl, { ...who, large: detail })
    : null;
  const src = hi && hiSrc && hiSrc !== lo ? hiSrc : lo;

  useEffect(() => {
    setBroken(false);
    setLoaded(false);
    setHi(false);
    setHiFailed(false);
    setBaseIdx(0);
  }, [album.id]);

  const show = Boolean(src) && !broken;
  const box = {
    sm: "size-16 rounded-sm",
    md: "size-[72px] rounded-sm",
    lg: "size-40 rounded-md",
    hero: "aspect-square w-full rounded-lg",
    tile: "aspect-square w-full rounded-lg",
  }[size];

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-raised shadow-[var(--shadow-border)]",
        "transition-shadow duration-[var(--motion-fast)] group-hover:shadow-[var(--shadow-border-hover)]",
        box,
        className,
      )}
    >
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          background:
            "radial-gradient(120% 90% at 22% 8%, color-mix(in srgb, var(--color-fg) 9%, var(--color-raised)), var(--color-raised) 68%)",
        }}
      >
        <span
          className="font-display text-muted/80 tracking-wide italic"
          style={{ fontSize: size === "hero" || size === "tile" ? 56 : size === "lg" ? 36 : 18 }}
        >
          {initials(album)}
        </span>
      </div>
      {show ? (
        <img
          src={src ?? undefined}
          alt=""
          className={cn(
            "relative size-full object-cover group-hover:scale-[1.045]",
            "transition-[opacity,transform] duration-[var(--motion-slow)] ease-[var(--ease-smooth-out)]",
            !loaded && "opacity-0",
          )}
          loading={detail ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={detail ? "high" : "low"}
          referrerPolicy="no-referrer"
          onLoad={() => {
            setLoaded(true);
            if (hi || hiFailed || !hiSrc || hiSrc === lo) return;
            const bump = () => {
              const probe = new Image();
              probe.referrerPolicy = "no-referrer";
              probe.onload = () => setHi(true);
              probe.onerror = () => setHiFailed(true);
              probe.src = hiSrc;
            };
            if (typeof requestIdleCallback === "function") requestIdleCallback(bump, { timeout: 900 });
            else window.setTimeout(bump, 160);
          }}
          onError={() => {
            if (hi) {
              setHi(false);
              setHiFailed(true);
              return;
            }
            if (baseIdx < bases.length - 1) {
              setLoaded(false);
              setBaseIdx((i) => i + 1);
              return;
            }
            setBroken(true);
          }}
        />
      ) : null}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(255 255 255 / 0.07), transparent 26%, transparent 72%, rgb(0 0 0 / 0.14))",
        }}
      />
      <div className="pointer-events-none absolute inset-0 outline outline-1 -outline-offset-1 outline-fg/10" />
    </div>
  );
}
