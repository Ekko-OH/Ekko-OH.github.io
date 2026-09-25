# me

个人小站：学习笔记 + 项目记录。
线上地址：<https://seekingthemoon.github.io>

用 [Astro](https://astro.build) 构建，纯静态，托管在 GitHub Pages。
写笔记就是往 `src/content/notes/` 里丢 Markdown 文件，`git push` 之后大约一分钟自动上线。

## 本地开发

```sh
npm install
npm run dev     # http://localhost:4321
```

Astro 自带后台模式，适合挂着预览：

```sh
astro dev --background   # 后台启动
astro dev status         # 看状态
astro dev logs           # 看日志
astro dev stop           # 停止
```

其他命令：

```sh
npm run build    # 构建到 dist/
npm run preview  # 预览构建产物
```

## 加一篇笔记

在 `src/content/notes/` 下新建 `.md` 文件，**文件名去掉扩展名就是网址**：

| 文件名 | 网址 |
| --- | --- |
| `git-basics.md` | `/notes/git-basics/` |
| `数学归纳法.md` | `/notes/数学归纳法/` |
| `os/memory.md` | `/notes/os/memory/` |

中文和子目录都可以。想让网址和文件名不一致，写 `slug: 自定义地址`。

### frontmatter

```yaml
---
title: 标题                      # 必填
description: 一句话摘要            # 选填，显示在列表页
date: 2026-09-25                 # 必填，列表按它倒序排
updated: 2026-10-01              # 选填
tags: [操作系统, 内存]             # 选填，会生成 /tags/ 页面
draft: true                      # 选填，草稿只在本地可见
---
```

字段缺失或类型写错会**在构建时报错**，不会静默漏掉一篇笔记。

### 从 Obsidian 复制笔记

`src/plugins/remark-obsidian.mjs` 处理了两种语法：

- `[[某篇笔记]]`、`[[某篇笔记|显示文字]]` → 指向 `/notes/某篇笔记/` 的链接
  （用 `github-slugger` 计算 slug，和 Astro 生成笔记 id 的算法一致）
- `> [!note] 标题` callout → 带配色的提示块，见 `src/styles/global.css` 里的 `[data-callout=...]`

需要手动改的两处：

1. **图片**：Obsidian 的 `![[图片.png]]` 和相对路径在这里无效。把图片放进 `public/images/`，正文写 `![说明](/images/图片.png)`
2. **嵌入笔记**：`![[另一篇笔记]]` 不会真的嵌入内容，只显示一行提示文字

## 深浅色主题

页头右上角的按钮手动切换，选择记在 `localStorage.theme` 里。

| 情况 | 行为 |
| --- | --- |
| 没手动选过 | 跟随系统，系统切换时页面实时跟着变 |
| 手动选过 | 一直用你选的，不再受系统影响 |

实现上有两处要注意，改的时候别踩：

1. 主题写在 `<html data-theme="light|dark">` 上，CSS 用的是 `:root[data-theme='dark']`，
   **不是** `@media (prefers-color-scheme: dark)`。代码高亮的双主题切换也在那套选择器里。
2. 决定主题的内联脚本必须留在 `<head>` 里、并且放在 `<meta name="theme-color">` 之后，
   否则首屏会闪一下颜色（脚本找不到那个 meta 就没法更新浏览器地址栏配色）。

按钮本身在 `src/components/ThemeToggle.astro`，只有图标和 DOM，逻辑都在 `BaseLayout.astro` 的内联脚本里。

## 图标（astro-icon）

图标用 [astro-icon](https://github.com/natemoo-re/astro-icon)，图标集是 [Lucide](https://lucide.dev)。

```astro
---
import { Icon } from 'astro-icon/components';
---

<Icon name="lucide:moon" class="icon-moon" />
<Icon name="lucide:sun" size={20} />
```

- 图标在**构建期内联成 `<svg>`**（同一页重复出现时用 `<symbol>` + `<use>` 复用），不是图标字体、也不是 CSS 背景图。
- Lucide 的图标是 `stroke="currentColor"`，所以颜色自动跟着文字颜色走，**主题切换不用为图标做任何额外处理**。
- 图标名去 <https://icones.js.org> 查（选 Lucide 集合）。
- 尺寸默认 `1em`（跟字号走），也可以传 `size={20}` 或用 CSS 定宽高 —— 主题按钮里就是用 CSS 固定成 16px 的。
- 换/加图标集：装对应的 `@iconify-json/<集合名>`（如 `@iconify-json/tabler`），用法变成 `<Icon name="tabler:xxx" />`。

### 放自己的 SVG

把 `.svg` 丢进 `src/icons/`，用 `<Icon name="local:文件名" />` 引用（不带扩展名，支持子目录）。
astro-icon 会用 svgo 自动优化；单色图标会被改写成 `currentColor` 以跟随主题，多色图标保留原样。

> `src/icons/` 这个目录要存在 —— astro-icon 启动时会去扫描它，目录不存在会在日志里报一条 `Failed to load icons from "src/icons"` 的警告。里面目前只有一个 `.gitkeep`。

`astro.config.mjs` 里就是裸的 `icon()`，不需要配 `include`：那个选项是给 `output: 'server'` / `'hybrid'` 控制服务端打包体积用的，本站是静态输出。

## 站点配置

| 想改什么 | 改哪里 |
| --- | --- |
| 站名、作者、简介、导航 | `src/site.config.ts` |
| 配色（浅色 + 深色） | `src/styles/global.css` 顶部的 CSS 变量（`:root` 和 `:root[data-theme='dark']` 两块） |
| 正文列宽 / 左右留白 | 同上，改 `--maxw`（默认 46rem）和 `--gutter`（默认 1.25rem） |
| 域名 | `astro.config.mjs` 的 `site` |
| 关于页 | `src/pages/about.astro` |
| 图标 | `public/favicon.svg` |
| 主题切换按钮 | `src/components/ThemeToggle.astro` |

## 目录结构

```text
src/
├── content.config.ts        # 笔记集合的 schema（frontmatter 字段定义）
├── content/notes/           # ← 笔记都在这里
├── icons/                   # 自己的 SVG 放这里，用 <Icon name="local:xxx" />
├── layouts/BaseLayout.astro # 全站骨架：head、页头、侧栏+正文网格、页脚
├── components/              # 笔记卡片、日期、主题切换按钮、侧栏目录树
├── lib/notes.ts             # 取笔记、排序、标签、分组的公共逻辑
├── scripts/art-plum.js      # 梅枝背景（canvas，无依赖）
├── plugins/remark-obsidian.mjs  # Obsidian 语法适配
├── pages/
│   ├── index.astro          # 首页
│   ├── about.astro          # 关于
│   ├── 404.astro
│   ├── notes/index.astro    # 笔记列表（按年份分组）
│   ├── notes/[...slug].astro# 笔记详情（含目录）
│   ├── tags/index.astro     # 全部标签
│   └── tags/[...tag].astro  # 单个标签
└── styles/global.css
```

## 版式

外层骨架是「左边目录索引 + 右边正文」，由 `BaseLayout.astro` 里的 `.shell` 控制：

| 类名 | 用途 | 行为 |
| --- | --- | --- |
| `.bar` | 页头、页脚 | 铺满整个浏览器宽度，只留左右 `--gutter` 的内边距 |
| `.shell` | 侧栏 + 正文的容器 | 见下面的三档断点 |
| `.wrap` | `main` 正文列 | 限制在 `--maxw`（46rem），**不随浏览器拉宽** |

### 正文相对整个页面居中

侧栏**不参与**正文的水平定位，所以正文的中心始终等于视口中心
（1792px 下实测：正文 `548→1244`，中心 896 = 视口中心 896）。

按视口宽度分三档：

| 视口 | 布局 |
| --- | --- |
| **≥1280px** | 正文按整页居中；目录索引 `position: fixed` 贴在左侧，脱离布局流 |
| **900–1280px** | 空间不够放浮动侧栏，退回网格布局（13rem 侧栏 + 正文列），正文在右列内居中，会比视口中心**右偏约 128px** |
| **<900px** | 目录索引整棵收起，正文按整页居中 |

1280 这个阈值是算出来的：正文半宽 368px + 侧栏右缘 228px + 一点间隙 ≈ 1280，窄于它两者会重叠。

> 改宽屏那段媒体查询要留意**书写顺序**：它必须排在基础 `.sidebar` 规则之后，
> 否则 `position: fixed` 会被前面的 `sticky` 覆盖。这个坑踩过一次。

- 笔记正文实际行宽 = `--maxw` 减两侧 `--gutter`，默认 **696px**。想调阅读宽度就改 `--maxw`。
- 背景是纯色（`--bg` 变量）。之前试过点阵底纹，觉得吵就去掉了。
- **页脚贴底 + 文字居中**：贴底靠 `body` 是 flex 列 + `.shell { flex: 1 0 auto }`，
  居中靠 `.site-footer { text-align: center }`。
  注意 `flex: 1 0 auto` 必须加在 `.shell` 上：`main` 现在被 `.shell` 包着，不再是 `body` 的直接子项，
  写在 `main` 上不生效，短页面时页脚会浮在半空。

### 自动隐藏

只有**左侧目录索引**会隐藏，页头那排图标（首页/笔记/标签/关于 + 主题切换）**常驻显示**。

| 元素 | 显示条件 |
| --- | --- |
| 导航图标（含主题按钮） | 常驻，不隐藏 |
| 目录索引（目录树 + 标签） | 鼠标在正文里（`body:has(main:hover)`）、鼠标在侧栏上、键盘聚焦 |

- 「鼠标在正文里就显示目录索引」是为了读文章时能随手跳到别的笔记，同时平时又不占着左侧的空间。
- 目录索引平时是 `opacity: 0`，但**位置和点击热区都保留**，所以鼠标移过去就能显示、不会误点，也不会引起布局跳动。
- 淡出用 0.35s（比显示的 0.12s 慢），这样鼠标从正文移向侧栏、经过中间那段间隙时不会闪一下。
- `:has()` 在旧浏览器上会被整条忽略，退化成「目录索引只在鼠标进侧栏时显示」，不会报错。
- 触屏没有 hover，`@media (hover: none)` 里改成常显，否则目录就点不到了。
- 想关掉：删掉 `global.css` 里「自动隐藏」那一节，或把 `.sidebar` 的 `opacity: 0` 改成 `1`。

### 左侧目录树

`src/components/Sidebar.astro` + `NoteTree.astro`（递归组件），内容全部由笔记自动生成：

- **笔记**：按笔记 id 里的 `/` 分层。现在笔记都是平铺的所以只有一层；
  以后写 `os/memory.md` 这种子目录，侧栏会自动多出一级 `os`。
- **标签**：所有标签加篇数。
- 当前页会在树里高亮（`aria-current="page"` + 强调色）。

不用手动维护任何导航清单，加笔记它自己就出现。

## 梅枝背景

每个页面背后有一层慢慢"长出来"的梅枝，照 [antfu.me](https://antfu.me/talks) 的 `ArtPlum` 用原生 JS 重写，
代码在 `src/scripts/art-plum.js`，零依赖。

- **不是图片**：一个铺满视口的 `<canvas>`（`position: fixed; inset: 0; z-index: -1; pointer-events: none`）。
- **径向遮罩**：`.art-plum` 上有 `mask-image: radial-gradient(circle, transparent, black)`
  —— 正中擦成透明、越靠边越实。所以枝条只在四周出现，正文区域保持干净，可读性不受影响。
- **算法**：从视口四条边各起一条，每段 0~6px、方向抖动 ±15°，按概率分成两枝；
  每帧只推进待办队列里随机的一半，于是枝条一帧一帧"抽"出来，画完就停、不空转。

两个最容易踩的点（文件头注释里有完整说明）：

| 坑 | 说明 |
| --- | --- |
| 分叉计数器的作用域 | 那个"段数"是**沿一整棵子树共享**的计数器，不是每条路径各自的深度。前 30 段按 80% 分叉、之后一律 50%。如果按"每层深度"判，前 30 层 80% 分叉会让数量涨到 `1.6³⁰`，直接卡死 |
| 四个起点各有各的计数器 | 参考站是每个种子新建一个（默认参数），全树共用一个的话枝条会明显偏稀 |

跟参考站有两处**主动差异**：

1. **有段数上限**（`MAX_SEGMENTS = 9000`）。参考站没有上限，实测 50 秒时仍在生长（不透明像素 193k，是 20 秒时的 4 倍），
   动画会一直占着 CPU、背景一直变密。这里画到上限就停，约 7~10 秒收敛。
2. **太稀就重画**（`MIN_SEGMENTS = 4500`）。这是个"临界分支过程"，会**提前灭绝**——
   实测最稀一次只有 6948 像素、最密 27973，差 4 倍。加兜底后稳定在 24k~29k。

其他细节：

- 描边色是 CSS 变量 `--art-stroke`，明暗两套各自定义；切换主题会重画（形状重新随机）。
- 尊重 `prefers-reduced-motion: reduce`：不做逐帧动画，一次画完。
- 窗口 resize 后防抖重画；打印时整层隐藏。
- **想去掉**：删掉 `BaseLayout.astro` 里的 `.art-plum` 那个 div 和末尾的 `<script>` 即可，其余不用动。

## 文字与链接

**全站链接不用颜色区分**：继承正文颜色，用「下划线 + 加粗」表示；悬停时下划线加粗到 2px，也不变色。

```css
a {
	color: inherit;
	font-weight: 600;
	text-decoration: underline;
	text-decoration-thickness: 1px;
	text-underline-offset: 3px;
}
```

只有这几类结构性 / 装饰性链接例外，它们不加下划线：

| 选择器 | 原因 |
| --- | --- |
| `.note-item` | 整块可点的卡片，下划线会外溢到里面的日期和摘要（下划线改加在 `.note-title` 上） |
| `.nav-link` | 纯图标的顶部导航 |
| `.brand` | 站名 |
| `.tag` | 标签胶囊 |
| `.tree-link` | 侧栏导航列表；当前页改用**加粗 + 2px 下划线**标识，不再用颜色 |
| `.header-anchor` | 标题旁的 `#` 锚点，属于符号而不是文字 |

- 目前**唯一还带颜色的文字**是 callout 的标题（按类型配色：warning 橙、tip 青、danger 红）和代码高亮。前者要改成单色的话，把 `.callout::before` 的 `color` 改成 `var(--fg)` 即可。
- 想恢复彩色链接：把 `a` 里的 `color: inherit` 换成颜色变量，并在 `:root` 里补一个。

## 字体与标题

正文字体是 **[Inter](https://rsms.me/inter/)（自托管，不走 CDN）** —— 用 `@fontsource-variable/inter` 装进来，
在 `BaseLayout.astro` 顶部 `import '@fontsource-variable/inter'` 引入，构建时打包进 `dist/_astro/`。
Inter 只覆盖拉丁字符，中文会继续往 `--font-sans` 后面的 PingFang SC / 微软雅黑 等系统字体落。

字号和字重是照着参考站 [antfu.me](https://antfu.me/use) 量的（实测数据，不是估的）：

| 元素 | 值 |
| --- | --- |
| h1 | `2.25rem` (36px) / weight **500** |
| h2 | `1.5rem` (24px) / weight **500**，间距 48px / 24px |
| 正文 | 16px，行高 28px |

> **字重为什么是 500 而不是 800**：参考站的 CSS 里 h1 写的是 `font-weight: 800`，
> 但它**只装了 Inter 的 400 面**（`document.fonts` 里 7 个 unicode-range 子集全是 w400），
> 所以那个 800 是浏览器**合成的伪粗体**。实测它的 h1 渲染宽度 66.78px，
> 正好等于真 Inter 400 的宽度；按墨量算，它的观感约等于真 **500~600**。
> 另外标题常是中英混排，600 会让中文落到 PingFang Semibold、笔画明显比同行的拉丁字母重，
> 500（Inter Medium + PingFang Medium）两边才一致。想更重就改这一处数字。

换字体：改 `--font-sans` 的第一项，并替换 BaseLayout 里那行 import。

## 标题的 # 锚点

`h2`/`h3`/`h4` 悬浮时左侧浮现一个 `#`（透明度 0 → 0.5），点击跳到该小节并把 hash 写进地址栏，方便复制链接。

实现见 `src/plugins/rehype-heading-anchor.mjs`，注册在 `astro.config.mjs` 的 `rehypePlugins`。

锚点的定位有两个要点，改样式时别把其中任何一个去掉：

- `position: absolute; left: -1.15em` —— 让它待在标题左侧的空白里，**不挤动标题文字**（悬浮前后标题的 x 坐标不变）。
- `top: 50%; transform: translateY(-50%); line-height: 1` —— 和标题**垂直居中**。
  只给 `left` 不给 `top` 的话，绝对定位元素会贴在行盒顶部，看起来比标题高半截。

> 已知取舍：标题如果换行，`#` 会相对**整个标题块**居中，而不是贴着第一行。标题都很短，暂时不为这个特殊处理。

> **写这个插件时必须知道的一件事**：Astro 的 `rehypeHeadingIds` 注册在**用户 rehype 插件之后**，
> 所以插件跑的时候标题还没有 id，不能直接读 `node.properties.id`。
> 好在它的逻辑是「已有 string 类型的 id 就不动」，所以插件自己用 `github-slugger`
> （和它同一套算法、同一个实例）先把 id 算出来，它后面会原样沿用，TOC 用的也是这个 id。
> 另外插件会给 **h1–h6 全部**算 id 而不只是加了锚点的 h2–h4，否则重复标题可能出现 id 撞车。

## 部署

推送到 `main` 就自动部署，流程写在 `.github/workflows/deploy.yml`：

```text
push to main → [build] astro build → 上传 dist/ → [deploy] 发布到 GitHub Pages
```

仓库 **Settings → Pages** 的 Source 必须是 **GitHub Actions**（不是某个分支）。

为什么仓库叫 `seekingtheMoon.github.io`：GitHub Pages 只在 `<用户名>.github.io` 这个仓库名上把站点发布到根路径，
其他名字会挂在 `/<仓库名>/` 子路径下，站内那些 `/notes/xxx/` 绝对链接就会全部 404。

## 两个已知的坑

1. **换了 Markdown 插件但页面没变**：Astro 的内容层把渲染结果缓存在 `node_modules/.astro/data-store.json`，
   缓存的键是 `.md` 文件内容的摘要 —— 只改插件不改笔记时不会失效。删掉这个目录重新构建即可：
   ```sh
   rm -rf node_modules/.astro && npm run build
   ```
2. **为什么多装了 `@astrojs/markdown-remark`**：Astro 7 默认的 Sätteri 处理器不跑 remark 插件，
   而上面的 Obsidian 语法适配是 remark 插件。所以 `astro.config.mjs` 里显式选了 `unified()` 管线。
   如果哪天不需要这个适配，可以删掉插件和这个依赖，回到默认处理器。
