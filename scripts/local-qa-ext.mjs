/* 浏览器插件 QA:真实加载扩展,验证新标签页/弹窗渲染与设置页。 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const EXT = resolve("extension");
const PROFILE = resolve("screenshots/.ext-profile");
mkdirSync("screenshots", { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });

const fails = [];
const errors = [];
function check(name, ok) {
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
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
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

// 新标签页(冷缓存周的 API 首抓可能要 ~60 秒)
await page.goto(`chrome-extension://${extId}/newtab.html`);
check("新标签页标题渲染", await page.getByRole("heading", { name: "每周新专雷达" }).isVisible());
await page.waitForSelector(".card", { timeout: 120000 });
const cards = await page.locator(".card").count();
check(`雷达墙有卡片(${cards} 张)`, cards > 0);
const covers = await page.locator(".cover img").count();
check(`封面图渲染(${covers} 张)`, covers > 0);
await page.screenshot({ path: "screenshots/ext-newtab.png" });

// 周切换
await page.click("#prev");
await page.waitForTimeout(1000);
check("上一周可切换", (await page.locator("#weeklabel").textContent())?.includes("·"));

// 弹窗(本周已被缓存,应当很快)
await page.goto(`chrome-extension://${extId}/popup.html`);
await page.waitForSelector(".card", { timeout: 120000 });
check("弹窗渲染卡片", (await page.locator(".card").count()) > 0);
await page.screenshot({ path: "screenshots/ext-popup.png" });

// 设置页:保存同步码
await page.goto(`chrome-extension://${extId}/options.html`);
await page.fill("#base", "http://127.0.0.1:8080");
await page.fill("#sync", JSON.stringify({ v: 1, taste: ["ambient"], entries: [{ artist: "QA", title: "QA Album", date: "2026-08-28", pic: null }] }));
await page.click("#save");
await page.waitForTimeout(600);
const stored = await page.evaluate(() => chrome.storage.local.get(["appBase", "syncCode"]));
check("设置保存到 storage", stored.appBase === "http://127.0.0.1:8080" && stored.syncCode.includes("QA Album"));
await page.screenshot({ path: "screenshots/ext-options.png" });

// 同步码生效:本周(2026-08-28 所在周)参考应显示 QA Album
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card", { timeout: 120000 });
const hasQa = await page.getByText("QA Album").isVisible().catch(() => false);
check("同步码里的参考条目出现在墙上", hasQa);
await page.screenshot({ path: "screenshots/ext-newtab-synced.png" });

await ctx.close();
const realErrors = errors.filter((e) => !/favicon|net::ERR_|coverartarchive|status of 4\d\d/.test(e));
console.log(JSON.stringify({ fails, errors: realErrors }, null, 2));
if (fails.length || realErrors.length) process.exit(1);
console.log("ALL EXTENSION QA PASSED");
