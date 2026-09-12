/**
 * 打两份别人解压就能用的 Demo 包:
 *   release/VprGrid.SYS-demo-<ver>/              当前完整版(含内置亲选歌单)
 *   release/VprGrid.SYS-demo-<ver>-blank-ref/    不预装亲选参考
 * 以及对应的 .zip
 */
import { execSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "extension/manifest.json"), "utf8"));
const ver = String(manifest.version || "0.0.0");
const releaseDir = join(root, "release");

const skipBase = (base) =>
  base === ".DS_Store" ||
  base === "node_modules" ||
  base === "README.md" ||
  base.startsWith("local-qa") ||
  base.startsWith("qa-") ||
  base.endsWith(".test.mjs") ||
  base.endsWith(".test.ts");

function starterScripts() {
  const macStart = `#!/bin/zsh
cd "$(dirname "$0")/app" || exit 1
echo "== VprGrid.SYS =="
if ! command -v npm >/dev/null 2>&1; then
  echo "还没有 Node.js。打开 https://nodejs.org 安装 LTS，装完再双击本文件。"
  read -r "?按回车关闭 "
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "第一次启动，正在安装依赖（只要一次，可能要几分钟）..."
  npm install || exit 1
fi
echo "启动完整应用。窗口不要关。浏览器打开 http://127.0.0.1:8080"
npm run dev
`;
  const winStart = `@echo off
cd /d "%~dp0app"
echo == VprGrid.SYS ==
where npm >nul 2>&1
if errorlevel 1 (
  echo 还没有 Node.js。打开 https://nodejs.org 安装 LTS，装完再双击本文件。
  pause
  exit /b 1
)
if not exist node_modules (
  echo 第一次启动，正在安装依赖（只要一次，可能要几分钟）...
  call npm install
  if errorlevel 1 exit /b 1
)
echo 启动完整应用。窗口不要关。浏览器打开 http://127.0.0.1:8080
call npm run dev
pause
`;
  return { macStart, winStart };
}

function readmeFor(name, extra) {
  return [
    `VprGrid.SYS Demo ${ver}`,
    extra,
    "",
    "这个压缩包里有两样东西，缺一不可：",
    "  extension/   浏览器插件",
    "  app/         完整应用源码（里面有 package.json）",
    "",
    "灰屏 = 只装了插件、没有启动 app。",
    "",
    "1. 双击 Install-Guide.html 看图。",
    "2. Chrome / Edge → 扩展 → 开发者模式 → 加载已解压的扩展程序 → 选本包里的 extension。",
    "3. 先装 Node.js LTS（https://nodejs.org）。",
    "4. Mac 双击「打开完整应用.command」；Windows 双击 Start-App.bat。",
    "   或打开终端：",
    `     cd 解压后的文件夹/app`,
    "     npm install",
    "     npm run dev",
    "   窗口不要关。浏览器打开 http://127.0.0.1:8080 确认不是灰屏。",
    "5. 新标签页点「完整应用」。",
    "",
    "第一次 npm install 只要做一次。之后每次开机只需 npm run dev。",
    "",
  ].join("\n");
}

/** 清空亲选清单,并切断网易云歌单自动同步,避免别人打开后把歌单拉回来。 */
function applyBlankRef(appDir) {
  writeFileSync(join(appDir, "src/lib/catalog/gold-2026.json"), "[]\n");
  const srcPath = join(appDir, "src/lib/catalog/sources.ts");
  let s = readFileSync(srcPath, "utf8");
  const before = s;
  s = s.replace(/export const BUILTIN_PLAYLIST_ID = "[^"]*";/, 'export const BUILTIN_PLAYLIST_ID = "";');
  s = s.replace(
    /label: "内置默认参考",\n    detail: "364 张亲选 · 一专一代表曲",\n    url: BUILTIN_PLAYLIST_URL,\n    enabled,\n    autoSync: true,/,
    'label: "参考池",\n    detail: "空 · 自己添加订阅",\n    enabled,\n    autoSync: false,',
  );
  s = s.replace(
    "export function ensureBuiltinPlaylist(src: RefSource): RefSource {\n  if (src.kind !== \"builtin\") return src;\n  const url = src.url || BUILTIN_PLAYLIST_URL;",
    "export function ensureBuiltinPlaylist(src: RefSource): RefSource {\n  if (src.kind !== \"builtin\") return src;\n  if (!BUILTIN_PLAYLIST_ID) return src;\n  const url = src.url || BUILTIN_PLAYLIST_URL;",
  );
  if (s === before || !s.includes('BUILTIN_PLAYLIST_ID = ""')) {
    throw new Error("blank-ref patch failed: sources.ts did not match expected builtin playlist block");
  }
  writeFileSync(srcPath, s);
}

function packOne({ suffix, extra }) {
  const name = suffix ? `VprGrid.SYS-demo-${ver}-${suffix}` : `VprGrid.SYS-demo-${ver}`;
  const packDir = join(releaseDir, name);
  const zipPath = join(releaseDir, `${name}.zip`);
  const appDir = join(packDir, "app");
  const { macStart, winStart } = starterScripts();

  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(appDir, { recursive: true });

  cpSync(join(root, "extension"), join(packDir, "extension"), {
    recursive: true,
    filter: (src) => !skipBase(src.split("/").pop() || ""),
  });

  for (const file of ["package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", "startup.sh"]) {
    cpSync(join(root, file), join(appDir, file));
  }
  for (const dir of ["src", "public", "scripts", "server", "migrations"]) {
    cpSync(join(root, dir), join(appDir, dir), {
      recursive: true,
      filter: (src) => !skipBase(src.split("/").pop() || ""),
    });
  }
  mkdirSync(join(appDir, ".grok"), { recursive: true });
  cpSync(join(root, ".grok/app-env.json"), join(appDir, ".grok/app-env.json"));
  cpSync(join(root, "public/install.html"), join(packDir, "Install-Guide.html"));

  if (suffix === "blank-ref") applyBlankRef(appDir);

  writeFileSync(join(packDir, "打开完整应用.command"), macStart, "utf8");
  chmodSync(join(packDir, "打开完整应用.command"), 0o755);
  writeFileSync(join(packDir, "Start-App.command"), macStart, "utf8");
  chmodSync(join(packDir, "Start-App.command"), 0o755);
  writeFileSync(join(packDir, "Start-App.bat"), winStart, "utf8");

  const readme = readmeFor(name, extra);
  writeFileSync(join(packDir, "先读我.txt"), readme, "utf8");
  writeFileSync(join(packDir, "README.txt"), readme, "utf8");

  rmSync(zipPath, { force: true });
  execSync(`zip -r -X -q "${zipPath}" "${name}" -x "*.DS_Store"`, { cwd: releaseDir });
  const size = Math.round(readFileSync(zipPath).byteLength / 1024);
  console.log(`packed ${name}.zip (${size} KB)`);
  console.log(zipPath);
  return zipPath;
}

mkdirSync(releaseDir, { recursive: true });
packOne({
  suffix: "",
  extra: "完整版：预装当前亲选参考歌单，打开即可看到参考墙。",
});
packOne({
  suffix: "blank-ref",
  extra: "空白参考版：不预装亲选歌单，也不会自动去拉网易云。参考池是空的，请自己添加订阅。",
});
