/**
 * 参考条目的发行日:缺真实日期时不得用「今天 / 加入歌单日」顶替,
 * 否则万级歌单会整批涌进当周亲选墙。
 */
import type { GoldEntry } from "./gold";

/** 占位日,weekKeyOf 会归入「更早收录」。 */
export const UNKNOWN_RELEASE_DATE = "1900-01-01";

export function isUnknownReleaseDate(date?: string | null): boolean {
  if (!date) return true;
  return date <= "1910-12-31" || date.startsWith("1970-01-01");
}

export function displayReleaseDate(date: string | undefined, unknownLabel: string): string {
  return isUnknownReleaseDate(date) ? unknownLabel : (date ?? unknownLabel);
}

/** looseDate 把「只有年」补成 YYYY-07-01、「只有年月」补成 YYYY-MM-15。 */
export function isYearOrMonthPad(date: string): boolean {
  return /^\d{4}-07-01$/.test(date) || /^\d{4}-\d{2}-15$/.test(date);
}

/** 网易云 publishTime 为毫秒;0 / 过小 / 过远的未来都当无效。 */
export function isPlausiblePublishMs(ms?: number | null): ms is number {
  if (ms == null || ms === 0 || !Number.isFinite(ms)) return false;
  const min = Date.UTC(1950, 0, 1);
  const max = Date.now() + 400 * 86400000;
  return ms >= min && ms <= max;
}

export function yearFromTitle(title: string): string | null {
  const m = title.match(/\(((?:19|20)\d{2})\)\s*$/) || title.match(/(?:^|\s)((?:19|20)\d{2})\s*$/);
  return m ? `${m[1]}-07-01` : null;
}

function recentIsoDays(now: Date, days: number): Set<string> {
  const out = new Set<string>();
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = 0; i < days; i++) {
    out.add(new Date(t - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * 把「导入回退日」从当周墙拿掉:近似日期扎堆、或近几天的 Date.now() 回退。
 * 真实发行日(未标 dateApprox)不受影响,除非同一天堆了 40+ 张且落在近几天。
 */
export function neutralizeGuessedDates(entries: GoldEntry[], now = new Date()): GoldEntry[] {
  if (!entries.length) return entries;
  const recent = recentIsoDays(now, 10);
  const approxCount = new Map<string, number>();
  const allCount = new Map<string, number>();
  for (const e of entries) {
    if (!e.date || isYearOrMonthPad(e.date) || isUnknownReleaseDate(e.date)) continue;
    allCount.set(e.date, (allCount.get(e.date) ?? 0) + 1);
    if (e.dateApprox) approxCount.set(e.date, (approxCount.get(e.date) ?? 0) + 1);
  }

  const approxDump = new Set<string>();
  for (const [d, n] of approxCount) {
    if (n >= 8 || recent.has(d)) approxDump.add(d);
  }
  const exactDump = new Set<string>();
  for (const [d, n] of allCount) {
    if (n >= 80 || (n >= 40 && recent.has(d))) exactDump.add(d);
  }

  let changed = false;
  const next = entries.map((e) => {
    const dump = (e.dateApprox && approxDump.has(e.date)) || exactDump.has(e.date);
    if (!dump) return e;
    if (e.dateUnknown && e.date === UNKNOWN_RELEASE_DATE) return e;
    changed = true;
    return { ...e, date: UNKNOWN_RELEASE_DATE, dateApprox: true, dateUnknown: true };
  });
  return changed ? next : entries;
}

export function dateFromPublishMs(ms?: number | null): string | null {
  if (!isPlausiblePublishMs(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

export function inferEntryDate(
  title: string,
  publishMs?: number | null,
): { date: string; dateApprox?: boolean; dateUnknown?: boolean } {
  const exact = dateFromPublishMs(publishMs);
  if (exact) return { date: exact };
  const year = yearFromTitle(title);
  if (year) return { date: year, dateApprox: true };
  return { date: UNKNOWN_RELEASE_DATE, dateApprox: true, dateUnknown: true };
}
