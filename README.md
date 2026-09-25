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

## 站点配置

| 想改什么 | 改哪里 |
| --- | --- |
| 站名、作者、简介、导航 | `src/site.config.ts` |
| 配色（浅色 + 深色） | `src/styles/global.css` 顶部的 CSS 变量（`:root` 和 `:root[data-theme='dark']` 两块） |
| 域名 | `astro.config.mjs` 的 `site` |
| 关于页 | `src/pages/about.astro` |
| 图标 | `public/favicon.svg` |
| 主题切换按钮 | `src/components/ThemeToggle.astro` |

## 目录结构

```text
src/
├── content.config.ts        # 笔记集合的 schema（frontmatter 字段定义）
├── content/notes/           # ← 笔记都在这里
├── layouts/BaseLayout.astro # 全站骨架：head、导航、页脚
├── components/              # 笔记卡片、日期
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
