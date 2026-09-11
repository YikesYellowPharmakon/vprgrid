/**
 * 无条件抓 RYM / AOTY 新发行页,写入本地 JSON 缓存。
 * AOTY:Playwright 过 Cloudflare(~4s)。
 * RYM:不打直播站。走 Internet Archive 年榜快照 + 维基本年专辑表(无登录)。
 * 本周 RYM 直播榜仍留给已登录的插件按钮。
 */
import { chromium } from "playwright";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectPublicReleases } from "../src/lib/catalog/rym-public-fetch.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "src", "lib", "catalog", "data");
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function parseTypeCell(raw, todayIso) {
  const parts = String(raw || "").split("•").map((s) => s.trim());
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

async function waitCf(page) {
  for (let i = 0; i < 28; i++) {
    const t = await page.title();
    if (!/just a moment|attention required|loading https/i.test(t)) return t;
    await page.waitForTimeout(1000);
  }
  return page.title();
}

async function scrapeAoty(page, todayIso, year) {
  const urls = [
    "https://www.albumoftheyear.org/releases/",
    "https://www.albumoftheyear.org/releases/this-week/",
    "https://www.albumoftheyear.org/releases/last-week/",
    `https://www.albumoftheyear.org/${year}/releases/`,
  ];
  const byKey = new Map();
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    } catch {
      continue;
    }
    await waitCf(page);
    const rows = await page.evaluate(() => {
      const list = [];
      for (const el of Array.from(document.querySelectorAll(".albumBlock"))) {
        list.push({
          artist: el.querySelector(".artistTitle")?.textContent?.trim() ?? "",
          title: el.querySelector(".albumTitle")?.textContent?.trim() ?? "",
          typeCell: el.querySelector(".type")?.textContent?.trim() ?? "",
          score: el.querySelector(".rating")?.textContent?.trim() ?? "",
          link: el.querySelector("a[href*='/album/']")?.getAttribute("href") ?? "",
          cover: el.querySelector("img")?.getAttribute("data-src") || el.querySelector("img")?.getAttribute("src") || "",
        });
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
        source: "aoty",
        artist: r.artist,
        title: r.title,
        date: parsed.date,
        type: parsed.type,
        userScore: Number.isFinite(score) && score > 0 ? score : null,
        cover: r.cover && /^https?:/.test(r.cover) ? r.cover.replace("/200x0/", "/400x0/") : null,
        url: r.link ? `https://www.albumoftheyear.org${r.link}` : url,
      });
    }
  }
  return [...byKey.values()];
}

async function launchCtx(channel) {
  try {
    return await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "vpr-scrape-")), {
      headless: true,
      channel,
      viewport: { width: 1280, height: 1400 },
      locale: "en-US",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      args: ["--disable-blink-features=AutomationControlled"],
    });
  } catch {
    return null;
  }
}

async function main() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const year = todayIso.slice(0, 4);
  mkdirSync(DATA, { recursive: true });

  let publicBag = { items: [], rym: 0, wiki: 0 };
  try {
    publicBag = await collectPublicReleases(new Date(`${todayIso}T12:00:00Z`));
  } catch (e) {
    console.warn("[scrape-new] 公开源失败:", e.message);
  }
  writeFileSync(
    join(DATA, "rym-cache.json"),
    JSON.stringify(
      {
        scrapedAt: new Date().toISOString(),
        via: ["wayback", "wikipedia"],
        items: publicBag.items,
      },
      null,
      1,
    ),
  );
  console.log(`[scrape-new] 公开源 RYM ${publicBag.rym} + 维基 ${publicBag.wiki} = ${publicBag.items.length} 条`);

  let ctx = await launchCtx("chrome");
  if (!ctx) ctx = await launchCtx(undefined);
  if (!ctx) {
    const browser = await chromium.launch({ headless: true });
    ctx = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      viewport: { width: 1280, height: 1400 },
      locale: "en-US",
    });
  }
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  let aoty = [];
  try {
    aoty = await scrapeAoty(page, todayIso, year);
  } catch (e) {
    console.warn("[scrape-new] AOTY 失败:", e.message);
  }
  writeFileSync(join(DATA, "aoty-cache.json"), JSON.stringify({ scrapedAt: new Date().toISOString(), items: aoty }, null, 1));
  console.log(`[scrape-new] AOTY ${aoty.length} 条`);

  await ctx.close();
}

main().catch((e) => {
  console.error("[scrape-new] 失败:", e.message);
  process.exit(1);
});
