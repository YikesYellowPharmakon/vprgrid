/**
 * 列表 → 专辑墙面板。
 *
 * 排列默认自适应到最接近正方形,列数可手动微调(行数跟着算),最大 20×20。三个出口:
 * 直接下载 PNG(画布合成,靠同源封面代理避免跨域污染)、下载 `.topster` 导入文件、
 * 复制同一份导入数据文本。导入 topsters.org 后,网格、位置、背景都能在站点继续调 ——
 * 但站点自己只有 12×12,更大的墙只出 PNG(见 topster.ts)。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, ImageDown, Minus, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { proxiedCover } from "@/lib/catalog/links";
import {
  buildTopsterChart,
  canEncodeTopster,
  encodeTopsterData,
  nearSquareGrid,
  topsterFileName,
  topsterFits,
  TOPSTER_MAX_SIDE,
  WALL_MAX_SIDE,
  WALL_SLOTS,
  type WallAlbum,
} from "@/lib/catalog/topster";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent } from "./ui/sheet";
import { Switch } from "./ui/switch";

export type WallSource = { artist: string; title: string; coverUrl?: string | null; coverUrlLg?: string | null };

const DEFAULTS = { background: "#0a0a0a", gap: 16 };
/** 画布单格边长上限:12 列时整幅约 3.6k 宽,够贴社交平台又不至于爆内存。 */
const CELL = 300;
/** 更大的墙按长边缩格:20×20 也控制在约 4.8k 见方,不然画布内存直接翻倍。 */
const CANVAS_MAX = 4800;

function cellSize(side: number, gap: number): number {
  return Math.max(120, Math.min(CELL, Math.floor((CANVAS_MAX - (side + 1) * gap) / side)));
}

function initials(a: WallAlbum): string {
  return `${a.artist.trim()[0] ?? "G"}${a.title.trim()[0] ?? "R"}`.toUpperCase();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 400 张一次全发会把浏览器的请求队列堵死,分批下更快也更稳。 */
async function loadImages(srcs: string[], limit = 16): Promise<(HTMLImageElement | null)[]> {
  const out: (HTMLImageElement | null)[] = Array.from({ length: srcs.length }, () => null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, srcs.length) }, async () => {
      for (let i = next++; i < srcs.length; i = next++) out[i] = await loadImage(srcs[i]);
    }),
  );
  return out;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function TopsterSheet({
  open,
  onOpenChange,
  listName,
  albums,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listName: string;
  albums: WallSource[];
}) {
  const t = useT();
  const [title, setTitle] = useState(listName);
  const [colsOverride, setCols] = useState<number | null>(null);
  const [background, setBackground] = useState(DEFAULTS.background);
  const [gap, setGap] = useState(DEFAULTS.gap);
  const [showTitles, setShowTitles] = useState(false);
  const [busy, setBusy] = useState<"png" | "file" | "copy" | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (open) setTitle(listName);
  }, [open, listName]);

  /** 只有带封面的专辑能上墙:缺图的格子在 Topsters 里就是个破图。 */
  const wall = useMemo<WallAlbum[]>(
    () =>
      albums
        .map((a) => ({ artist: a.artist, title: a.title, coverURL: (a.coverUrlLg || a.coverUrl || "").trim() }))
        .filter((a) => a.coverURL.startsWith("http")),
    [albums],
  );
  const skipped = albums.length - wall.length;
  const overflow = Math.max(0, wall.length - WALL_SLOTS);
  const used = wall.slice(0, WALL_SLOTS);

  const auto = nearSquareGrid(used.length);
  const cols = Math.min(colsOverride ?? auto.cols, WALL_MAX_SIDE);
  const rows = Math.min(Math.ceil(used.length / cols) || 1, WALL_MAX_SIDE);
  const blanks = cols * rows - used.length;
  /** 站点只有 12×12:更大的墙还能出 PNG,导入数据这条路就断了。 */
  const fits = topsterFits(cols, rows);

  const chart = () =>
    buildTopsterChart({
      title: title.trim(),
      albums: used,
      cols,
      rows,
      background,
      gap,
      showTitles,
      showNumbers: false,
    });

  async function downloadPng() {
    setBusy("png");
    try {
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      const pad = gap;
      const cell = cellSize(Math.max(cols, rows), pad);
      canvas.width = cols * cell + (cols + 1) * pad;
      canvas.height = rows * cell + (rows + 1) * pad;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // 代理成同源图片再画,否则画布被跨域污染,toBlob 会直接抛错
      const imgs = await loadImages(used.map((a) => proxiedCover(a.coverURL, { force: true }) ?? a.coverURL));
      used.forEach((album, i) => {
        const x = pad + (i % cols) * (cell + pad);
        const y = pad + Math.floor(i / cols) * (cell + pad);
        const img = imgs[i];
        if (img) {
          ctx.drawImage(img, x, y, cell, cell);
          return;
        }
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(x, y, cell, cell);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = `italic ${Math.round(cell / 3.4)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initials(album), x + cell / 2, y + cell / 2);
      });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("toBlob failed");
      saveBlob(blob, `${topsterFileName(title || listName).replace(/\.topster$/, "")}.png`);
      toast.success(t.wallPngDone);
    } catch {
      toast.error(t.wallPngFail);
    } finally {
      setBusy(null);
    }
  }

  async function downloadFile() {
    setBusy("file");
    try {
      const data = await encodeTopsterData(chart());
      saveBlob(new Blob([data]), topsterFileName(title || listName));
      toast.success(t.wallFileDone);
    } catch {
      toast.error(t.wallDataFail);
    } finally {
      setBusy(null);
    }
  }

  async function copyData() {
    setBusy("copy");
    try {
      const data = await encodeTopsterData(chart());
      await navigator.clipboard.writeText(data);
      toast.success(t.wallCopyDone);
    } catch {
      toast.error(t.wallDataFail);
    } finally {
      setBusy(null);
    }
  }

  const encodable = canEncodeTopster();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t.wallTitle} className="max-w-2xl">
        <ScrollArea className="h-full">
          <div className="px-5 py-8 sm:px-7">
            <h2 className="font-display text-2xl">{t.wallTitle}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{t.wallDesc}</p>

            <p className="mt-4 text-xs text-subtle">
              {t.wallGridInfo(cols, rows, used.length)}
              {blanks > 0 ? ` · ${t.wallBlanks(blanks)}` : ""}
              {skipped > 0 ? ` · ${t.wallSkipped(skipped)}` : ""}
              {overflow > 0 ? ` · ${t.wallOverflow(overflow)}` : ""}
            </p>

            {used.length === 0 ? (
              <p className="mt-6 text-sm text-danger">{t.wallEmpty}</p>
            ) : (
              <div
                className="mt-4 grid w-full overflow-hidden rounded-md shadow-[var(--shadow-border)]"
                style={{
                  background,
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gap: `${Math.max(2, Math.round(gap / 3))}px`,
                  padding: `${Math.max(2, Math.round(gap / 3))}px`,
                }}
              >
                {Array.from({ length: cols * rows }, (_, i) => {
                  const a = used[i];
                  return (
                    <div key={i} className="aspect-square overflow-hidden bg-fg/5">
                      {a ? (
                        <img
                          src={proxiedCover(a.coverURL) ?? a.coverURL}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="size-full object-cover"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 space-y-2">
              <label className="flex items-center justify-between gap-3 rounded-md bg-raised px-3 py-2.5 shadow-[var(--shadow-border)]">
                <span className="shrink-0 text-sm text-muted">{t.wallChartTitle}</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 60))}
                  placeholder={t.wallChartTitlePh}
                  className="min-w-0 flex-1 bg-transparent text-right text-sm outline-none placeholder:text-subtle"
                />
              </label>

              <div className="flex items-center justify-between gap-3 rounded-md bg-raised px-3 py-2.5 shadow-[var(--shadow-border)]">
                <span className="text-sm text-muted">{t.wallCols}</span>
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={t.wallColsLess}
                    disabled={cols <= 1}
                    onClick={() => setCols(Math.max(1, cols - 1))}
                    className="flex size-8 items-center justify-center rounded-sm text-muted hover:bg-surface hover:text-fg disabled:opacity-40"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-14 text-center text-sm tabular-nums">
                    {cols} × {rows}
                  </span>
                  <button
                    type="button"
                    aria-label={t.wallColsMore}
                    disabled={cols >= WALL_MAX_SIDE || Math.ceil(used.length / (cols + 1)) < 1}
                    onClick={() => setCols(Math.min(WALL_MAX_SIDE, cols + 1))}
                    className="flex size-8 items-center justify-center rounded-sm text-muted hover:bg-surface hover:text-fg disabled:opacity-40"
                  >
                    <Plus className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCols(null)}
                    className={cn(
                      "ml-1 inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs",
                      colsOverride === null ? "text-subtle" : "text-muted hover:bg-surface hover:text-fg",
                    )}
                  >
                    <RotateCcw className="size-3" />
                    {t.wallAuto}
                  </button>
                </span>
              </div>

              <label className="flex items-center justify-between gap-3 rounded-md bg-raised px-3 py-2.5 shadow-[var(--shadow-border)]">
                <span className="text-sm text-muted">{t.wallBackground}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-subtle tabular-nums uppercase">{background}</span>
                  <input
                    type="color"
                    value={background}
                    onChange={(e) => setBackground(e.target.value)}
                    aria-label={t.wallBackground}
                    className="size-8 shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0"
                  />
                </span>
              </label>

              <label className="flex items-center justify-between gap-3 rounded-md bg-raised px-3 py-2.5 shadow-[var(--shadow-border)]">
                <span className="text-sm text-muted">{t.wallGap}</span>
                <span className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={48}
                    step={2}
                    value={gap}
                    onChange={(e) => setGap(Number(e.target.value))}
                    aria-label={t.wallGap}
                    className="w-36 accent-accent"
                  />
                  <span className="w-8 text-right text-xs text-subtle tabular-nums">{gap}</span>
                </span>
              </label>

              <label className="flex items-center justify-between gap-3 rounded-md bg-raised px-3 py-2.5 shadow-[var(--shadow-border)]">
                <span className="min-w-0">
                  <span className="block text-sm text-muted">{t.wallShowTitles}</span>
                  <span className="mt-0.5 block text-xs text-subtle">{t.wallShowTitlesHint}</span>
                </span>
                <Switch checked={showTitles} onCheckedChange={setShowTitles} aria-label={t.wallShowTitles} />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={downloadPng} disabled={used.length === 0 || busy !== null}>
                <ImageDown className="size-4" />
                {busy === "png" ? t.wallWorking : t.wallPng}
              </Button>
              <Button
                variant="secondary"
                onClick={downloadFile}
                disabled={used.length === 0 || !encodable || !fits || busy !== null}
              >
                <Download className="size-4" />
                {busy === "file" ? t.wallWorking : t.wallFile}
              </Button>
              <Button
                variant="secondary"
                onClick={copyData}
                disabled={used.length === 0 || !encodable || !fits || busy !== null}
              >
                <Copy className="size-4" />
                {busy === "copy" ? t.wallWorking : t.wallCopy}
              </Button>
            </div>

            {!fits ? <p className="mt-3 text-xs leading-relaxed text-muted">{t.wallTooBig(TOPSTER_MAX_SIDE)}</p> : null}

            <p className="mt-4 text-xs leading-relaxed text-subtle">
              {t.wallHowTo}{" "}
              <a
                href="https://topsters.org/"
                target="_blank"
                rel="noreferrer noopener"
                className="text-muted underline decoration-dotted underline-offset-2 hover:text-fg"
              >
                topsters.org
              </a>
            </p>
            {!encodable ? <p className="mt-2 text-xs text-danger">{t.wallNoEncode}</p> : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
