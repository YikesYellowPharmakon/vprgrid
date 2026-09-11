/* 插件 QA v11:manifest 无 geolocation 权限;Red Alert 主题直连同步到新标签页
   (雷达扫掠动画运行);旧 cybercore 同步码自动落到 red-alert;滑杆 rAF 合帧生效。 */
import { chromium } from "playwright";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXT = resolve("extension");
const PROFILE = join(tmpdir(), "vaaapor-ext-profile12");
mkdirSync("screenshots", { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });

const fails = [];
function check(name, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) fails.push(name);
}

// 0) manifest 静态检查
const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
check("manifest 不再声明 geolocation", !manifest.permissions.includes("geolocation"), manifest.permissions.join(","));

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium",
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const extId = new URL(sw.url()).host;

// 1) 应用切 Red Alert → 直连推送
const app = await ctx.newPage();
app.setDefaultTimeout(120000);
app.setDefaultNavigationTimeout(120000);
await app.goto("http://127.0.0.1:8080", { waitUntil: "domcontentloaded" });
await app.evaluate(() => {
  localStorage.setItem("grain-friday-v4", JSON.stringify({ state: { theme: "red-alert" }, version: 3 }));
});
await app.reload({ waitUntil: "domcontentloaded" });
await app.waitForSelector("h1", { timeout: 60000 });
const pushed = await app.evaluate(async () => {
  for (let i = 0; i < 40; i++) {
    const r = await fetch("/api/sync");
    const j = await r.json();
    if (j.code) {
      const p = JSON.parse(j.code);
      if (p.theme?.id === "red-alert") return true;
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  return false;
});
check("应用推送 red-alert 主题", pushed);

// 2) 插件设置地址后打开新标签页
const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/options.html`);
await page.fill("#base", "http://127.0.0.1:8080");
await page.click("#save");
await page.waitForTimeout(400);
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
await page.waitForTimeout(800);
const nt = await page.evaluate(() => {
  const before = getComputedStyle(document.getElementById("bgfx"), "::before");
  return {
    theme: document.documentElement.dataset.theme,
    anim: before.animationName,
    conic: before.backgroundImage.includes("conic-gradient"),
    noRainCanvas: !document.querySelector("#bgfx canvas"),
  };
});
check("新标签页同步 red-alert + 雷达扫掠动画", nt.theme === "red-alert" && nt.anim.includes("fx-ra-sweep") && nt.conic, JSON.stringify(nt));
check("非 matrix 主题下无数字雨画布", nt.noRainCanvas);

// 3) 旧 cybercore 同步码 → 落到 red-alert(LEGACY_THEME_MAP)
const legacy = await page.evaluate(async () => {
  const code = JSON.stringify({ v: 3, taste: [], weights: {}, theme: { id: "cybercore" }, entries: [{ artist: "A", title: "T", date: "2026-01-01" }] });
  await chrome.storage.local.set({ syncCode: code });
  return true;
});
check("旧 cybercore 同步码已写入(供回退路径)", legacy);

// 4) 滑杆 rAF 合帧:input 后下一帧生效
await page.evaluate(() => {
  const s = document.getElementById("wallsize");
  s.value = "1040";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(200);
const w = await page.evaluate(() => Math.round(document.querySelector(".wallbox").getBoundingClientRect().width));
check("滑杆 rAF 应用宽度", w === 1040, `w=${w}`);

await page.waitForTimeout(1500);
await page.screenshot({ path: "screenshots/ext11-redalert-newtab.png" });
await app.screenshot({ path: "screenshots/ext11-redalert-app.png" });

await ctx.close();
if (fails.length) {
  console.error(`\n${fails.length} 项失败: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\nALL EXT v11 QA PASSED");
