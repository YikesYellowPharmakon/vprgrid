/* 插件图标:苹果式极简 — 深空灰 + 光学居中 VG。小尺寸用 canvas 对齐像素,避免截图发糊。 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("extension/icons", { recursive: true });

const pageHtml = `<!doctype html><html><body style="margin:0">
<canvas id="c"></canvas>
<script>
function squircle(ctx, s, r) {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(s - r, 0);
  ctx.quadraticCurveTo(s, 0, s, r);
  ctx.lineTo(s, s - r);
  ctx.quadraticCurveTo(s, s, s - r, s);
  ctx.lineTo(r, s);
  ctx.quadraticCurveTo(0, s, 0, s - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
}
function paint(size) {
  const c = document.getElementById("c");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  const r = Math.round(size * 0.2237);
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, "#2c2c2e");
  g.addColorStop(1, "#111113");
  squircle(ctx, size, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  squircle(ctx, size, r);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(0, 0, size, Math.max(1, Math.round(size * 0.04)));
  ctx.restore();
  const fs = size <= 16 ? Math.round(size * 0.5) : Math.round(size * 0.42);
  ctx.fillStyle = "#f5f5f7";
  ctx.font = (size <= 16 ? 600 : 510) + " " + fs + "px -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VG", size / 2, size / 2 + (size >= 48 ? size * 0.01 : 0));
  return c.toDataURL("image/png");
}
window.paint = paint;
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(pageHtml);
for (const size of [16, 32, 48, 128]) {
  const dataUrl = await page.evaluate((s) => window.paint(s), size);
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  writeFileSync(`extension/icons/icon${size}.png`, buf);
}
await browser.close();
console.log("icons done");
