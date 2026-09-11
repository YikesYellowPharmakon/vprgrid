/* 本轮 QA:GRAIN 重制 / 质感反馈 / 自定义主题 / 艺人 AI 背景入口 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:8080";
mkdirSync("screenshots", { recursive: true });

const errors = [];
const fails = [];
function check(name, ok) {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}`);
    fails.push(name);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

console.log("— GRAIN 重制(桌面)");
await page.screenshot({ path: "screenshots/polish-grain-desktop.png", fullPage: false });
const accent = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim(),
);
check(`GRAIN 新强调色生效(${accent})`, accent.toLowerCase() === "#d9c08a");

console.log("— 主题面板:自定义调色");
await page.getByRole("button", { name: "界面风格" }).click();
await page.waitForTimeout(500);
check("出现「自定义」主题卡", await page.getByText("自选背景图 / 颜色 / 纹理").isVisible());
check("出现「自定义调色」编辑区", await page.getByRole("heading", { name: "自定义调色" }).isVisible());
// 切纹理会自动切到自定义主题
await page.getByRole("button", { name: "光晕" }).click();
await page.waitForTimeout(600);
const dataTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const texture = await page.evaluate(() => document.documentElement.getAttribute("data-custom-texture"));
check(`编辑后切到自定义主题(data-theme=${dataTheme})`, dataTheme === "custom");
check(`纹理写入(${texture})`, texture === "glow");
const customBg = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
);
check(`自定义底色变量注入(${customBg})`, customBg === "#101014");
await page.screenshot({ path: "screenshots/polish-custom-theme.png" });
// 改颜色
await page.locator('input[type="color"]').first().evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, "#1a2620");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(500);
const newBg = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
);
check(`改底色即时生效(${newBg})`, newBg === "#1a2620");
await page.screenshot({ path: "screenshots/polish-custom-edited.png" });
// 回到默认
await page.getByRole("button", { name: /GRAIN/ }).first().click();
await page.waitForTimeout(400);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
const backTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
check("切回 GRAIN 后清掉自定义变量", backTheme === null);

console.log("— 专辑详情:艺人 AI 背景入口");
await page.locator("ol li button").first().click();
await page.waitForTimeout(600);
check("详情里有「艺人背景」按钮", await page.getByRole("button", { name: /艺人背景|重新分析艺人/ }).isVisible());
await page.screenshot({ path: "screenshots/polish-album-sheet.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

console.log("— 网格视图");
await page.getByRole("button", { name: "视图" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: "screenshots/polish-grid.png" });
await page.getByRole("button", { name: "视图" }).click();
await page.waitForTimeout(300);

console.log("— 移动端");
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
await page.screenshot({ path: "screenshots/polish-mobile.png" });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(`移动端无横向溢出(${overflow}px)`, overflow <= 1);

await browser.close();

const realErrors = errors.filter((e) => !/favicon|net::ERR_|status of 5\d\d|status of 4\d\d/.test(e));
console.log(JSON.stringify({ fails, errors: realErrors, rawErrorCount: errors.length }, null, 2));
if (fails.length || realErrors.length) process.exit(1);
console.log("ALL POLISH QA PASSED");
