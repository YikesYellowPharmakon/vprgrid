# VprGrid.SYS · 每周新专雷达

面向实验音乐听众的「2026 每周新发行」筛选器:以**多源参考订阅**为品味基准(内置默认参考 364 张 100% 召回,可叠加网易云歌单 / RYM / AOTY / RSS / 艺人追踪,输入什么品味就跟着什么调整),叠加公开目录自动抓取,按自然周分组,支持口味定制与 11 款界面风格(默认 Matrix,全部带动态背景)。无账号、无数据库,数据存本机。配套 Chromium 浏览器插件(`extension/`):新标签页 + 工具栏弹窗的封面缩略图墙,RYM/AOTY 列表页一键导入。

## 快速开始

关掉 Cursor 或重启电脑后,可双击主目录里的 `快速启动.command`。或打开终端,进入本项目再启动(窗口不要关):

```bash
cd "/Users/ye/Library/Mobile Documents/com~apple~CloudDocs/Playground/NewMusic/V1"
npm run dev
```

浏览器打开 http://127.0.0.1:8080 。第一次或依赖被删过时,先 `npm install` 再 `npm run dev`。

发给朋友用 `npm run pack:release`。1.5.14 起压缩包里同时有 `extension/` 和 `app/`(完整应用源码)。朋友进入 `app` 后 `npm install` 再 `npm run dev`。旧包 1.5.10 只有插件,只装插件会灰屏。

可选:配置 AI 封面识别(任何 OpenAI 兼容服务)

```bash
AI_API_KEY=sk-xxx AI_BASE_URL=https://api.openai.com/v1 AI_MODEL=gpt-4o npm run dev
```

## 文档

- [使用手册](docs/USER.md) — 功能导览:周视图、参考订阅、搜索、口味、皮肤、浏览器插件、导出与安装
- [开发者文档](docs/DEVELOPER.md) — 架构、数据流、多源订阅、AI 接口、主题系统、插件、部署与分发
- [插件说明](extension/README.md) — 安装、配置、RYM/AOTY 一键导入

## 部署给其他人用

```bash
npm run build
npx vercel deploy --prebuilt --prod
```

用户拿到 URL 即可使用,并可作为 PWA 安装到桌面 / 手机主屏幕。详见开发者文档「部署与分发」。
