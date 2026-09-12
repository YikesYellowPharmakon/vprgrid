# VprGrid.SYS · 每周新专雷达 — 开发者文档

[English](DEVELOPER.en.md) · [中文](DEVELOPER.md)

面向实验音乐听众的「2026 每周新发行」筛选器:以**多源参考设置**为品味基准(内置默认参考 364 张专辑 100% 硬性召回;可叠加网易云歌单 / RYM / AOTY / RSS / 艺人追踪等任意多个源),叠加 ListenBrainz 公开目录的自动抓取,按自然周分组展示。配套一个 Chromium 浏览器插件(`extension/`):新标签页 + 工具栏弹窗的缩略图墙,以及 RYM/AOTY 列表页一键导入。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | React 19 + TanStack Start(SSR + Server Functions) |
| 路由 / 数据 | TanStack Router + TanStack Query |
| 样式 | Tailwind CSS v4(设计令牌驱动的多主题) |
| 组件 | Radix UI + 自封装 `src/components/ui/` |
| 状态 | zustand(persist 到 localStorage,无后端数据库) |
| 构建 | Vite 8,产物为 Vercel 目标(nitro preset) |
| QA | Playwright(冒烟脚本)+ node:test |

要求 **Node 22+**。无数据库、无账号体系:所有用户数据(口味、收藏、主题等)存浏览器 localStorage 键 `grain-friday-v4`。

## 快速开始

```bash
npm install
npm run dev          # 开发服务器,0.0.0.0:8080
npm run typecheck    # TypeScript 检查
npm run build        # 生产构建(输出 .vercel/output)
npm run lint         # ESLint
node --test scripts/gold-recall.test.mjs   # 默认参考数据回归测试
```

## 目录结构(应用代码)

```
src/
├── routes/
│   ├── __root.tsx            # 文档壳:字体、主题预加载脚本、Provider
│   └── index.tsx             # 首页 loader(按当前自然周取数)
├── components/
│   ├── grain-app.tsx         # 主界面:周导航、参考标准区、自动雷达、搜索、导入桥、自动刷新
│   ├── ref-sheet.tsx         # 参考设置面板(源列表/链接订阅/艺人追踪/粘贴导入/同步码)
│   ├── album-sheet.tsx       # 专辑详情抽屉(代表曲、收听链接、AI 读封面)
│   ├── taste-sheet.tsx       # 口味 A–Z 编辑器(可自增母类/子类、存自定义口味)
│   ├── theme-sheet.tsx       # 皮肤选择器
│   ├── vault-panel.tsx       # 本机备份一栏(上次备份/立即备份/两步确认恢复)
│   └── sleeve.tsx            # 封面组件(CAA / 网易云图源)
└── lib/
    ├── store.ts              # zustand 全局状态(persist)
    ├── vault.ts              # 本机档案:快照/写入/空白判定/自动接回
    ├── themes.ts             # 皮肤清单与 applyTheme
    ├── export.ts             # CSV / JSON / ICS / 离线 HTML 导出
    └── catalog/
        ├── gold-2026.json    # ★ 内置默认参考数据(364 张,由脚本生成,勿手改)
        ├── gold.ts           # 参考标准模块:buildReference(归周、去重键),支持任意条目集
        ├── sources.ts        # ★ 参考设置源:类型/合并去重/粘贴解析/导入桥编解码/URL 识别
        ├── import-sources.ts # ★ Server Functions:艺人(MB 全分页)/RSS/RYM·AOTY 直抓/Apple
        ├── playlist-import.ts # Server Function:导入任意网易云歌单为参考
        ├── api.ts            # getWeekCatalog:ListenBrainz 抓取 + MB 日期直查补全 + 艺人窗口计数
        ├── search.ts         # Server Function:全网检索聚合(MB/iTunes/Deezer/Discogs)
        ├── score.ts          # 打分/排序/过滤(含流水线规则)
        ├── genres.ts         # 风格分类体系(27 母类,风格介绍库并入旧母类)与推断;默认全库
        ├── artists.ts        # 实验乐艺人名册(艺人分量)
        ├── analyze.ts        # ★ AI 接口:封面识别(见下)
        ├── artist-ai.ts      # ★ AI 接口:艺人背景分析(四维度,不确定留空)
        ├── listen.ts         # Apple/Spotify/网易云/Bandcamp 链接解析
        ├── week.ts           # 周五/ISO 日期工具
        └── weeks.ts          # 自然周(周一–周日)分组与格式化
```

`scripts/`、`server/`、`public/__grok/` 为构建平台脚手架,**不要删改**。

## 数据流

一周的展示列表 = **参考标准置顶区 + 自动雷达补充区**:

1. **参考标准(权威)** — 由 zustand 持久化的**订阅源列表 `refSources`** 合并而成(`sources.ts` 的 `mergeSourceEntries`,按 artist||title 去重):内置默认参考(`gold-2026.json`,构建期打进 bundle)+ 任意多个网易云 / RYM / AOTY / RSS / 艺人追踪 / 粘贴 / 手动源,每个源可单独开关、同步、删除。`gold.ts` 的 `buildReference(entries)` 把每张专辑按发行日期归入自然周(`weeks.ts` 的 `weekKeyOf`),早于 2026-W01 的进 `earlier` 补遗桶,并产出 artist||title 去重键集。**任何过滤规则都不作用于参考条目**——这是硬性召回约束,默认数据由 `scripts/gold-recall.test.mjs` 守护。旧版单歌单数据(`refPlaylist`/`refExtras`)由 persist `migrate`(version 2)自动迁移成订阅源。
2. **自动雷达(动态)** — 首页 loader / 周切换时调 Server Function `getWeekCatalog({ friday, weekStart, weekEnd, deep? })`:并行拉 **ListenBrainz fresh-releases**(21 天窗口,30 分钟内存缓存)与 **MusicBrainz 日期直查补全**(`loadMbWeek`:按 `firstreleasedate` 范围深翻页,单周最多 2000 条,带 1 req/s 限速、503 重试与 15s 时间预算——MusicBrainz 是全网发行注册中心,零听众的冷门新专靠它兜底),过滤合辑/原声等,并行补齐标签与热度,并统计**每位艺人在窗口内的专辑数**(`artistWindowReleases`,流水线判定的核心信号)。`deep: true`(界面上的「回扫补遗」按钮,任意周可用)会绕过两级缓存、把上限提到 **6000 条 / 预算 60s**,回填旧周漏网的发行,结果直接写回 react-query 缓存。第三路并行拉 **Bandcamp Discover 新上架池**(`loadBandcampWeek`:官方 robots.txt 白名单接口 `POST /api/discover/1/discover_web`,按 12 个风格标签面各翻 2 页 / 深扫 4 页,窗口内发行转成合成 `bc-` id 条目混入主池;跨标签命中合并标签、按 艺人|标题 与 MB/LB 去重;粗筛掉纯 emoji 标题与 <3 轨的散曲上传)——大量只在 Bandcamp 发行的实验/氛围/即兴音乐靠它进池,封面与链接直连 Bandcamp,不走 CAA;打分层对零关注的 Bandcamp 自发上架温和降权(-10),`hydrate` 会过滤合成 id 防止污染 MBID 批量接口。**AOTY 走预抓取 JSON 缓存**:AOTY 全站套 Cloudflare,只有真实 Chromium 能过墙(~4s),把无头浏览器塞进 Web 服务进程会让每次缓存失效卡几十秒、且 Vercel 无浏览器可用,所以由独立脚本 `scripts/scrape-aoty.mjs`(`打开程序.command` 启动时后台跑一次 / 手动 `npm run scrape:aoty`)用 Playwright 过墙抓发行页,落地 `src/lib/catalog/data/aoty-cache.json`;`loadAotyWeek` 只读该文件(5 分钟内存缓存),按窗口过滤。AOTY 的核心价值是它的**用户评分**——按 艺人\|标题 注入到 MB/LB/Bandcamp 的同名条目,给零听众/零评分但有风格的好专辑补上真实关注度信号(直接缓解「无人关注的 ambient 流水线」误入),AOTY 独有条目(发行页不给风格标签)在严格口味下多被过滤,属预期。**RYM 无法抓取**:它在 Cloudflare 之外还套自家二级 "Loading..." 拦截,真实 Chrome + 持久化 profile + 反自动化特征都过不去——RYM 清单走浏览器插件在真实登录会话里读页面。AllMusic 同样 403。合并池单周截断 600 张进入打分。
   补齐阶段还会填充**艺人级风格 `artistGenres`**(两段,均有 24h 内存缓存):① 批查 ListenBrainz `metadata/artist`(即 MusicBrainz 艺人 genre 库,每请求最多 600 位、缺发行风格的艺人优先);② 对发行与艺人都零标签的,**回翻艺人在 MusicBrainz 的历史发行**(browse + `inc=tags`,1 req/s 顺序抓,普通请求预算 6s、深扫 25s)聚合过往作品标签——覆盖面随每次缓存重建与用户回扫逐步累积。很多高质量新发行的发行页还没人打标签,这条兜底是防漏的关键。雷达 API 带 `debug=1` 可看覆盖统计。
3. **客户端排序** — `rankAlbums`(`score.ts`):口味/艺人/目录信号/封面四维加权(权重可调),依次执行垃圾词过滤(功能向白噪音/助眠/ASMR 等大词库)→ **流水线过滤**(窗口内 ≥3 张即拦)→ 粗糙封面过滤 → 薄评分过滤 → 严格口味过滤(必须命中口味且综合分 ≥40 兜底线)→ 同艺人降权。**口味分是复合维度**:发行级风格命中全权重,`artistGenres` 艺人级命中按 0.7 折计入(纯艺人命中起点也略低),严格口味过滤同时认两级命中;参考池画像贴合度里艺人级风格按 0.8 折参与;发行无风格但艺人风格清晰时目录信号 +6。入选理由会标明「艺人风格贴口味」。与参考标准重复的自动条目用 `reference.dupKeys` 去重。**参考池艺人集合 `refArtists`**(所有开启源里的艺人 + 艺人追踪源目标)会:艺人维度直接给 82 分、豁免流水线/粗糙封面/薄评分/严格口味过滤;**参考池风格画像 `refProfile`**(`buildRefGenreProfile`:参考池各风格出现频率归一化)对贴合画像的新专辑最多再 +10 综合分——这就是「品味随参考自动调整」与「艺人追踪」的实现。用户可在结果列表/网格里直接删除(`hidden`,可撤销)。

### 风格分类体系与口味预设

`genres.ts` 分两层数据源:`CORE_SOURCE`(原始 13 个实验母类)与 `EXPANSION_SOURCE` + `EXPANSION_EXTRA`(按 RYM / AOTY 总风格树扩充的 14 个新母类与既有母类的补充子类),再经 `rare-families.ts` 把风格介绍库能对上的条目并进旧母类(撞名跳过,不另开母类),仍是 **27 母类**。导出口味集合:

- `ALL_TASTE` = 全部内置子类,**`DEFAULT_TASTE` 等于它**;
- `BASELINE_TASTE` 只给存档升级对照(旧默认:核心谱系去掉 `rock-post` 与 `internet-microgenre`);`normalizePersistedTaste` 会把还停在这份旧集合或空数组的存档升成全库;
- `tastePreset(taste)` 判定当前口味属于 `all` / `custom`,主页芯片与口味表的预设按钮都用它。

用户自己存的口味另走 store 里的 `tastePresets: TastePreset[]`(`{ id, name, ids, savedAt }`,`saveTastePreset` 同名覆盖、`applyTastePreset` 整份替换 `taste`),进 `partialize` 与本机档案;口味表顶部的「我的口味」渲染它,当前勾选与某份存档集合相等时点亮那枚标签。

风格推断 `inferGenres` 采用**双层匹配**防误判:标签 + 官方二级类型(strong)按全部同义词匹配;标题 + 艺人名(weak)只允许「有区分度」的同义词命中(多词短语或 ≥7 字符)——否则标题里一个 "House"/"Trap" 就会污染结果。

### 参考设置源(多源模型)

`sources.ts` 定义 `RefSource { id, kind, label, url, detail, enabled, autoSync, entries, lastSync }`,kind ∈ builtin / netease / rym / aoty / rss / artist / paste / manual。导入路径:

- **链接订阅**(`ref-sheet.tsx` 的 `detectSourceKind` 自动识别):网易云 → `playlist-import.ts`;**RYM → 首次导入仍走专属卡片**(插件 / 粘贴),建成绑定 URL 的 `rym` 源后可「立即同步」与打开时自动刷新;`refreshLinkedSource` 先试 `importWebList`,被 Cloudflare 拦则 POST `/api/ref-bridge` 排队,插件 `bg.js` 后台打开原链接(`?vprrefresh=1`),content script 翻页后 `complete`,应用轮询合并(`mergeGoldEntries`,只追加不覆盖)。AOTY 同路。插件导入桥按 URL upsert,不再重复建源。RSS/Atom → `importRss`;Apple Music → `importApple`。
- **艺人追踪**:`importArtistRef` 精确匹配 MusicBrainz 艺人后**全量分页**(每页 100,1.1s 限速,上限 600)拉取专辑/EP,封面走 Cover Art Archive。
- **粘贴兜底**:`parsePastedRef` 支持 RYM 官方导出 CSV(Title/First Name/Last Name/Release_Date)、通用 CSV 和逐行「艺人 - 专辑 (年份)」;多页内容可分次粘贴,去重合并。
- **插件导入桥**:插件把整份列表编成 base64url JSON,开新标签页 `/#refimport=<payload>`;`grain-app.tsx` 挂载时解码(`decodeImportPayload`)落成一个源。超大列表自动降级为剪贴板 + `#refimport=clipboard` 提示。RYM 链接的视图类型(年份评分/总评分/愿望单追踪)由 `describeRymUrl` 标注进 `detail`。
- **自动刷新**:`autoSync` 的源(网易云/RSS/艺人)在应用打开约 2.5s 后静默重拉,1 小时节流(`lastSync`)。

### 只读 API(浏览器插件)

`src/routes/api/radar.ts`(TanStack Server Route,CORS `*`):`GET /api/radar?week=<周一>&taste=<风格id逗号列表>` 返回该周内置参考 + 服务端按口味过筛的自动雷达(≤40 条,15 分钟 CDN 缓存)。

`src/routes/api/sync.ts`(CORS `*`,内存存储):**免复制直连同步**。应用前端在口味 / 参考池 / 主题变化后 1.2s(`grain-app.tsx` 的 effect,负载由 `src/lib/sync.ts` 的 `buildSyncCode` 构建)`POST /api/sync` 推送最新负载;插件打开时 `GET /api/sync` 拉取并落盘到 `chrome.storage.local`(拉不到则回退已存同步码)。「复制同步码」按钮保留为备份路径,剪贴板不可用时走 `copyText` 的 execCommand 兜底并提示直连已完成。

### 本机档案(清浏览器数据不丢)

参考池与列表原本只在 localStorage + IndexedDB(`grain-storage.ts`)里,浏览器一清站点数据就归零。`src/routes/api/vault.ts` 把「用户自己攒出来的那部分状态」落到跑着应用的机器上:

- **文件**:`.data/vault.json`(已 gitignore),`VPRGRID_VAULT_DIR` 可改目录。写入前先把当前那份 `rename` 成 `vault.prev.json`,再用临时文件原子替换;`GET /api/vault?prev=1` 能读回上一份。
- **进档案的字段**由 `src/lib/vault.ts` 的 `FIELDS` 决定:`refSources` / `userLists` / `taste` / `tastePresets` / 自定义母类子类 / 过滤与主题偏好。**不进**:`aiConf`(含密钥)、`artistNotes` 与 `sleeves`(可再生成的 AI 缓存)。
- **两条铁律**:① 只有本地「空白」(只有默认空收藏 + 只有内置源 + 没有存过口味,`isBlank`)时才自动 `applySnapshot`,已经有内容时绝不覆盖用户手上的东西;② 空白状态绝不写档案,否则清完数据后的第一次自动写入会把档案抹平。
- **时机**:`grain-app.tsx` 的水合 effect 在 `ensureSavedList` 之后 `await maybeRestoreVault()`,恢复成功弹一句 toast,然后 `startVaultWatch()`(订阅 store,4 秒防抖 + 页面隐藏时立刻 flush)。恢复的重字段由既有的 `watchHeavyPersist` 顺带写回 IndexedDB。
- **只读部署**(Vercel)写入必然失败,`POST` 返回 `ok:false, reason:"readonly"`,前端静默降级,只在「下载到 Mac」面板里把那一栏文案换成提示手动导出。

### 流水线规则(高产低区分度艺人)

`score.ts` 的 `isAssemblyLine`,纯规则、不写死艺人名:

- 窗口(约 21 天)内同一艺人 **≥ 4 张**专辑/EP → 拦截;
- **≥ 2 张** 且标题呈序列化模式(日期戳、`0010` 式长编号、`Vol. 12` 式大编号结尾)→ 拦截;
- `album.gold === true` 无条件豁免。

回归基准:Michiru Aoyama 在自动源默认推荐必须为 0,而他在默认参考里的亲选专辑《Still Air 0010》必须保留并可搜索。

## AI 接口(封面识别)

`src/lib/catalog/analyze.ts` 的 `analyzeCover` 是三个 AI 调用点之一(另两个:艺人背景分析、AI 口味画像,见下),全部**服务端专用**(Server Function,密钥不进浏览器)。它把专辑封面图 + 口味上下文交给视觉模型,返回:

```ts
type CoverReading = {
  sleeveScore: number;      // 0–100,低于 45 视为粗糙封面
  aesthetic: string;        // 5–8 词英文审美概括
  matchedGenres: string[];  // 命中的流派 id
  notes: string;            // 两句中文点评
};
```

接口协议为 **OpenAI 兼容的 `/chat/completions`(多模态)**。配置解析集中在 `src/lib/catalog/ai-shared.ts` 的 `resolveAi(override?)`,**两级优先**:

1. **用户自设(BYOK)**:头部 ✦ 图标打开 `ai-sheet.tsx`,密钥/地址/模型存 zustand(`aiConf`,本机 localStorage),客户端在每次 AI 调用里作为可选 `ai` 字段传给 Server Function;`testAi` 提供最小请求的连接测试。密钥不落库、不进日志。
2. **部署方环境变量**(用户没填时的回退,全部无内置默认值):

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `AI_API_KEY` | 无 | 不设则 AI 功能不可用 |
| `AI_BASE_URL` | 无 | OpenAI 兼容根地址 |
| `AI_MODEL` | 无 | 模型名;读封面需支持图像 |

本地开发示例:

```bash
AI_API_KEY=sk-xxx AI_BASE_URL=https://api.openai.com/v1 AI_MODEL=gpt-4o npm run dev
```

安全约束(请保持):调用只由用户点击「读封面」触发,客户端每会话限 8 次(`album-sheet.tsx` 的 sessionStorage 计数);不配置密钥时应用完全可用,只是该按钮提示「暂不可用」。若要扩展 AI 能力(如每周摘要、口味推荐),复用 `aiConfig()` 并遵守同样的「用户触发 + 限额 + 服务端」三原则。

## 主题系统

皮肤 = 一组 CSS 设计令牌覆盖,**只换色彩/字体/材质/动效,不改信息结构**:

1. `src/styles.css`:新增 `html[data-theme="你的主题"] { --color-* ; --font-* ; --radius-* ; --shadow-border ; --motion-* }`,可选 `html[data-theme="..."] body { background-image: ... }` 材质;
2. `src/lib/themes.ts`:在 `THEMES` 数组加一项(id/label/note/三色小样),`ThemeId` 联合类型同步;
3. 需要新字体时在 `__root.tsx` 的 Google Fonts 链接追加。

选中的主题持久化在 zustand;`__root.tsx` 里有一段内联脚本在首帧前从 localStorage 读取并设置 `data-theme`(自定义主题还会注入颜色变量),避免刷新闪烁。

**自定义主题**:`themes.ts` 的 `CustomTheme`(底色/文字色/强调色/背景图 URL/纹理)由 `applyTheme(theme, custom)` 在运行时注入根节点 CSS 变量,层次色(surface/raised/muted/subtle/border)用 `color-mix` 从三个基色推导;背景图与纹理层由 `styles.css` 里 `html[data-theme="custom"][data-custom-texture=…]` 的规则渲染,始终叠一层底色遮罩保证可读性。编辑器在 `theme-sheet.tsx`。

**质感反馈**:`styles.css` 基础层给所有 `button` / `[role="button"]` 统一的按压回弹(`active` 缩放)与过渡令牌;卡片悬停浮起用 `--shadow-border-hover`,封面推近由 `sleeve.tsx` 的 `group-hover` 缩放实现。

## 界面语言(i18n)

`src/lib/i18n.ts` 集中管理**全部界面文案**:`zh` 为基准词典,`en` 以 `Dict = typeof zh` 强制键位对齐(漏译直接编译报错),带参数的文案是函数(如 `daysToFriday(n)`)。组件里 `const t = useT()` 取当前语言词典;语言状态存 zustand(`lang: "zh" | "en"`,持久化),头部地球图标按钮切换,同时更新 `<html lang>`。周标签由 `weeks.ts` 的 `formatWeek(key, lang)` 输出双语版本;主题描述的英文对照在 `THEME_NOTES_EN`。**只翻界面框架文案**——专辑/艺人/风格标签/AI 输出等数据保持原文。新增文案时在 `zh` 和 `en` 各加一个键即可。

## AI 接口(艺人背景分析)

`src/lib/catalog/artist-ai.ts` 的 `analyzeArtist` 与封面识别共用同一组环境变量(`AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`),纯文本调用。输入艺名 + 一张参考专辑(用于消歧),返回四个维度:

```ts
type ArtistNote = {
  works: string[];        // 代表作品(≤5,含年份)
  lineage: string;        // 风格谱系:源流/场景/脉络
  achievements: string;   // 互联网可查的成就与评价
  similar: string[];      // 相似艺人/团体(≤6)
};
```

提示词硬性要求宁缺毋滥:模型无法确认艺人身份或某维度无可靠资料时返回空值,前端对应块整块隐藏(全空时显示留空说明)。结果按小写艺名缓存在 zustand(`artistNotes`),不重复计费。

## AI 接口(口味画像)

`src/lib/catalog/taste-ai.ts` 的 `analyzeTaste` 是第三个 AI 调用点,同一组环境变量,纯文本调用。入口在**口味 A–Z 表顶部的「AI 口味画像」卡片**,由用户点击触发。客户端(`taste-sheet.tsx` 的 `runAiTaste`)组装载荷:

- 参考池**高频艺人**(出现次数 Top 30)与**均匀采样的 120 张专辑**(整池等距抽样,避免只看到最前面的条目);
- 已启用子类与未启用候选子类,均为 `id|标签` 行(各 ≤400)。

模型返回 `TasteNote`:`profile`(2–3 句取向画像)、`keywords`(≤8 审美关键词)、`enable` / `disable`(建议开/关的子类 id,**服务端会再过滤一遍,只认载荷里给过的 id,防幻觉**)、`artists`(≤8 个值得追踪的艺人)。前端渲染成画像段落 + 关键词芯片 + 建议开关芯片 + 艺人列表,「一键应用建议」直接改 `taste`(开 enable、关 disable);艺人列表提示用户去「参考设置 → 追踪艺人」订阅。与其他 AI 功能相同:未配密钥时按钮提示暂不可用,应用其余功能不受影响。

## 参考标准数据维护

用户侧换参考不需要动代码:应用内「参考设置」面板即可增删源。以下脚本只用于更新**内置默认参考**:

```bash
node scripts/update-gold-playlist.mjs           # 重新拉取默认歌单并重写 gold-2026.json
node scripts/update-gold-playlist.mjs <歌单ID>  # 换用其他歌单作内置默认
node --test scripts/gold-recall.test.mjs        # 校验(张数断言随歌单规模更新)
```

脚本会全量分批拉取(绝不只抓前 10 首)、补拉缺失发行日期、对缺失者用加入歌单时间近似归周(标 `dateApprox`)。

## QA

```bash
node scripts/local-smoke.mjs http://127.0.0.1:8080/ dev   # 桌面+移动截图、控制台错误、召回探针
node scripts/local-qa-deep.mjs                             # 参考周视图、Michiru 回归、皮肤切换
node scripts/local-qa-sources.mjs                          # 多源订阅:迁移/粘贴/CSV/艺人追踪/导入桥/同步码/API
node scripts/local-qa-taste2.mjs                           # 口味扩库/全库预设/结果删除/源多选单选/专辑直加
node scripts/local-qa-ext.mjs                              # 浏览器插件:真实加载,新标签页/弹窗/设置/同步码
```

截图输出到 `screenshots/`。注:`npm run test` 里平台自带的 `grok-pwa-plugin.test.mjs` 在存在自定义分享卡(`public/og.jpg`)的工作区会有若干既有失败,与应用逻辑无关。

## 部署与分发

**Web 部署(推荐)** — 项目按 Vercel 目标构建:

```bash
npm run build            # 生成 .vercel/output(静态资源 + Serverless 函数)
npx vercel deploy --prebuilt --prod
```

在托管平台的环境变量里配置 `AI_API_KEY` 等(可选);另可配置 `DISCOGS_TOKEN`(Discogs 个人访问令牌)为全网检索启用 Discogs 官方 API,不配则该源自动跳过。用户拿到 URL 即可使用,并可作为 PWA 安装到本机(见使用者文档)。也可推到 GitHub 后在 Vercel 控制台一键导入,构建命令 `npm run build`。

**公开演示站** — `npm run deploy:demo` 以 `VITE_VPRGRID_DEMO=1` 构建并推到 Vercel:参考池为空、不打亲选歌单、不写本机档案,顶栏标明演示。本机 `npm run dev` 不带这个变量,仍是完整个人应用。

**源码分发** — 其他开发者克隆仓库后 `npm install && npm run dev` 即可,无任何外部服务依赖(AI 可选)。

**桌面化(可选方向)** — 如需真正的安装包(.dmg/.exe),可用 Tauri/Electron 包一层 WebView 指向部署地址或本地服务;当前 PWA 安装已覆盖绝大多数桌面场景。

## 浏览器插件(`extension/`)

Manifest V3,纯静态无构建步骤(vanilla JS + `shared/radar.css` 复刻 GRAIN 令牌):

- `newtab.html` / `popup.html` + `shared/radar.js`:缩略图墙,数据来自 `/api/radar`;口味 / 主题优先走 `GET /api/sync` 直连(免复制),回退本地同步码(`chrome.storage.local`,注意**不要**用 storage.sync——同步码可达几十 KB,超其配额);新标签页上侧小组件为**本期统计**(参考 / 扫描池 / 过筛 / 流水线,未扫描显示省略号)、**音乐快讯**(Pitchfork RSS)和**风格介绍**,另有墙宽滑杆(`wallW`);风格库在 `shared/genres.js`,动态 import 并合并去重 `genres-world.js` + `genres-net.js`;两份数据文件缺失或写坏时 `loadGenres()` 只返回能读到的那部分,全空则整张卡片隐藏(不会白页)。抽签只从没看过的里挑、看过的 id 存 `genreSeen`,整库看完自动清零;首屏静态数字雨在 `prerain.js`(MV3 的 CSP 不执行内联脚本,别搬回 HTML 里);
- `content/rym.js` / `content/aoty.js`:注入「导入到 GRAIN 雷达」按钮,在用户会话内 DOMParser 翻页收集(≤60 页,900ms/页),经 `#refimport=` 桥递给应用;
- `options.html`:应用地址 + 同步码;
- 图标由 `node scripts/gen-ext-icons.mjs` 生成。

安装与使用见 `extension/README.md`。改选择器时注意 RYM/AOTY 改版风险——应用端的粘贴导入是永远可用的兜底。
