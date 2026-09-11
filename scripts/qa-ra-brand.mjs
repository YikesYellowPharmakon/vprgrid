// QA:红警主题新背景(指挥地图滚动 + 战场标记)+ VprGrid.SYS 字标主题化质感。
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(60000);

// 预置红警主题,避开 FOUC 回退
await page.addInitScript(() => {
  localStorage.setItem(
    "grain-friday-v4",
    JSON.stringify({ state: { theme: "red-alert" }, version: 3 }),
  );
});
await page.goto("http://127.0.0.1:8080/");
await page.waitForSelector("h1", { state: "visible" });
await page.waitForTimeout(2500);

const checks = await page.evaluate(() => {
  const bgfx = document.getElementById("bgfx");
  const cs = bgfx ? getComputedStyle(bgfx) : null;
  const brand = document.querySelector(".brandmark");
  const bcs = brand ? getComputedStyle(brand) : null;
  return {
    theme: document.documentElement.getAttribute("data-theme"),
    bgfxAnims: cs?.animationName ?? "",
    brandText: brand?.textContent?.trim() ?? "",
    brandFont: bcs?.fontFamily?.slice(0, 40) ?? "",
    brandSize: bcs?.fontSize ?? "",
    brandClip: bcs?.webkitBackgroundClip || bcs?.backgroundClip || "",
  };
});
console.log(JSON.stringify(checks, null, 2));
await page.screenshot({ path: "screenshots/qa-ra-app.png" });

// 换 matrix 看字标质感是否跟随主题
await page.addInitScript(() => {
  localStorage.setItem("grain-friday-v4", JSON.stringify({ state: { theme: "matrix" }, version: 3 }));
});
await page.goto("http://127.0.0.1:8080/");
await page.waitForSelector("h1", { state: "visible" });
await page.waitForTimeout(1500);
await page.screenshot({ path: "screenshots/qa-mx-app.png", clip: { x: 0, y: 0, width: 1280, height: 220 } });

if (checks.theme !== "red-alert") throw new Error("FAIL: 主题未生效");
if (!checks.bgfxAnims.includes("fx-ra-map")) throw new Error("FAIL: 地图滚动动画缺失");
if (!checks.brandText.startsWith("VprGrid.SYS")) throw new Error("FAIL: 字标未改名");
if (checks.brandClip !== "text") throw new Error("FAIL: 字标渐变未生效");
console.log("PASS");
await browser.close();
