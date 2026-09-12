/**
 * 列表 → Topsters 专辑墙。
 *
 * 数据结构照抄 topsters.org(Topsters 3)的图表格式,导出的 `.topster` 文件可以直接在
 * 站点的 Import / Export → Import chart data 里导入,之后网格大小、专辑位置、背景都在
 * 站点里继续调。站点的编码方式是:JSON → zlib(deflate) → 字节按逗号十进制串 → base64,
 * 三步都不能改,否则它的导入会直接报错。
 */

/** 站点网格上限 12×12,items 数组固定 144 格(与它的初始状态一致)。 */
export const TOPSTER_MAX_SIDE = 12;
export const TOPSTER_SLOTS = TOPSTER_MAX_SIDE * TOPSTER_MAX_SIDE;

/** 我们自己出图能到 20×20;超过 12×12 的部分站点吃不下,只能存 PNG。 */
export const WALL_MAX_SIDE = 20;
export const WALL_SLOTS = WALL_MAX_SIDE * WALL_MAX_SIDE;

export function topsterFits(cols: number, rows: number): boolean {
  return cols <= TOPSTER_MAX_SIDE && rows <= TOPSTER_MAX_SIDE;
}

export type TopsterItem = { title: string; creator?: string; coverURL: string };

export type TopsterChart = {
  title: string;
  items: (TopsterItem | null)[];
  size: { x: number; y: number };
  backgroundColor: string;
  backgroundType: "color" | "image";
  backgroundUrl: string;
  showNumbers: boolean;
  showTitles: boolean;
  gap: number;
  font: string;
  textColor: string;
  shadows: boolean;
  roundCorners: boolean;
};

export type WallAlbum = { artist: string; title: string; coverURL: string };

/**
 * 自适应排列:先追求接近正方形,再追求空格少;同分时取横向(列 ≥ 行,横着看更顺)。
 * 超过 maxSide² 张的部分放不下,由调用方截断并提示。
 */
export function nearSquareGrid(count: number, maxSide = WALL_MAX_SIDE): { cols: number; rows: number } {
  const side = Math.max(1, Math.min(Math.floor(maxSide) || 1, WALL_MAX_SIDE));
  const n = Math.max(1, Math.min(Math.floor(count) || 1, side * side));
  let best = { cols: side, rows: side };
  let bestScore = Number.POSITIVE_INFINITY;
  for (let cols = 1; cols <= side; cols++) {
    const rows = Math.ceil(n / cols);
    if (rows > side) continue;
    const ratio = Math.max(cols, rows) / Math.min(cols, rows);
    const score = (ratio - 1) * 100 + (cols * rows - n);
    const better = score < bestScore - 1e-9;
    const tie = Math.abs(score - bestScore) < 1e-9 && cols >= rows;
    if (better || tie) {
      best = { cols, rows };
      bestScore = score;
    }
  }
  return best;
}

/**
 * 行优先铺进 144 格:前 cols 格是第一行,站点按 size.x 切行,顺序与列表一致。
 * 只接受 12×12 以内的网格 —— 更大的墙站点读不了,调用方该改走 PNG。
 */
export function buildTopsterChart(opts: {
  title: string;
  albums: WallAlbum[];
  cols: number;
  rows: number;
  background: string;
  gap: number;
  showTitles: boolean;
  showNumbers: boolean;
}): TopsterChart {
  if (!topsterFits(opts.cols, opts.rows)) throw new Error("grid exceeds the 12×12 Topsters limit");
  const items: (TopsterItem | null)[] = Array.from({ length: TOPSTER_SLOTS }, () => null);
  opts.albums.slice(0, Math.min(opts.cols * opts.rows, TOPSTER_SLOTS)).forEach((a, i) => {
    items[i] = {
      title: a.title,
      ...(a.artist ? { creator: a.artist } : {}),
      coverURL: a.coverURL,
    };
  });
  return {
    title: opts.title,
    items,
    size: { x: opts.cols, y: opts.rows },
    backgroundColor: opts.background,
    backgroundType: "color",
    backgroundUrl: "",
    showNumbers: opts.showNumbers,
    showTitles: opts.showTitles,
    gap: opts.gap,
    font: "monospace",
    textColor: "#ffffff",
    shadows: true,
    roundCorners: false,
  };
}

/** 浏览器里 zlib 压缩(站点用 DecompressionStream("deflate") 解,格式必须一致)。 */
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function canEncodeTopster(): boolean {
  return typeof CompressionStream !== "undefined";
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * 生成站点能吃的导入数据。外层是 `{ [uuid]: { timestamp, data: chart } }`,
 * 编码成 base64(逗号分隔的十进制字节串)——站点导入时按 `atob(...).split(",")` 还原。
 */
export async function encodeTopsterData(chart: TopsterChart, timestamp = Date.now()): Promise<string> {
  const payload = { [uuid()]: { timestamp, data: chart } };
  const deflated = await deflate(new TextEncoder().encode(JSON.stringify(payload)));
  return btoa(Array.from(deflated).join(","));
}

/** 文件名:站点用 `.topster` 后缀,顺手去掉不能进文件名的字符。 */
export function topsterFileName(title: string): string {
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").slice(0, 60);
  return `${base || "album-wall"}.topster`;
}
