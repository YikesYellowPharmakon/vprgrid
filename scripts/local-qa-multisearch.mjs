#!/usr/bin/env node
/** QA:多源全网检索(/f 艺人)、来源标注、直达链接、扫描池补全。 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:8080/";
mkdirSync("screenshots", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
// 首次抓取要跑 LB + MB 5 页直查,给足时间
await page.waitForTimeout(20000);
const report = {};

// 1. 扫描池数字(合并 MB 直查后应明显 > 之前的 5401)
const stats = await page.textContent("header");
const m = stats?.match(/扫描池\s*(\d+)/);
report.scanPool = { shown: Boolean(m), count: m ? Number(m[1]) : null };

// 2. 搜索 /f(特殊字符艺人)
await page.fill("input[placeholder*='全网']", "/f");
await page.waitForTimeout(9000);
const body = await page.textContent("body");
const addBtns = await page.locator("button", { hasText: "加入参考" }).count();
report.slashF = {
  sectionShown: body.includes("全网检索"),
  hasResults: addBtns > 0,
  resultCount: addBtns,
  hasSourceTags: body.includes("MusicBrainz") || body.includes("iTunes") || body.includes("Deezer"),
  hasOutLinks: body.includes("RYM ↗") && body.includes("AOTY ↗") && body.includes("Bandcamp ↗"),
};
await page.screenshot({ path: "screenshots/search-slash-f.png" });

// 3. 常规多源搜索(老专辑,验证跨源聚合与去重)
await page.fill("input[placeholder*='全网']", "Laughing Stock Talk Talk");
await page.waitForTimeout(9000);
const body2 = await page.textContent("body");
report.multiSource = {
  found: body2.includes("Laughing Stock"),
  itunesTagged: body2.includes("iTunes"),
  deezerTagged: body2.includes("Deezer"),
};
await page.screenshot({ path: "screenshots/search-multisource.png" });

report.consoleErrors = errors.slice(0, 5);
console.log(JSON.stringify(report, null, 2));
await browser.close();
