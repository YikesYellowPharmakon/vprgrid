/**
 * 打一份别人解压就能用的 Demo 包:
 *   release/VprGrid.SYS-demo-<ver>/
 *     先读我.txt
 *     Install-Guide.html
 *     打开完整应用.command / Start-App.bat
 *     extension/          浏览器插件
 *     app/                完整应用源码(含 package.json)
 *   release/VprGrid.SYS-demo-<ver>.zip
 */
import { execSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "extension/manifest.json"), "utf8"));
const ver = String(manifest.version || "0.0.0");
const name = `VprGrid.SYS-demo-${ver}`;
const releaseDir = join(root, "release");
const packDir = join(releaseDir, name);
const zipPath = join(releaseDir, `${name}.zip`);
const appDir = join(packDir, "app");

const skipBase = (base) =>
  base === ".DS_Store" ||
  base === "node_modules" ||
  base === "README.md" ||
  base.startsWith("local-qa") ||
  base.startsWith("qa-") ||
  base.endsWith(".test.mjs") ||
  base.endsWith(".test.ts");

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
writeFileSync(join(packDir, "打开完整应用.command"), macStart, "utf8");
chmodSync(join(packDir, "打开完整应用.command"), 0o755);
writeFileSync(join(packDir, "Start-App.command"), macStart, "utf8");
chmodSync(join(packDir, "Start-App.command"), 0o755);
writeFileSync(join(packDir, "Start-App.bat"), winStart, "utf8");

const readme = [
  `VprGrid.SYS Demo ${ver}`,
  "",
  "这个压缩包里有两样东西，缺一不可：",
  "  extension/   浏览器插件",
  "  app/         完整应用源码（里面有 package.json）",
  "",
  "灰屏 = 只装了插件、没有启动 app。1.5.10 及更早的包没有 app，请改用本包。",
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
writeFileSync(join(packDir, "先读我.txt"), readme, "utf8");
writeFileSync(join(packDir, "README.txt"), readme, "utf8");

rmSync(zipPath, { force: true });
execSync(`zip -r -X -q "${zipPath}" "${name}" -x "*.DS_Store"`, { cwd: releaseDir });

const size = Math.round(readFileSync(zipPath).byteLength / 1024);
console.log(`packed ${name}.zip (${size} KB)`);
console.log(zipPath);
