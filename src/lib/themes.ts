/** 皮肤只换色彩、字体、材质与动效；信息结构（周 / 专辑 / 艺人 / 标签）不变。 */
import { syncMatrixRain } from "./matrix-rain";

export type ThemeId = "matrix" | "cyber-neon" | "grainy-blur" | "red-alert" | "custom";

/** 旧版存储里的主题 id 兑换:下线主题与 GRAIN / PictoChat 落到 Matrix,Cybercore 落到 Red Alert。 */
export function normalizeThemeId(id: unknown): ThemeId {
  if (id === "cybercore") return "red-alert";
  const valid: ThemeId[] = ["matrix", "cyber-neon", "grainy-blur", "red-alert", "custom"];
  return valid.includes(id as ThemeId) ? (id as ThemeId) : "matrix";
}

/** 自定义主题:用户设定底色、文字色、强调色、背景图与纹理。 */
export type CustomTheme = {
  bg: string;
  fg: string;
  accent: string;
  /** 背景图 URL,可留空。 */
  image: string;
  texture: "none" | "grain" | "grid" | "glow";
};

export const DEFAULT_CUSTOM: CustomTheme = {
  bg: "#101014",
  fg: "#ece9f1",
  accent: "#8ab4ff",
  image: "",
  texture: "grain",
};

export type ThemeDef = {
  id: ThemeId;
  label: string;
  note: string;
  /** 选择器里的三色小样。 */
  swatch: [string, string, string];
};

export const THEMES: ThemeDef[] = [
  { id: "matrix", label: "Matrix", note: "磷光绿 · 迪客帝国(默认)", swatch: ["#020703", "#8dffa3", "#00ff66"] },
  { id: "cyber-neon", label: "Cyber Neon", note: "霓虹夜城 · 探照灯扫掠", swatch: ["#0a0716", "#e8f4ff", "#00e5ff"] },
  { id: "grainy-blur", label: "Grainy Blur", note: "颗粒噪点 · 六团弥散光斑", swatch: ["#141019", "#f2ecf6", "#c9a0ff"] },
  { id: "red-alert", label: "Red Alert", note: "苏式警报红 · 雷达扫掠", swatch: ["#130604", "#f5e6dc", "#ff2b1f"] },
  { id: "custom", label: "自定义", note: "自选背景图 / 颜色 / 纹理", swatch: ["#101014", "#ece9f1", "#8ab4ff"] },
];

const CUSTOM_VARS = [
  "--color-bg",
  "--color-surface",
  "--color-raised",
  "--color-fg",
  "--color-muted",
  "--color-subtle",
  "--color-accent",
  "--color-accent-foreground",
  "--color-border",
  "--color-ring",
  "--shadow-border",
  "--shadow-border-hover",
  "--custom-bg-image",
] as const;

export function applyTheme(theme: ThemeId, custom?: CustomTheme) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const id = normalizeThemeId(theme);
  // Matrix 即基础样式,属性只作标记(供同步码读取),不承载任何覆盖规则
  el.setAttribute("data-theme", id);
  syncMatrixRain(id);

  const st = el.style;
  if (theme !== "custom") {
    for (const v of CUSTOM_VARS) st.removeProperty(v);
    el.removeAttribute("data-custom-texture");
    return;
  }
  const c = custom ?? DEFAULT_CUSTOM;
  const mix = (a: string, pct: number, b: string) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  st.setProperty("--color-bg", c.bg);
  st.setProperty("--color-fg", c.fg);
  st.setProperty("--color-surface", mix(c.fg, 6, c.bg));
  st.setProperty("--color-raised", mix(c.fg, 11, c.bg));
  st.setProperty("--color-muted", mix(c.fg, 64, c.bg));
  st.setProperty("--color-subtle", mix(c.fg, 44, c.bg));
  st.setProperty("--color-accent", c.accent);
  st.setProperty("--color-accent-foreground", mix(c.bg, 90, c.fg));
  st.setProperty("--color-border", mix(c.fg, 14, "transparent"));
  st.setProperty("--color-ring", c.accent);
  st.setProperty("--shadow-border", `0 0 0 1px ${mix(c.fg, 12, "transparent")}`);
  st.setProperty(
    "--shadow-border-hover",
    `0 0 0 1px ${mix(c.accent, 55, "transparent")}, 0 8px 28px ${mix(c.bg, 40, "transparent")}`,
  );
  st.setProperty("--custom-bg-image", c.image ? `url("${c.image.replace(/["\\]/g, "")}")` : "none");
  el.setAttribute("data-custom-texture", c.texture);
}
