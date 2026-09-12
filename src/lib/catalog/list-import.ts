/** 列表导入:复用参考订阅的同一套链接 / 粘贴解析(不追踪艺人)。 */
import { importApple, importBandcamp, importRss, importWebList } from "./import-sources";
import { importPlaylist } from "./playlist-import";
import { goldToListItem, itemsToListAlbums, type ListAlbum } from "./lists";
import { detectSourceKind, parsePastedRef } from "./sources";

export type ListImportOk = { ok: true; items: ListAlbum[]; label: string };
export type ListImportFail = { ok: false; error: string; rymUrl?: string };
export type ListImportResult = ListImportOk | ListImportFail;

export async function importListFromUrl(url: string): Promise<ListImportResult> {
  const value = url.trim();
  if (!value) return { ok: false, error: "empty" };
  const kind = detectSourceKind(value);
  if (kind === "spotify") return { ok: false, error: "spotify" };
  if (kind === "unsupported") return { ok: false, error: "unsupported" };
  if (kind === "rym") return { ok: false, error: "rym", rymUrl: value };
  if (kind === "netease") {
    const res = await importPlaylist({ data: { playlist: value } });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, items: res.playlist.entries.map(goldToListItem), label: res.playlist.name };
  }
  if (kind === "aoty") {
    const res = await importWebList({ data: { url: value } });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, items: itemsToListAlbums(res.items), label: res.label };
  }
  if (kind === "apple") {
    const res = await importApple({ data: { url: value } });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, items: itemsToListAlbums(res.items), label: res.label };
  }
  if (kind === "bandcamp") {
    const res = await importBandcamp({ data: { url: value } });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, items: itemsToListAlbums(res.items), label: res.label };
  }
  if (kind === "rss") {
    const res = await importRss({ data: { url: value } });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, items: itemsToListAlbums(res.items), label: res.label };
  }
  return { ok: false, error: "unknown" };
}

export function importListFromPaste(text: string): ListImportResult {
  const { items } = parsePastedRef(text);
  if (!items.length) return { ok: false, error: "paste" };
  return { ok: true, items: itemsToListAlbums(items), label: "" };
}
