import type { ScoredAlbum, WeekCatalog } from "./catalog/types";
import { formatFridayZh } from "./catalog/week";

function saveBlob(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportJson(catalog: WeekCatalog, albums: ScoredAlbum[]) {
  const payload = {
    name: "VprGrid.SYS",
    friday: catalog.friday,
    week: `${catalog.weekStart} → ${catalog.weekEnd}`,
    fetchedAt: catalog.fetchedAt,
    source: catalog.sourceLabel,
    albums: albums.map((a) => ({
      rank: albums.indexOf(a) + 1,
      artist: a.artist,
      title: a.title,
      date: a.date,
      type: a.type,
      tags: a.tags,
      genres: a.inferredGenres,
      score: a.scores.composite,
      breakdown: a.scores,
      links: a.links,
      listen: a.listen,
    })),
  };
  saveBlob(`grain-${catalog.friday}.json`, "application/json", JSON.stringify(payload, null, 2));
}

export function exportCsv(catalog: WeekCatalog, albums: ScoredAlbum[]) {
  const header = ["rank", "artist", "title", "date", "type", "score", "taste", "artist_score", "rating", "cover", "genres", "musicbrainz", "apple", "spotify", "netease", "bandcamp"];
  const rows = albums.map((a, i) =>
    [
      i + 1,
      csv(a.artist),
      csv(a.title),
      a.date,
      a.type,
      a.scores.composite,
      a.scores.taste,
      a.scores.artist,
      a.scores.rating,
      a.scores.cover,
      csv(a.inferredGenres.join("|")),
      a.links.musicbrainz,
      a.listen.apple ?? "",
      a.listen.spotify ?? "",
      a.listen.netease ?? "",
      a.listen.bandcamp ?? "",
    ].join(","),
  );
  saveBlob(`grain-${catalog.friday}.csv`, "text/csv;charset=utf-8", [header.join(","), ...rows].join("\n"));
}

function csv(s: string) {
  return `"${s.replaceAll('"', '""')}"`;
}

export function exportIcs() {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VprGrid.SYS//Friday Radar//EN",
    "BEGIN:VEVENT",
    "UID:grain-friday-radar@local",
    "SUMMARY:VprGrid.SYS · 周五实验音乐发行雷达",
    "DESCRIPTION:打开 VprGrid.SYS，抓取本周新专辑 / EP 并按口味排序。",
    "RRULE:FREQ=WEEKLY;BYDAY=FR",
    "DTSTART:20260102T090000",
    "DURATION:PT30M",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  saveBlob("grain-friday-reminder.ics", "text/calendar", ics);
}

export function exportOfflineHtml(catalog: WeekCatalog, albums: ScoredAlbum[]) {
  const rows = albums
    .slice(0, 80)
    .map((a, i) => {
      const img = a.coverUrl
        ? `<img src="${escapeHtml(a.coverUrl)}" alt="" width="72" height="72" style="object-fit:cover;border-radius:6px"/>`
        : `<div style="width:72px;height:72px;border-radius:6px;background:#1e1c19;display:flex;align-items:center;justify-content:center;color:#9c968b;font-family:Georgia">${escapeHtml(a.artist[0] ?? "G")}</div>`;
      return `<article style="display:flex;gap:16px;padding:14px 0;border-bottom:1px solid rgba(240,236,228,.1)">
        <div style="font-family:Georgia;font-style:italic;width:36px;color:#9c968b">${i + 1}</div>
        ${img}
        <div style="flex:1">
          <div style="font-size:13px;color:#9c968b">${escapeHtml(a.artist)}</div>
          <div style="font-size:16px">${escapeHtml(a.title)}</div>
          <div style="font-size:12px;color:#9c968b;margin-top:4px">${a.date} · ${a.type} · ${a.scores.composite}</div>
        </div>
      </article>`;
    })
    .join("");
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>VprGrid.SYS ${catalog.friday}</title>
<body style="margin:0;background:#0c0b0a;color:#f0ece4;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif">
<main style="max-width:720px;margin:0 auto;padding:48px 24px">
  <p style="letter-spacing:.3em;font-size:11px;color:#9c968b">VprGrid.SYS</p>
  <h1 style="font-family:Georgia;font-weight:500;font-size:40px;margin:8px 0 4px">${escapeHtml(formatFridayZh(catalog.friday))}</h1>
  <p style="color:#9c968b;font-size:14px">离线快照 · ${albums.length} 张 · ${escapeHtml(catalog.sourceLabel)}</p>
  ${rows}
</main></body></html>`;
  saveBlob(`grain-${catalog.friday}.html`, "text/html;charset=utf-8", html);
}

function escapeHtml(s: string) {
  const amp = ["&", "amp;"].join("");
  const lt = ["&", "lt;"].join("");
  const gt = ["&", "gt;"].join("");
  const quot = ["&", "quot;"].join("");
  return s.replaceAll("&", amp).replaceAll("<", lt).replaceAll(">", gt).replaceAll('"', quot);
}

