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

外层骨架是「左边目录树 + 右边正文」，由 `BaseLayout.astro` 里的 `.shell` 网格控制：

| 类名 | 用途 | 行为 |
| --- | --- | --- |
| `.bar` | 页头、页脚 | 铺满整个浏览器宽度，只留左右 `--gutter` 的内边距 |
| `.shell` | 侧栏 + 正文的网格 | 居中，最宽 `82rem`；左列 13rem 侧栏，右列正文 |
| `.wrap` | `main` 正文列 | 限制在 `--maxw`（46rem），**不随浏览器拉宽** |

- 笔记正文实际行宽 = `--maxw` 减两侧 `--gutter`，默认 **696px**。想调阅读宽度就改 `--maxw`。
- 屏幕窄于 **900px** 时侧栏整棵收起（顶部那几个图标仍能导航）。
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
