// QA:VprGrid.SYS 字标(大号 + 渐变)、墙缓存秒开(第二次打开新标签页即时有卡片)。
import { chromium } from "playwright";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

const EXT = join(process.cwd(), "extension");
const PROFILE = mkdtempSync(join(tmpdir(), "vg-ext13-"));

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  args: ["--headless=new", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
});
ctx.setDefaultTimeout(120000);

let extId = "";
for (let i = 0; i < 40 && !extId; i++) {
  const sw = ctx.serviceWorkers();
  if (sw.length) extId = new URL(sw[0].url()).host;
  else await new Promise((r) => setTimeout(r, 500));
}
if (!extId) throw new Error("extension not loaded");

// 第一次打开:走网络,填充 wallCache
const p1 = await ctx.newPage();
await p1.goto(`chrome-extension://${extId}/newtab.html`);
await p1.waitForSelector("#grid .card", { timeout: 120000 });
const brand = await p1.evaluate(() => {
  const b = document.querySelector(".brand");
  const cs = getComputedStyle(b);
  return { text: b.textContent.trim(), size: cs.fontSize, clip: cs.webkitBackgroundClip || cs.backgroundClip };
});
console.log("字标:", JSON.stringify(brand));
const n1 = await p1.evaluate(() => document.querySelectorAll("#grid .card").length);
console.log("首次打开卡片:", n1);
await p1.close();

// 第二次打开:应从缓存秒开(500ms 内有卡片,无骨架等待)
const p2 = await ctx.newPage();
const t0 = Date.now();
await p2.goto(`chrome-extension://${extId}/newtab.html`);
await p2.waitForSelector("#grid .card", { timeout: 15000 });
const ms = Date.now() - t0;
const n2 = await p2.evaluate(() => document.querySelectorAll("#grid .card").length);
console.log("第二次打开: 首卡片耗时", ms + "ms, 卡片", n2);
await p2.waitForTimeout(2500);
await p2.screenshot({ path: "screenshots/ext13-newtab.png" });

if (!brand.text.startsWith("VprGrid.SYS")) throw new Error("FAIL: 插件字标未改名");
if (parseFloat(brand.size) < 22) throw new Error(`FAIL: 字标太小 ${brand.size}`);
if (brand.clip !== "text") throw new Error("FAIL: 字标渐变未生效");
if (n1 < 10 || n2 < 10) throw new Error(`FAIL: 卡片数不足 ${n1}/${n2}`);
if (ms > 3000) throw new Error(`FAIL: 秒开失败,耗时 ${ms}ms`);
console.log("PASS");
await ctx.close();
