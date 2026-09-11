/**
 * 电影式数字雨(Matrix 主题专属):canvas 逐帧绘制。
 * 首帧同步铺满并淡入,避免主题底先空一拍再突然跳雨。
 */

/** 片假名 + 数字 + 符号保持电影雨底色;略超四成抽成乐谱 / 和声符号(BMP,等宽可画)。 */
const BASE_GLYPHS = "ﾅｱﾜｦﾊﾗﾝｼｿｷﾎｳﾔﾂﾈﾒｹﾙﾎﾐ0123456789=*+<>:¥";
const MUSIC_GLYPHS = "♪♫♩♬♯♭♮#bnΔø°";
const MUSIC_RATIO = 0.42;

function pickGlyphCode(): number {
  const src = Math.random() < MUSIC_RATIO ? MUSIC_GLYPHS : BASE_GLYPHS;
  return src.charCodeAt(Math.floor(Math.random() * src.length));
}

/**
 * 常见开源数字雨(Rezmason / 经典 canvas 雨)的排法:
 * 列距≈字号、行距略小于字号;字形钉在格上,雨头只比尾迹更亮,不再另画光斑。
 * 尾迹收在一列里,中间留黑,才是往下落的雨,不是整屏字墙。
 */
const FONT = 15;
const COL = 16;
const ROW = 13;
const FPS_MIN_MS = 16;
const TARGET_OPACITY = "0.62";

let canvas: HTMLCanvasElement | null = null;
let raf = 0;
let detach: (() => void) | null = null;

export function stopMatrixRain(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  detach?.();
  detach = null;
  canvas?.remove();
  canvas = null;
  document.documentElement.classList.remove("rain-live");
}

export function startMatrixRain(): void {
  if (typeof window === "undefined" || canvas) return;
  const host = document.getElementById("bgfx");
  if (!host) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  canvas = document.createElement("canvas");
  canvas.className = "rain-canvas";
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 820ms cubic-bezier(0.22, 1, 0.36, 1);";
  host.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) {
    stopMatrixRain();
    return;
  }

  let cols = 0;
  let rows = 0;
  let heads: Float32Array;
  let speeds: Float32Array;
  let lens: Float32Array;
  let grid: Uint16Array;

  const resetColumn = (c: number, initial: boolean) => {
    speeds[c] = 5.4 + Math.random() * 10.5;
    lens[c] = 16 + Math.floor(Math.random() * 20);
    heads[c] = initial ? Math.random() * (rows + 8) : -Math.random() * rows * 0.22;
  };

  const layout = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas!.width = Math.round(w * dpr);
    canvas!.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${FONT}px ui-monospace, "IBM Plex Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    cols = Math.ceil(w / COL);
    rows = Math.ceil(h / ROW) + 2;
    heads = new Float32Array(cols);
    speeds = new Float32Array(cols);
    lens = new Float32Array(cols);
    grid = new Uint16Array(cols * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = pickGlyphCode();
    for (let c = 0; c < cols; c++) resetColumn(c, true);
  };

  const draw = (step: number, churnOn: boolean) => {
    if (churnOn) {
      const churn = Math.min(720, Math.ceil(grid.length * 0.022));
      for (let i = 0; i < churn; i++) {
        grid[Math.floor(Math.random() * grid.length)] = pickGlyphCode();
      }
    }
    ctx.clearRect(0, 0, canvas!.width, canvas!.height);
    for (let c = 0; c < cols; c++) {
      heads[c] += speeds[c] * step;
      const headPos = heads[c];
      const len = lens[c];
      if (headPos - len > rows) {
        resetColumn(c, false);
        continue;
      }
      const x = c * COL + COL / 2;
      const headRow = Math.floor(headPos);
      for (let i = 0; i < len; i++) {
        const row = headRow - i;
        if (row < 0 || row >= rows) continue;
        const g = String.fromCharCode(grid[c * rows + row]);
        const y = row * ROW + ROW / 2;
        const persist = (1 - i / len) ** 0.48;
        if (i === 0) {
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = "#e8fff0";
        } else if (i < 8) {
          ctx.globalAlpha = 0.82 * persist;
          ctx.fillStyle = i < 4 ? "#9dffc0" : "#22ff72";
        } else {
          ctx.globalAlpha = persist * 0.68;
          ctx.fillStyle = "#00ff66";
        }
        ctx.fillText(g, x, y);
      }
    }
    ctx.globalAlpha = 1;
  };

  layout();
  draw(0, false);
  requestAnimationFrame(() => {
    if (!canvas) return;
    canvas.style.opacity = TARGET_OPACITY;
    document.documentElement.classList.add("rain-live");
  });

  const onResize = () => {
    layout();
    draw(0, false);
  };
  window.addEventListener("resize", onResize);
  detach = () => window.removeEventListener("resize", onResize);

  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = now - last;
    if (dt < FPS_MIN_MS) return;
    last = now;
    draw(Math.min(dt, 34) / 1000, true);
  };
  raf = requestAnimationFrame(frame);
}

/** 按当前主题开或停(matrix 独享;其他主题移除画布)。 */
export function syncMatrixRain(themeId: string): void {
  if (themeId === "matrix") startMatrixRain();
  else stopMatrixRain();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => stopMatrixRain());
}
