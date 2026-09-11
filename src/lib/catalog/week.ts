/** Music-industry "New Music Friday" — ISO date helpers. */

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIso(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1));
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Friday on or before `from` (UTC). */
export function fridayOnOrBefore(from = new Date()): string {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const dow = d.getUTCDay(); // 0 Sun .. 5 Fri
  const delta = (dow - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - delta);
  return toIso(d);
}

export function fridayOnOrAfter(from = new Date()): string {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const dow = d.getUTCDay();
  const delta = (5 - dow + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return toIso(d);
}

export function weekBounds(friday: string): { start: string; end: string } {
  return { start: friday, end: addDays(friday, 6) };
}

export function inWeek(date: string, friday: string): boolean {
  const { start, end } = weekBounds(friday);
  return date >= start && date <= end;
}

export function formatFridayZh(iso: string): string {
  const d = parseIso(iso);
  const months = [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月",
  ];
  return `${d.getUTCFullYear()}年${months[d.getUTCMonth()]}${d.getUTCDate()}日 周五`;
}

export function formatShort(iso: string): string {
  const d = parseIso(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function daysUntil(iso: string, from = new Date()): number {
  const target = parseIso(iso).getTime();
  const now = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((target - now) / 86400000);
}
