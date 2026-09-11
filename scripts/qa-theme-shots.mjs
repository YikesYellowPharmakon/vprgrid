/* 主题背景快速截图:验证动效层垫在内容下、背景上,不遮挡内容。 */
import { chromium } from "playwright";

const themes = process.argv.slice(2);
const list = themes.length ? themes : ["matrix", "cyber-neon", "grainy-blur", "red-alert", "y2k"];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:8080", { waitUntil: "domcontentloaded" });
for (const t of list) {
  await page.evaluate((theme) => {
    localStorage.setItem("grain-friday-v4", JSON.stringify({ state: { theme }, version: 2 }));
  }, t);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 60000 });
  await page.waitForTimeout(2500);
  const fx = await page.evaluate(() => {
    const el = document.getElementById("bgfx");
    if (!el) return "missing";
    const cs = getComputedStyle(el, "::before");
    return `z=${getComputedStyle(el).zIndex} anim=${cs.animationName}`;
  });
  console.log(`${t}: #bgfx ${fx}`);
  await page.screenshot({ path: `screenshots/theme-${t}.png` });
}
await browser.close();
console.log("done");
