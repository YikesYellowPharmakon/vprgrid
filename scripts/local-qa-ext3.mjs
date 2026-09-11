/* 插件 QA v3:新标签页轻量重设计 —— Google 搜索框 + 小缩略图墙 + 「+N」溢出卡。 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const EXT = resolve("extension");
const PROFILE = resolve("screenshots/.ext-profile3");
mkdirSync("screenshots", { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });

const fails = [];
function check(name, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) fails.push(name);
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium",
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const extId = new URL(sw.url()).host;
console.log(`扩展已加载:${extId}`);

const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/options.html`);
await page.fill("#base", "http://127.0.0.1:8080");
await page.click("#save");
await page.waitForTimeout(500);

// 新标签页
await page.goto(`chrome-extension://${extId}/newtab.html`);
check("Google 搜索框可见", await page.locator(".gsearch input").isVisible());
check(
  "搜索框指向 Google",
  await page.evaluate(() => document.querySelector(".gsearch").action === "https://www.google.com/search"),
);
await page.waitForSelector(".card", { timeout: 120000 });
const cards = await page.locator(".card").count();
check(`缩略图墙压缩到两排内(${cards} 张,≤16)`, cards <= 16);
const hasMore = (await page.locator(".card.more").count()) === 1;
const coverW = await page.locator(".cover").first().evaluate((n) => n.getBoundingClientRect().width);
check(`封面为小尺寸(${Math.round(coverW)}px ≤ 110px)`, coverW <= 110);
console.log(`  · 溢出「+N」卡:${hasMore ? "有" : "无(本周条目未超上限)"}`);
await page.waitForTimeout(2500);
await page.screenshot({ path: "screenshots/ext3-newtab.png" });

// 搜索真实跳转 Google
await page.fill(".gsearch input", "vaaapor grain radar");
await page.keyboard.press("Enter");
await page.waitForURL(/google\.com\/search/, { timeout: 20000 }).catch(() => null);
check("回车后跳转 Google 搜索", page.url().includes("google.com/search"), page.url().slice(0, 80));

// 切换按钮仍在
await page.goto(`chrome-extension://${extId}/newtab.html`);
check("切换按钮仍可用", await page.locator("#modetoggle").isVisible());

await ctx.close();
if (fails.length) {
  console.error(`\n${fails.length} 项失败: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\nALL EXT v3 QA PASSED");
