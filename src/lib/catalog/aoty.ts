/**
 * AlbumOfTheYear(AOTY)新发行池 —— 读取预抓取的 JSON 缓存。
 *
 * 为什么是预抓取:AOTY 全站套 Cloudflare,只有真实 Chromium 能过墙(~4s)。
 * 把无头浏览器塞进 Web 服务进程会让每次缓存失效都卡几十秒,Vercel 上更是没有浏览器
 * 可用。所以由独立脚本 `scripts/scrape-aoty.mjs`(打开程序.command 启动时后台跑,
 * 或手动 `npm run scrape:aoty`)抓取并落地 `data/aoty-cache.json`,这里只读文件——
 * 快、稳、可部署。AOTY 的核心价值是它的**用户评分**:给零听众/零评分但有风格的
 * 好专辑补上真实关注度信号,直接缓解「无人关注的 ambient 流水线」误入榜单的问题。
 *
 * RYM 不在此列:它在 Cloudflare 之外还套自家二级拦截,无头/自动化浏览器一律卡在
 * "Loading...",无法可靠抓取——RYM 走浏览器插件在真实登录会话里读页面。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// 静态 import 作基线:打包进产物,预览版 / Vercel 都能用(构建时快照)。
import bundled from "./data/aoty-cache.json";

export type AotyItem = {
  artist: string;
  title: string;
  date: string;
  type: "Album" | "EP";
  userScore: number | null;
  cover: string | null;
  url: string;
};

const BASELINE: AotyItem[] = Array.isArray((bundled as { items?: AotyItem[] }).items)
  ? ((bundled as { items: AotyItem[] }).items)
  : [];

type FileCache = { at: number; items: AotyItem[] };
let fileCache: FileCache | null = null;
const REREAD_MS = 5 * 60 * 1000;

/**
 * 数据来源两层:
 *   ① 源文件 fs 读(本地 dev/preview:抓取脚本写一次就能秒级生效,含最新数据);
 *   ② 打包进产物的基线快照(读不到源文件时的兜底,预览版 / Vercel 用这份)。
 */
function readAll(): AotyItem[] {
  if (fileCache && Date.now() - fileCache.at < REREAD_MS) return fileCache.items;
  let items = BASELINE;
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), "data", "aoty-cache.json");
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { items?: AotyItem[] };
    if (Array.isArray(parsed.items) && parsed.items.length > 0) items = parsed.items;
  } catch {
    // 源文件读不到(打包后路径不存在):用基线快照
  }
  fileCache = { at: Date.now(), items };
  return items;
}

/**
 * 抓当前周窗口内的 AOTY 新发行(纯读文件,不开浏览器,永不抛)。
 * @param deep 保留签名一致性;此来源不区分深浅扫(数据由抓取脚本决定)
 */
export async function loadAotyWeek(start: string, end: string, _deep: boolean, _todayIso: string): Promise<AotyItem[]> {
  return readAll().filter((a) => a.date >= start && a.date <= end);
}
