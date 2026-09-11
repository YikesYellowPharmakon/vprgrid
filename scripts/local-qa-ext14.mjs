// QA:新标签页 Google 标志(主题变色)+ 大框上下位置(⇅)与纵向拉伸(⇕)滑杆。
import { chromium } from "playwright";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

const EXT = join(process.cwd(), "extension");
const PROFILE = mkdtempSync(join(tmpdir(), "vg-ext14-"));

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

const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector("#grid .card", { timeout: 120000 });
await page.waitForTimeout(1500);

const logo = await page.evaluate(() => {
  const g = document.querySelector(".glogo");
  const brandGone = !document.querySelector(".newtab .brand, body.newtab > .wrap > .brand");
  const letters = [...g.querySelectorAll("span")].map((s) => getComputedStyle(s).color);
  return { text: g.textContent.trim(), letters, distinct: new Set(letters).size, brandGone };
});
console.log("标志:", logo.text, "| 字母配色种数:", logo.distinct, "| 旧字标已删:", logo.brandGone);

// 滑杆:拖动 ⇅ 应位移大框,拖动 ⇕ 应增高封面区
const move = await page.evaluate(async () => {
  const box = document.querySelector(".wallbox");
  const scroll = document.querySelector(".wallscroll");
  const y0 = box.getBoundingClientRect().top;
  const h0 = scroll.getBoundingClientRect().height;
  const setRange = (id, v) => {
    const el = document.getElementById(id);
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  setRange("wallpos", 120);
  setRange("wallstretch", 240);
  await new Promise((r) => setTimeout(r, 300));
  const y1 = box.getBoundingClientRect().top;
  const h1 = scroll.getBoundingClientRect().height;
  return { dy: Math.round(y1 - y0), dh: Math.round(h1 - h0) };
});
console.log("位移 dy:", move.dy, "px | 拉伸 dh:", move.dh, "px");
await page.screenshot({ path: "screenshots/ext14-newtab.png" });

// 持久化:重开页面应保留
const saved = await page.evaluate(() => chrome.storage.local.get(["wallY", "wallS"]));
console.log("已存:", JSON.stringify(saved));

if (logo.text !== "Google") throw new Error("FAIL: 标志文本不对");
if (logo.distinct < 3) throw new Error("FAIL: 字母没有按主题多色");
if (Math.abs(move.dy - 120) > 10) throw new Error(`FAIL: 位移不生效 dy=${move.dy}`);
if (move.dh < 200) throw new Error(`FAIL: 拉伸不生效 dh=${move.dh}`);
if (saved.wallY !== 120 || saved.wallS !== 240) throw new Error("FAIL: 未持久化");
console.log("PASS");
await ctx.close();
