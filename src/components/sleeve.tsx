import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CatalogAlbum } from "@/lib/catalog/types";

function initials(album: CatalogAlbum) {
  const a = album.artist.trim()[0] ?? "G";
  const t = album.title.trim()[0] ?? "R";
  return `${a}${t}`.toUpperCase();
}

/**
 * 专辑封面「唱片袋」:封面图 + 顶部高光/底部压暗的玻璃层 + 内描边。
 * 放在带 `group` 类的可点容器里时,悬停会有轻微的镜头推近。
 */
export function Sleeve({
  album,
  size = "md",
  className,
}: {
  album: CatalogAlbum;
  size?: "sm" | "md" | "lg" | "hero";
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const show = album.coverUrl && !broken;
  const src = size === "hero" || size === "lg" ? album.coverUrlLg || album.coverUrl : album.coverUrl;
  const box = {
    sm: "size-16 rounded-sm",
    md: "size-[72px] rounded-sm",
    lg: "size-40 rounded-md",
    hero: "aspect-square w-full rounded-lg",
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
      {show ? (
        <img
          src={src ?? undefined}
          alt=""
          className="size-full object-cover transition-transform duration-[var(--motion-slow)] ease-[var(--ease-smooth-out)] group-hover:scale-[1.045]"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <div
          className="flex size-full items-center justify-center"
          style={{
            background:
              "radial-gradient(120% 90% at 22% 8%, color-mix(in srgb, var(--color-fg) 9%, var(--color-raised)), var(--color-raised) 68%)",
          }}
        >
          <span
            className="font-display text-muted/80 tracking-wide italic"
            style={{ fontSize: size === "hero" ? 56 : size === "lg" ? 36 : 18 }}
          >
            {initials(album)}
          </span>
        </div>
      )}
      {/* 玻璃层:顶部高光 + 底部压暗,让任何封面都有统一的物理质感 */}
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
