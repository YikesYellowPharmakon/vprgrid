#!/usr/bin/env node
/**
 * 把当前应用打成「公开演示」推到 Vercel 临时地址(不必先登录):
 * 空参考、不拉亲选歌单、顶栏标明演示。本机工作区不会被改成空白参考。
 *
 *   npm run deploy:demo
 *
 * 需要本机已装 Vercel CLI(`npx vercel` 即可)。若提示认领,打开它打印的 claim 链接。
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  VITE_VPRGRID_DEMO: "1",
  VITE_AUTH_ENABLED: "false",
};

const res = spawnSync(
  "npx",
  [
    "vercel",
    "deploy",
    "--yes",
    "--prod",
    "--project",
    "vprgrid",
    "-b",
    "VITE_VPRGRID_DEMO=1",
    "-b",
    "VITE_AUTH_ENABLED=false",
    "-e",
    "VITE_VPRGRID_DEMO=1",
    "-e",
    "VITE_AUTH_ENABLED=false",
  ],
  { cwd: root, env, stdio: "inherit" },
);
process.exit(res.status ?? 1);
