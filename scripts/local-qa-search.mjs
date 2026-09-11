#!/usr/bin/env node
/** 本次改动 QA:口味表段落删除、全网检索、加入参考、动态年份。 */
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

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const report = {};

// 1. 左上角年份动态(当前 2026,断言渲染的是运行时年份)
const label = await page.textContent("header p");
report.dynamicYear = { label: label?.trim(), matchesNow: label?.includes(String(new Date().getFullYear())) };

// 2. 口味表说明段落已删
await page.locator("button", { hasText: "口味 A–Z" }).first().click();
await page.waitForTimeout(600);
const tasteBody = await page.textContent("body");
report.tasteCopyRemoved = {
  noParagraph: !tasteBody.includes("初始口味拼写已校正"),
  noSpellingList: !tasteBody.includes("amient → Ambient"),
};
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// 3. 全网检索:搜一张老专辑(1959 年爵士,不在参考也不在本周)
await page.fill("input[placeholder*='全网']", "Kind of Blue Miles Davis");
await page.waitForTimeout(6000); // 防抖 + MusicBrainz 请求
const searchBody = await page.textContent("body");
report.globalSearch = {
  sectionShown: searchBody.includes("全网检索"),
  foundOldJazz: searchBody.includes("Kind of Blue"),
  hasAddButton: (await page.locator("button", { hasText: "加入参考" }).count()) > 0,
};
await page.screenshot({ path: "screenshots/global-search.png" });

// 4. 加入参考 → 出现「已在参考」,且参考面板可见手动条目并可移除
await page.locator("button", { hasText: "加入参考" }).first().click();
await page.waitForTimeout(800);
const afterAdd = await page.textContent("body");
report.addToRef = { showsInRef: afterAdd.includes("已在参考"), toast: afterAdd.includes("加入参考体系") };
await page.screenshot({ path: "screenshots/added-to-ref.png" });

await page.fill("input[placeholder*='全网']", "");
await page.waitForTimeout(600);
await page.locator("button", { hasText: "参考设置" }).first().click();
await page.waitForTimeout(600);
const refBody = await page.textContent("body");
report.refSheetExtras = { listsManual: refBody.includes("手动加入"), hasEntry: refBody.includes("Kind of Blue") };
await page.screenshot({ path: "screenshots/ref-extras.png" });
const removeBtn = page.locator("button[aria-label^='移出参考']").first();
if ((await removeBtn.count()) > 0) {
  await removeBtn.click();
  await page.waitForTimeout(500);
  const afterRemove = await page.textContent("body");
  report.removeExtra = { removed: !afterRemove.includes("手动加入") };
}

report.consoleErrors = errors;
console.log(JSON.stringify(report, null, 2));
await browser.close();
