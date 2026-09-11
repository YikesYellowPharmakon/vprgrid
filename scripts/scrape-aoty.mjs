/**
 * AOTY 新发行抓取器(独立运行,不进 Web 服务进程)。
 *
 * 为什么独立:AOTY 套 Cloudflare,只有真实 Chromium 能过墙(~4s)。把浏览器塞进
 * dev/preview 服务里会让每次缓存失效都卡几十秒,且 Vercel 无浏览器根本跑不了。
 * 所以由这个脚本抓取并落地成 JSON(与 gold-2026.json 同套路),服务端只读 JSON——
 * 快、稳、可部署。抓取时机:打开程序.command 启动时后台跑一次,或手动 `npm run scrape:aoty`。
 *
 * 用法:node scripts/scrape-aoty.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "lib", "catalog", "data", "aoty-cache.json");

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function parseTypeCell(raw, todayIso) {
  const parts = raw.split("•").map((s) => s.trim());
  if (parts.length < 2) return null;
  const m = /^([A-Za-z]{3})\s+(\d{1,2})$/.exec(parts[0]);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  const day = Number(m[2]);
  if (!mon || !day) return null;
  const kind = parts[1].toLowerCase();
  let type;
  if (kind === "lp" || kind === "album") type = "Album";
  else if (kind === "ep") type = "EP";
  else return null;
  const todayY = Number(todayIso.slice(0, 4));
  const build = (y) => `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  let date = build(todayY);
  const diff = (Date.parse(date) - Date.parse(todayIso)) / 86400000;
  if (diff > 60) date = build(todayY - 1);
  else if (diff < -300) date = build(todayY + 1);
  return { date, type };
}

async function main() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const year = todayIso.slice(0, 4);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    viewport: { width: 1280, height: 1400 },
    locale: "en-US",
  });
  const page = await ctx.newPage();

  const urls = [
    "https://www.albumoftheyear.org/releases/",
    `https://www.albumoftheyear.org/${year}/releases/`,
  ];
  const byKey = new Map();
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    } catch {
      continue;
    }
    for (let i = 0; i < 25; i++) {
      const t = await page.title();
      if (!/just a moment/i.test(t)) break;
      await page.waitForTimeout(1000);
    }
    const rows = await page.evaluate(() => {
      const list = [];
      for (const el of Array.from(document.querySelectorAll(".albumBlock"))) {
        const artist = el.querySelector(".artistTitle")?.textContent?.trim() ?? "";
        const title = el.querySelector(".albumTitle")?.textContent?.trim() ?? "";
        const typeCell = el.querySelector(".type")?.textContent?.trim() ?? "";
        const score = el.querySelector(".rating")?.textContent?.trim() ?? "";
        const link = el.querySelector("a[href*='/album/']")?.getAttribute("href") ?? "";
        const img = el.querySelector("img");
        const cover = img?.getAttribute("data-src") ?? img?.getAttribute("src") ?? "";
        list.push({ artist, title, typeCell, score, link, cover });
      }
      return list;
    });
    for (const r of rows) {
      if (!r.artist || !r.title) continue;
      const parsed = parseTypeCell(r.typeCell, todayIso);
      if (!parsed) continue;
      const key = `${r.artist.toLowerCase()}|${r.title.toLowerCase()}`;
      if (byKey.has(key)) continue;
      const score = Number.parseInt(r.score, 10);
      byKey.set(key, {
        artist: r.artist,
        title: r.title,
        date: parsed.date,
        type: parsed.type,
        userScore: Number.isFinite(score) && score > 0 ? score : null,
        cover: r.cover && /^https?:/.test(r.cover) ? r.cover.replace("/200x0/", "/400x0/") : null,
        url: r.link ? `https://www.albumoftheyear.org${r.link}` : "https://www.albumoftheyear.org/releases/",
      });
    }
  }
  await browser.close();

  const items = [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ scrapedAt: new Date().toISOString(), items }, null, 1));
  console.log(`[scrape-aoty] 写入 ${items.length} 条 → ${OUT}`);
}

main().catch((e) => {
  console.error("[scrape-aoty] 失败:", e.message);
  process.exit(1);
});
