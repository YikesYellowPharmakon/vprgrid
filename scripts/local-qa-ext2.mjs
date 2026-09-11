/* 插件 QA v2:主题同步(同步码 v2 携带配色)+ 缩略图墙 ↔ 完整应用切换按钮。 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const EXT = resolve("extension");
const PROFILE = resolve("screenshots/.ext-profile2");
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

// 1) 写入带主题(Matrix 磷光绿)的 v2 同步码
await page.goto(`chrome-extension://${extId}/options.html`);
const syncV2 = JSON.stringify({
  v: 2,
  taste: ["ambient"],
  theme: {
    bg: "#020703",
    surface: "#06120a",
    raised: "#0a1c10",
    fg: "#8dffa3",
    muted: "#5eca77",
    subtle: "#3f8f55",
    accent: "#00ff66",
    border: "rgb(141 255 163 / 0.14)",
  },
  entries: [{ artist: "QA", title: "Theme Album", date: "2026-08-28", pic: null }],
});
await page.fill("#base", "http://127.0.0.1:8080");
await page.fill("#sync", syncV2);
await page.click("#save");
await page.waitForTimeout(600);

// 2) 新标签页:主题变量注入 + themed 类
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
const bgVar = await page.evaluate(() => document.documentElement.style.getPropertyValue("--bg").trim());
check("同步主题注入 --bg", bgVar === "#020703", bgVar);
check("body 带 themed 类(收起默认氛围渐变)", await page.evaluate(() => document.body.classList.contains("themed")));
const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check("页面底色已变为 Matrix 绿黑", bodyBg === "rgb(2, 7, 3)", bodyBg);
await page.screenshot({ path: "screenshots/ext2-themed-wall.png" });

// 3) 切换按钮:墙 → 完整应用
const toggle = page.locator("#modetoggle");
check("切换按钮可见,初始为「完整应用」", (await toggle.textContent())?.includes("完整应用"));
await toggle.click();
await page.waitForTimeout(2500);
check("iframe 显示且指向应用", await page.evaluate(() => {
  const f = document.getElementById("appframe");
  return !f.hidden && f.src.startsWith("http://127.0.0.1:8080");
}));
check("按钮翻转为「缩略图墙」", (await toggle.textContent())?.includes("缩略图墙"));
const frame = page.frameLocator("#appframe");
const appOk = await frame
  .locator("h1")
  .first()
  .waitFor({ state: "visible", timeout: 90000 })
  .then(() => true)
  .catch(() => false);
check("iframe 内应用真实渲染(h1 可见)", appOk);
await page.waitForTimeout(1500);
await page.screenshot({ path: "screenshots/ext2-appmode.png" });

// 4) 模式持久化:重开新标签页仍是完整应用
await page.goto("about:blank");
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForTimeout(2000);
check("重开后仍保持完整应用模式", await page.evaluate(() => document.body.classList.contains("appmode")));
// 切回墙
await page.click("#modetoggle");
await page.waitForTimeout(800);
check("可切回缩略图墙", await page.evaluate(() => !document.body.classList.contains("appmode")));

// 5) 弹窗:同样有主题与切换按钮
await page.goto(`chrome-extension://${extId}/popup.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
check("弹窗也注入主题", await page.evaluate(() => document.documentElement.style.getPropertyValue("--bg").trim() === "#020703"));
check("弹窗也有切换按钮", await page.locator("#modetoggle").isVisible());
await page.screenshot({ path: "screenshots/ext2-popup.png" });

await ctx.close();
if (fails.length) {
  console.error(`\n${fails.length} 项失败: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\nALL EXT v2 QA PASSED");
