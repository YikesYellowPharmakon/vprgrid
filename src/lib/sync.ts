/**
 * 浏览器插件同步:把口味 / 参考池 / 当前主题 / 过滤开关 / 当周墙打成一份 JSON。
 * 两条通道共用同一个构建器:
 *   1) 直连同步(主路径)—— 应用把负载 POST 到 /api/sync,插件打开时自动 GET,
 *      全程无需剪贴板;
 *   2) 同步码(备份路径)—— 复制同一份 JSON 手动粘贴进插件设置。
 */
import { mergeSourceEntries, sourceEntries, type RefSource } from "./catalog/sources";

export type SyncWeights = Record<string, number>;

export type SyncFilters = {
  strictTaste: boolean;
  skipThinRatings: boolean;
  skipRoughCovers: boolean;
  skipAssemblyLine: boolean;
  types: Array<"Album" | "EP">;
  hidden: string[];
};

export type SyncWallItem = {
  id?: string;
  artist: string;
  title: string;
  date: string;
  pic: string | null;
  gold: boolean;
};

export type SyncExtra = {
  filters?: SyncFilters;
  wall?: {
    week: string;
    grain?: "week" | "month";
    start?: string;
    end?: string;
    items: SyncWallItem[];
    at?: string;
  };
};

function collectArtists(refSources: RefSource[]): string[] {
  const set = new Set<string>();
  for (const s of refSources) {
    if (!s.enabled) continue;
    for (const e of sourceEntries(s)) set.add(e.artist.trim().toLowerCase());
    if (s.kind === "artist" && s.url) set.add(s.url.trim().toLowerCase());
  }
  return [...set];
}

/** 只能在浏览器里调用(要读 html 上的实时主题变量与背景)。 */
export function buildSyncCode(
  refSources: RefSource[],
  taste: string[],
  weights: SyncWeights,
  extra?: SyncExtra,
): string {
  const entries = mergeSourceEntries(refSources).map((e) => ({
    artist: e.artist,
    title: e.title,
    date: e.date,
    pic: e.pic,
  }));
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const theme = {
    id: document.documentElement.getAttribute("data-theme") ?? "matrix",
    bg: v("--color-bg"),
    surface: v("--color-surface"),
    raised: v("--color-raised"),
    fg: v("--color-fg"),
    muted: v("--color-muted"),
    subtle: v("--color-subtle"),
    accent: v("--color-accent"),
    border: v("--color-border"),
    bodyBg: {
      image: cs.backgroundImage,
      size: cs.backgroundSize,
      position: cs.backgroundPosition,
      repeat: cs.backgroundRepeat,
      blend: cs.backgroundBlendMode,
      color: cs.backgroundColor,
    },
  };
  return JSON.stringify({
    v: 4,
    taste,
    weights,
    theme,
    entries,
    artists: collectArtists(refSources),
    ...(extra?.filters ? { filters: extra.filters } : {}),
    ...(extra?.wall ? { wall: { ...extra.wall, at: extra.wall.at ?? new Date().toISOString() } } : {}),
  });
}

let lastPushed = "";

/** 把最新负载推给应用服务器,插件端免剪贴板直取。失败静默(纯增强路径)。 */
export async function pushSyncCode(code: string): Promise<void> {
  if (code === lastPushed) return;
  lastPushed = code;
  try {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: code,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // 服务器不在 / 网络异常:同步码备份路径仍然可用
  }
}

/** 剪贴板写入,带老式 execCommand 兜底(iframe / 未授权环境下 clipboard API 会被拒)。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
