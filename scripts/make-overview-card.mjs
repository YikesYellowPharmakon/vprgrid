import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COVER_DIR = join(ROOT, "scripts", ".promo-covers");
const HTML_SRC = join(ROOT, "scripts", "promo-overview.html");
const HTML_OUT = join(ROOT, "scripts", ".promo-overview.out.html");
const GOLD = join(ROOT, "src", "lib", "catalog", "gold-2026.json");

function pickAlbums(n) {
  const raw = JSON.parse(readFileSync(GOLD, "utf8"));
  const albums = raw.filter((r) => String(r.pic || "").trim());
  const step = Math.max(1, Math.floor(albums.length / n));
  return Array.from({ length: n }, (_, i) => {
    const row = albums[(i * step + 3) % albums.length];
    const pic = String(row.pic).trim();
    const src = pic.includes("music.126.net") ? `${pic.split("?")[0]}?param=240y240` : pic;
    return { artist: row.artist, title: row.title, src };
  });
}

function downloadCovers(albums) {
  mkdirSync(COVER_DIR, { recursive: true });
  const out = [];
  for (const [i, album] of albums.entries()) {
    const dest = join(COVER_DIR, `ov-${String(i).padStart(2, "0")}.jpg`);
    if (!existsSync(dest)) {
      const r = spawnSync(
        "curl",
        ["-fsSL", "--max-time", "12", "-A", "VprGrid.SYS/1.0", "-e", "https://music.163.com/", "-o", dest, album.src],
        { encoding: "utf8" },
      );
      if (r.status !== 0) continue;
    }
    out.push({ ...album, src: pathToFileURL(dest).href });
  }
  return out;
}

function writeHtml(files) {
  const html = readFileSync(HTML_SRC, "utf8").replace(
    '<script type="application/json" id="covers">[]</script>',
    `<script type="application/json" id="covers">${JSON.stringify(files)}</script>`,
  );
  writeFileSync(HTML_OUT, html);
}

function jpegFromPng(pngPath, dest, w, h) {
  const r = spawnSync(
    "sips",
    ["-s", "format", "jpeg", "-s", "formatOptions", "88", "--resampleHeightWidth", String(h), String(w), pngPath, "--out", dest],
    { encoding: "utf8" },
  );
  if (r.status === 0) return;
  const py = spawnSync(
    "python3",
    [
      "-c",
      [
        "from PIL import Image",
        `im = Image.open(${JSON.stringify(pngPath)}).convert("RGB").resize((${w}, ${h}), Image.Resampling.LANCZOS)`,
        `im.save(${JSON.stringify(dest)}, "JPEG", quality=88, optimize=True)`,
      ].join("\n"),
    ],
    { encoding: "utf8" },
  );
  if (py.status !== 0) throw new Error(py.stderr || r.stderr || "jpeg convert failed");
}

const files = downloadCovers(pickAlbums(5));
if (files.length < 5) {
  console.error("not enough covers", files.length);
  process.exit(1);
}
writeHtml(files);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(HTML_OUT).href, { waitUntil: "networkidle", timeout: 45000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const pngPath = join(COVER_DIR, "overview.png");
await page.screenshot({ path: pngPath, type: "png" });
await browser.close();

jpegFromPng(pngPath, join(ROOT, "public", "overview.jpg"), 1280, 640);
jpegFromPng(pngPath, join(ROOT, "public", "card.jpg"), 1280, 640);
jpegFromPng(pngPath, join(ROOT, "public", "og.jpg"), 1200, 630);
console.log("wrote public/overview.jpg, public/card.jpg, public/og.jpg");
