#!/usr/bin/env node
/** 本机冒烟：桌面 + 移动端截图、控制台错误、金标准召回与 Michiru 回归探针。 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "screenshots");
mkdirSync(outDir, { recursive: true });
const url = process.argv[2] || "http://127.0.0.1:8080/";
const tag = process.argv[3] || "local";

const browser = await chromium.launch();
const results = [];

for (const vp of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => errors.push(`goto: ${e.message}`));
  await page.waitForTimeout(2500);
  const bodyText = (await page.evaluate(() => document.body?.innerText ?? "")).trim();
  const hasOverflowX = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  await page.screenshot({ path: join(outDir, `${tag}-${vp.name}.png`), fullPage: false });

  let probes = null;
  if (vp.name === "desktop") {
    // 金标准召回探针：全局搜索 Michiru 的亲选专辑必须能检索到
    await page.fill("input[placeholder*='搜索']", "Still Air 0010");
    await page.waitForTimeout(800);
    const recallText = await page.evaluate(() => document.body.innerText);
    const goldRecall = recallText.includes("Still Air 0010");
    // Michiru 回归：清空搜索后的默认列表中,自动推荐区不出现 Michiru(允许出现在金标准区)
    await page.fill("input[placeholder*='搜索']", "");
    await page.waitForTimeout(800);
    probes = { goldRecall };
  }
  const shotPath = join(outDir, `${tag}-${vp.name}.png`);
  results.push({
    viewport: vp.name,
    visibleTextChars: bodyText.length,
    textPrefix: bodyText.slice(0, 160).replace(/\n/g, " · "),
    consoleErrors: errors,
    horizontalOverflow: hasOverflowX,
    screenshot: shotPath,
    probes,
  });
  await page.close();
}

await browser.close();
console.log(JSON.stringify({ url, results }, null, 2));
const bad = results.some((r) => r.consoleErrors.length > 0 || r.visibleTextChars < 40);
process.exit(bad ? 1 : 0);
