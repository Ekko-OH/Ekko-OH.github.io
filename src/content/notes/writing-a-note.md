---
title: 怎么在这个站上加一篇笔记
description: frontmatter 字段说明、文件命名规则，以及从 Obsidian 复制笔记时需要注意的地方。
date: 2026-09-25
tags: [说明, 写作]
---

这是一篇占位笔记，同时兼作使用说明。看完就可以删掉，或者改成你自己的第一篇笔记。

## 加一篇新笔记只要三步

1. 在 `src/content/notes/` 下新建一个 `.md` 文件
2. 顶部写上 frontmatter（见下）
3. `git push` —— 大概一分钟后线上就更新了

文件名的规则很简单：**文件名去掉扩展名就是网址**。

| 文件名 | 网址 |
| --- | --- |
| `git-basics.md` | `/notes/git-basics/` |
| `数学归纳法.md` | `/notes/数学归纳法/` |
| `os/memory.md` | `/notes/os/memory/` |

中文文件名和子目录都可以用。如果想让网址和文件名不一致，在 frontmatter 里加 `slug: 自定义地址`。

## frontmatter 字段

```yaml
---
title: 标题                      # 必填
description: 一句话摘要            # 选填，会显示在列表页
date: 2026-09-25                 # 必填，列表按它倒序排
updated: 2026-10-01              # 选填，改动较大时更新
tags: [操作系统, 内存]             # 选填，会生成标签页
draft: true                      # 选填，草稿只在本地可见
---
```

> [!warning] 只有 title 和 date 是必填的
> 少了任何一个，构建会直接报错并告诉你缺了什么 —— 这是故意的，比线上悄悄少一篇笔记好。

`draft: true` 的笔记在本地 `npm run dev` 时正常显示，但**不会**出现在线上构建里。写一半的东西可以先这么放着。

## 从 Obsidian 复制过来

可以直接把笔记正文粘过来，两种情况都处理过了：

- `[[某篇笔记]]` 会渲染成指向 `/notes/某篇笔记/` 的链接，只要那篇笔记存在就能点开
- `> [!note] 标题` 这种 callout 会渲染成带颜色的提示块，常见类型（warning、tip、example 等）都有对应配色

> [!example] callout 长这样
> 这是 `> [!example]` 的效果。支持的写法包括 `[!note]`、`[!tip]`、`[!warning]`、`[!danger]`、`[!question]`、`[!example]` 等等。

有两个地方需要手动改一下：

1. **图片**：Obsidian 用 `![[图片.png]]` 或者相对路径，静态站里找不到。把图片放进 `public/images/`，正文里写 `![说明](/images/图片.png)`
2. **嵌入笔记**：`![[另一篇笔记]]` 不会真的把内容嵌进来，只会显示成一行提示文字

## 相关笔记

- [[astro-content-collections]] 了解一下笔记是怎么被渲染出来的
- [[github-pages-deploy|部署流程]] 看看 `git push` 之后到底发生了什么
