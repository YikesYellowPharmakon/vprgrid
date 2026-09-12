# VprGrid.SYS

**Weekly new-album radar for experimental / underground music.**

Taste-first: you subscribe to references (playlists, RYM, AOTY, RSS, artists), pick genres, and the app screens public catalogs (ListenBrainz / MusicBrainz / Bandcamp / AOTY) into a week view. No account. Data stays on your machine.

实验 / 小众听众用的「这周听什么」：用你自己的参考当品味，再从公开目录里过筛每周新专。不用注册。

[Live demo](https://vprgrid.vercel.app) · 公开演示是空参考，改动只留在浏览器 · [使用手册](docs/USER.md)

<p align="center">
  <img src="public/og.jpg" alt="VprGrid.SYS — weekly album radar" width="840">
</p>

---

## 功能

### 参考

参考不是一份死歌单，而是一列可开关的**订阅源**。源里的专辑永远置顶、不被过滤；源里的艺人在自动雷达里加权，并豁免「流水线量产」一类规则。加源或同步时会识别风格，帮你入口味。

能订的东西：

- **网易云歌单**（最多约 1000 首，一专取一首代表曲）
- **Rate Your Music / Album of the Year** 用户页（可翻页导入；之后点同步只追加新条目）
- **RSS / Atom**（Bandcamp 艺人、厂牌 feed 等，打开应用可自动刷新）
- **追踪艺人**（整份专辑 / EP 目录当参考，新专自动靠前）
- **单张亲选**、**粘贴**（RYM 官方 CSV，或「艺人 - 专辑 (年份)」）

源可叠加、可「仅此源」对比。关掉内置默认参考，就完全换成自己的品味。仓库源码里带一份内置亲选快照；[演示站](https://vprgrid.vercel.app) 不加载它。

### 筛选（自动雷达 + 齿轮）

公开目录抓来的本周新专，按你的口味打分排序。参考亲选不受这些规则影响。

- 四个权重滑杆：**风格吻合 / 艺人水准 / 目录信号 / 封面**，拖完立刻重排
- **只看口味命中**、专辑 / EP 可分别开关
- 默认略过短周期量产、流水编号标题、薄样本高分、粗糙封面
- 可对某一周做「回扫补遗」（深翻 MusicBrainz）
- 很多新专还没打风格标签：会用**艺人风格档案**兜底，避免漏掉冷门好专

### 风格选择

「**口味 A–Z**」：27 个母类、500+ 子类（按 RYM / AOTY 风格树，氛围、电声、即兴、爵士、噪音、金属、舞曲、全球地域等都在同一套表里）。勾选即时生效。

- 默认 **全库**；你改过之后变成「自定义」
- 可自建母类 / 子类
- 「存这套口味」：给当前勾选起名，之后一键切回（多套口味可并存）

### 列表保存

「**列表**」页：自建多份名单，和参考分开——参考是品味基准，列表是你要留着看、要做成墙的收藏。

- 封面上一键加入；支持歌单链接 / 单张 / 粘贴导入
- 拖动排序、勾选后批量拷到另一份列表
- 和参考、口味一起进本机备份（清浏览器站点数据后还能接回来）

### Topster / 专辑墙

任一份列表可排成一面墙：

- 自动挑接近正方形的行列，最大 20 × 20
- 改标题、列数、背景色、间距
- **下载 PNG**
- **12 × 12 以内**可导出 `.topster`（或复制文本），到 [Topsters](https://topsters.org) 的 Import chart data 继续调网格和位置

### 完整 App 界面

浏览器里的完整工作台（本机 `npm run dev`，或演示站）：

- **按自然周**翻新专；「更早收录」装 2026 年以前的参考旧作
- 中 / 英界面；11 款皮肤（默认 Matrix），含自定义配色
- 全网搜艺人 / 专辑 / 代表曲（MusicBrainz + iTunes + Deezer，可选 Discogs）
- 详情抽屉：风格、打分依据、网易云代表曲、Apple Music / Spotify / Bandcamp 链接
- 可选 AI：读封面、艺人背景、口味画像（用你自己的密钥）
- 导出本周 HTML / JSON / CSV；可安装成 PWA

### 插件：新标签页 + 缩略图墙

`extension/` — Chrome / Edge / Arc，开发者模式加载未打包目录。

| 面 | 做什么 |
| --- | --- |
| **新标签页** | 封面缩略图墙（堆叠滑动），上有 Google 搜索；小组件：本期统计、Pitchfork 快讯、随机风格介绍 |
| **工具栏弹窗** | 迷你缩略图墙，点一下看本周 |
| **RYM / AOTY 页** | 右下角「导入到雷达」，整份列表翻页推进参考 |
| **跟完整 App** | 应用在跑时，口味 / 参考 / 主题自动同步到插件，不用复制 |

新标签页和完整 App 可一键来回切。只装插件、不跑完整 App 时，墙是空的。

---

## 本地运行

需要 [Node.js LTS](https://nodejs.org)。

```bash
npm install
npm run dev
```

打开 http://127.0.0.1:8080 。窗口不要关。Mac 也可双击 `快速启动.command`。

插件：`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `extension/`。

更细的操作见 [使用手册](docs/USER.md)，架构见 [开发者文档](docs/DEVELOPER.md)。

---

## 这不是什么

不是流媒体播放器，也不替你做「全网最热榜」。它是一个**带品味的新专过筛器**：参考决定召回，口味和齿轮决定自动雷达怎么排。
