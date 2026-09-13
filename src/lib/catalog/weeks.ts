/** 自然周（ISO 周一至周日）分组：2026 每周新专时间轴。 */
import { addDays, parseIso, toIso } from "./week";

/** 特殊桶：发行日期早于 2026-W01 的参考补遗。 */
export const EARLIER_KEY = "earlier";

/** 2026 第 1 个 ISO 周的周一。 */
export const FIRST_WEEK_2026 = "2025-12-29";

/** date 所在自然周的周一（ISO）。 */
export function mondayOf(dateIso: string): string {
  const d = parseIso(dateIso);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const delta = (dow + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - delta);
  return toIso(d);
}

export function weekKeyOf(dateIso: string): string {
  if (dateIso < FIRST_WEEK_2026) return EARLIER_KEY;
  return mondayOf(dateIso);
}

export function sundayOf(mondayIso: string): string {
  return addDays(mondayIso, 6);
}

export function fridayOfWeek(mondayIso: string): string {
  return addDays(mondayIso, 4);
}

/** ISO 周号（以该周周四所在年为准）。 */
export function isoWeekNumber(mondayIso: string): { year: number; week: number } {
  const thursday = parseIso(addDays(mondayIso, 3));
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Monday = parseIso(mondayOf(toIso(jan4)));
  const diff = parseIso(mondayIso).getTime() - jan4Monday.getTime();
  return { year, week: Math.round(diff / (7 * 86400000)) + 1 };
}

/** 时间轴：更早补遗 + 2026-W01 至今（含下一周）。 */
export function listWeekKeys(today = new Date()): string[] {
  const currentMonday = mondayOf(toIso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))));
  const keys: string[] = [EARLIER_KEY];
  let m = FIRST_WEEK_2026;
  const last = addDays(currentMonday, 7);
  while (m <= last) {
    keys.push(m);
    m = addDays(m, 7);
  }
  return keys;
}

export function formatWeekZh(key: string): { title: string; range: string } {
  return formatWeek(key, "zh");
}

/** 周标签(界面语言可切换;range 为月/日,两种语言通用)。 */
export function formatWeek(key: string, lang: "zh" | "en"): { title: string; range: string } {
  if (key === EARLIER_KEY) {
    return lang === "zh"
      ? { title: "更早收录", range: "2026 之前 · 歌单补遗" }
      : { title: "Earlier", range: "pre-2026 · Addenda" };
  }
  const { year, week } = isoWeekNumber(key);
  const start = parseIso(key);
  const end = parseIso(sundayOf(key));
  const range = `${start.getUTCMonth() + 1}/${start.getUTCDate()} – ${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
  return { title: lang === "zh" ? `${year} 第 ${week} 周` : `${year} · Week ${week}`, range };
}

export function inNaturalWeek(dateIso: string, key: string): boolean {
  if (key === EARLIER_KEY) return dateIso < FIRST_WEEK_2026;
  return dateIso >= key && dateIso <= sundayOf(key);
}

/** 扫描池相对选定时期终点往回看的周数(含当期所在周)。 */
export const SCAN_WEEKS = 10;

/** 时间轴最多看到当前周之后约一年,挡住参考池里 2076 这类离谱未来年份。 */
export const TIMELINE_AHEAD_WEEKS = 52;

export function timelineCap(today = new Date()): { lastMonday: string; lastYm: string } {
  const currentMonday = mondayOf(
    toIso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))),
  );
  const lastMonday = addDays(currentMonday, TIMELINE_AHEAD_WEEKS * 7);
  return { lastMonday, lastYm: ymOf(lastMonday) };
}

export type PeriodMode = "week" | "month" | "weeks" | "months";

export type Period =
  | { mode: "week"; key: string }
  | { mode: "month"; ym: string }
  | { mode: "weeks"; from: string; to: string }
  | { mode: "months"; from: string; to: string };

export function ymOf(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m ?? 1) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthStart(ym: string): string {
  return `${ym}-01`;
}

export function monthEnd(ym: string): string {
  return toIso(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)));
}

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 时间轴月份:2026-01 至当前月的下一月。 */
export function listMonthKeys(today = new Date()): string[] {
  const now = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const last = addMonths(ymOf(toIso(now)), 1);
  const keys: string[] = [];
  let m = "2026-01";
  while (m <= last) {
    keys.push(m);
    m = addMonths(m, 1);
  }
  return keys;
}

export function formatMonth(ym: string, lang: "zh" | "en"): { title: string; range: string } {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const end = parseIso(monthEnd(ym));
  const range = `${month}/1 – ${month}/${end.getUTCDate()}`;
  return {
    title: lang === "zh" ? `${year} 年 ${month} 月` : `${EN_MONTHS[month - 1]} ${year}`,
    range,
  };
}

function orderedPair(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

/** 墙上展示的闭区间;「更早收录」没有日期窗。 */
export function periodBounds(period: Period): { start: string; end: string } | null {
  if (period.mode === "week") {
    if (period.key === EARLIER_KEY) return null;
    return { start: period.key, end: sundayOf(period.key) };
  }
  if (period.mode === "month") {
    return { start: monthStart(period.ym), end: monthEnd(period.ym) };
  }
  if (period.mode === "weeks") {
    const [from, to] = orderedPair(period.from, period.to);
    return { start: from, end: sundayOf(to) };
  }
  const [from, to] = orderedPair(period.from, period.to);
  return { start: monthStart(from), end: monthEnd(to) };
}

/**
 * 扫描窗:以展示期终点所在周为锚,往回共 SCAN_WEEKS 周;
 * 若展示期本身更长(连续多月),则覆盖整段展示期。
 */
export function scanWindow(displayStart: string, displayEnd: string): { start: string; end: string } {
  const endMonday = mondayOf(displayEnd);
  const tenStart = addDays(endMonday, -(SCAN_WEEKS - 1) * 7);
  return { start: displayStart < tenStart ? displayStart : tenStart, end: displayEnd };
}

export function formatPeriod(period: Period, lang: "zh" | "en"): { title: string; range: string } {
  if (period.mode === "week") return formatWeek(period.key, lang);
  if (period.mode === "month") return formatMonth(period.ym, lang);
  if (period.mode === "weeks") {
    const [from, to] = orderedPair(period.from, period.to);
    if (from === to) return formatWeek(from, lang);
    const a = formatWeek(from, lang);
    const b = formatWeek(to, lang);
    const start = parseIso(from);
    const end = parseIso(sundayOf(to));
    const range = `${start.getUTCMonth() + 1}/${start.getUTCDate()} – ${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
    return lang === "zh"
      ? { title: `${a.title} – ${b.title}`, range }
      : { title: `${a.title} – ${b.title}`, range };
  }
  const [from, to] = orderedPair(period.from, period.to);
  if (from === to) return formatMonth(from, lang);
  const a = formatMonth(from, lang);
  const b = formatMonth(to, lang);
  const start = parseIso(monthStart(from));
  const end = parseIso(monthEnd(to));
  const range = `${start.getUTCMonth() + 1}/${start.getUTCDate()} – ${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
  return { title: `${a.title} – ${b.title}`, range };
}

export function dateInBounds(dateIso: string, start: string, end: string): boolean {
  return dateIso >= start && dateIso <= end;
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function weekDiff(fromMonday: string, toMonday: string): number {
  return Math.round((parseIso(toMonday).getTime() - parseIso(fromMonday).getTime()) / (7 * 86400000));
}

/** 把连续周或连续月整体平移一格,撞墙时保持跨度。 */
export function shiftSpan(from: string, to: string, dir: 1 | -1, min: string, max: string): { from: string; to: string } {
  const [a, b] = orderedPair(from, to);
  const monthly = a.length === 7;
  const nf0 = monthly ? addMonths(a, dir) : addDays(a, dir * 7);
  const nt0 = monthly ? addMonths(b, dir) : addDays(b, dir * 7);
  if (nf0 >= min && nt0 <= max) return { from: nf0, to: nt0 };
  const span = monthly ? monthDiff(a, b) : weekDiff(a, b);
  if (dir < 0) {
    const from2 = min;
    const to2 = monthly ? addMonths(min, span) : addDays(min, span * 7);
    return { from: from2, to: to2 > max ? max : to2 };
  }
  const to2 = max;
  const from2 = monthly ? addMonths(max, -span) : addDays(max, -span * 7);
  return { from: from2 < min ? min : from2, to: to2 };
}
