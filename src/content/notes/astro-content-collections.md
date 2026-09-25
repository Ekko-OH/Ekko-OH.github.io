---
title: Astro 内容集合是怎么工作的
description: 从 Markdown 文件到页面，Astro 在构建期做了哪些事，以及为什么它不需要数据库。
date: 2026-09-24
tags: [Astro, 前端]
---

占位笔记之二。这篇本身是一篇正常的学习笔记，用来验证代码块、表格、callout 的渲染效果。

## 一句话概括

内容集合（content collections）就是**在构建期把一堆 Markdown 读成类型安全的 JS 对象**。没有数据库，没有运行时查询。

## 三个环节

### 1. 定义集合与 schema

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { notes };
```

`loader` 决定内容从哪里来 —— 这里是本地文件，也可以换成远程 API 或 CMS。`schema` 决定每篇笔记长什么样，**校验发生在构建期**，字段写错会直接构建失败，而不是线上少一篇。

### 2. 取数据

```astro
---
import { getCollection } from 'astro:content';
const notes = await getCollection('notes');
---
```

`getCollection` 的第二个参数是个过滤函数，本站用它来在线上隐藏草稿：

```ts
await getCollection('notes', ({ data }) =>
  import.meta.env.PROD ? !data.draft : true
);
```

### 3. 渲染

```astro
---
import { render } from 'astro:content';
const { Content, headings } = await render(note);
---
<Content />
```

`render()` 顺手返回 `headings`，笔记页顶部的目录就是直接用它生成的，不需要额外解析 HTML。

> [!tip] 为什么这样比"前端拉 Markdown 再渲染"好
> 所有 Markdown 在构建期就编译成了 HTML，浏览器只需要下载静态页面。首屏快，也不需要搜索引擎执行 JS 才能收录内容。

## 几个容易踩的点

| 问题 | 原因 |
| --- | --- |
| 改了 frontmatter 但页面没变 | 需要重启 dev server，schema 变更是配置级的 |
| `date` 排序不对 | YAML 里的日期会被解析成 `Date` 对象，用 `z.coerce.date()` 兼容字符串和日期两种写法 |
| 中文文件名生成不出网址 | 默认 id 走 github-slugger，中文会保留；真正会出问题的是文件名里的空格和标点 |

## 相关笔记

- [[writing-a-note]] 讲怎么在这个站里新增笔记
- [[github-pages-deploy]] 讲构建产物怎么发到线上
