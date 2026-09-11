#!/usr/bin/env node
/**
 * 刷新金标准数据：从网易云拉取整份歌单，重新生成 src/lib/catalog/gold-2026.json。
 *
 * 用法：
 *   node scripts/update-gold-playlist.mjs            # 使用内置参考歌单 ID
 *   node scripts/update-gold-playlist.mjs <歌单ID>   # 指定其他歌单
 *
 * 说明：
 * - 通过 trackIds 全量分批拉取曲目详情，绝不只取网页前 10 首；
 * - 曲目缺发行时间的，补拉专辑页；仍缺的用「加入歌单时间」近似归周（标 dateApprox）；
 * - 同一专辑出现多首时只保留第一首作为代表曲，并在结尾警告。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 与 src/lib/catalog/sources.ts 的 BUILTIN_PLAYLIST_ID 保持同一份
const PLAYLIST_ID = process.argv[2] || "17965976957";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/catalog/gold-2026.json");
const HEADERS = {
  Accept: "application/json",
  Referer: "https://music.163.com/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. 歌单元数据 + 全量 trackIds
const detail = await getJson(`https://music.163.com/api/v6/playlist/detail?id=${PLAYLIST_ID}`);
const playlist = detail.playlist;
if (!playlist?.trackIds?.length) throw new Error("歌单为空或不可访问");
console.log(`歌单「${playlist.name}」 · ${playlist.trackCount} 首`);
const trackIds = playlist.trackIds.map((t) => t.id);
const addedAt = new Map(playlist.trackIds.map((t) => [t.id, t.at]));

// 2. 分批拉曲目详情
const songs = [];
for (const group of chunks(trackIds, 100)) {
  const c = encodeURIComponent(JSON.stringify(group.map((id) => ({ id }))));
  const body = await getJson(`https://music.163.com/api/v3/song/detail?c=${c}`);
  songs.push(...(body.songs ?? []));
  console.log(`曲目详情 ${songs.length}/${trackIds.length}`);
  await sleep(400);
}
if (songs.length !== trackIds.length) {
  console.warn(`警告：拉到 ${songs.length} 首，与歌单 ${trackIds.length} 首不符`);
}

// 3. 补拉缺发行时间的专辑页
const missing = [...new Set(songs.filter((s) => !s.publishTime).map((s) => s.al.id))];
const albumDates = new Map();
for (const alid of missing) {
  try {
    const body = await getJson(`https://music.163.com/api/album/${alid}`);
    const pt = body.album?.publishTime;
    if (pt) albumDates.set(alid, pt);
  } catch {
    /* 单张失败不影响整体，走 dateApprox 兜底 */
  }
  await sleep(300);
}
console.log(`补拉发行时间：${albumDates.size}/${missing.length}`);

// 网易云专辑页接口不稳定：沿用上一版文件里的精确日期,重复运行永不退化。
const previousExact = new Map();
if (existsSync(OUT)) {
  try {
    for (const e of JSON.parse(readFileSync(OUT, "utf8"))) {
      if (e.date && !e.dateApprox) previousExact.set(e.albumId, e.date);
    }
  } catch {
    /* 旧文件损坏就全量重建 */
  }
}

// 4. 一专一代表曲
const entries = [];
const seen = new Set();
let approx = 0;
let dups = 0;
for (const s of songs) {
  if (seen.has(s.al.id)) {
    dups += 1;
    continue;
  }
  seen.add(s.al.id);
  const pt = s.publishTime || albumDates.get(s.al.id);
  let date;
  let dateApprox;
  if (pt) {
    date = isoDate(pt);
  } else if (previousExact.has(s.al.id)) {
    date = previousExact.get(s.al.id);
  } else {
    date = isoDate(addedAt.get(s.id));
    dateApprox = true;
    approx += 1;
  }
  const entry = {
    albumId: s.al.id,
    title: s.al.name,
    artist: s.ar.map((a) => a.name).join(" / "),
    date,
    songId: s.id,
    song: s.name,
    pic: s.al.picUrl || null,
  };
  if (dateApprox) entry.dateApprox = true;
  entries.push(entry);
}
entries.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

writeFileSync(OUT, JSON.stringify(entries, null, 1), "utf8");
console.log(`已写入 ${OUT}`);
console.log(`专辑 ${entries.length} 张 · 近似日期 ${approx} 张${dups ? ` · 重复专辑合并 ${dups} 首` : ""}`);
if (dups > 0) console.warn("注意：歌单里同一专辑有多首歌，只保留首次出现的作为代表曲。");
console.log("提示：改完数据后运行 node --test scripts/gold-recall.test.mjs 校验（张数断言按需更新）。");
