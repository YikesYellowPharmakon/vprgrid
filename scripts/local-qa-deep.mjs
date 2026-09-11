#!/usr/bin/env node
/** 深度 QA:金标准周视图、Michiru 回归、皮肤切换。 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "screenshots");
mkdirSync(outDir, { recursive: true });
const url = process.argv[2] || "http://127.0.0.1:8080/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);

const report = {};

// 1. 跳到第 34 周（8/17–8/23，金标准最新一批）
await page.selectOption("select[aria-label='选择周']", "2026-08-17");
await page.waitForTimeout(3000);
const w34 = await page.evaluate(() => document.body.innerText);
report.week34 = {
  goldHeader: w34.includes("参考标准 · 内置默认参考"),
  repTrack: w34.includes("代表曲"),
  autoHeader: w34.includes("自动雷达"),
};
await page.evaluate(() => window.scrollTo(0, 700));
await page.screenshot({ path: join(outDir, "qa-week34-gold.png") });

// 2. Michiru 回归：默认列表(本周新专)不出现 Michiru Aoyama 的自动推荐
report.michiruInWeek34Default = w34.includes("Michiru Aoyama");
// 3. 全局搜索 Michiru → 只有金标准那一张
await page.evaluate(() => window.scrollTo(0, 0));
await page.fill("input[placeholder*='搜索']", "Michiru");
await page.waitForTimeout(1000);
const searchText = await page.evaluate(() => document.body.innerText);
report.michiruSearch = {
  found: searchText.includes("Still Air 0010"),
  count: (searchText.match(/Michiru Aoyama/g) || []).length,
};
await page.screenshot({ path: join(outDir, "qa-michiru-search.png") });
await page.fill("input[placeholder*='搜索']", "");
await page.waitForTimeout(600);

// 4. 更早收录桶
await page.selectOption("select[aria-label='选择周']", "earlier");
await page.waitForTimeout(1200);
const earlier = await page.evaluate(() => document.body.innerText);
report.earlierBucket = { hasGold: earlier.includes("参考标准"), hasRep: earlier.includes("代表曲") };
await page.screenshot({ path: join(outDir, "qa-earlier.png") });

// 5. 皮肤切换
await page.click("button[aria-label='界面风格']");
await page.waitForTimeout(700);
await page.click("text=Frutiger Aero");
await page.waitForTimeout(900);
await page.keyboard.press("Escape");
await page.waitForTimeout(700);
report.themeAttr1 = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
await page.screenshot({ path: join(outDir, "qa-theme-frutiger.png") });

await page.click("button[aria-label='界面风格']");
await page.waitForTimeout(700);
await page.click("text=PictoChat");
await page.waitForTimeout(900);
await page.keyboard.press("Escape");
await page.waitForTimeout(700);
report.themeAttr2 = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
await page.screenshot({ path: join(outDir, "qa-theme-pictochat.png") });

// 复位默认主题
await page.click("button[aria-label='界面风格']");
await page.waitForTimeout(700);
await page.click("text=米纸暗色");
await page.waitForTimeout(600);
await page.keyboard.press("Escape");

report.consoleErrors = errors;
console.log(JSON.stringify(report, null, 2));
await browser.close();
