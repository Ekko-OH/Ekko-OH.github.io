---
title: GitHub Pages 自动部署是怎么跑起来的
description: 从 git push 到线上可访问，中间经历了什么；以及为什么站点仓库叫 seekingtheMoon.github.io。
date: 2026-09-23
tags: [GitHub, 部署]
---

占位笔记之三，内容讲的是这个站自己的部署方式。

## 为什么要叫 `seekingtheMoon.github.io`

GitHub Pages 有两条命名规则：

- 仓库叫 `<用户名>.github.io` → 站点发布在 `https://<用户名>.github.io/`（根路径）
- 其他任何名字的仓库 → 站点发布在 `https://<用户名>.github.io/<仓库名>/`（子路径）

站点内部链接如果写成 `/notes/xxx/` 这种绝对路径，放在子路径下就会全部 404。所以个人站选第一种，省掉一整套 `base` 路径的处理。

> [!warning] 注意区分同名仓库
> `seekingtheMoon/seekingtheMoon`（仓库名等于用户名）是 GitHub 的**个人资料 README** 特殊仓库，不是主页仓库。用它发 Pages 只会挂在子路径下。

## 部署流水线

推送到 `main` 之后，`.github/workflows/deploy.yml` 会启动：

```text
push to main
   ↓
[build job]  checkout → 安装依赖 → astro build → 上传 dist/ 作为 artifact
   ↓
[deploy job] 下载 artifact → 发布到 GitHub Pages 环境
```

关键的三行权限配置：

```yaml
permissions:
  contents: read   # 读仓库代码
  pages: write     # 写 Pages
  id-token: write  # OIDC，让 Actions 拿到部署凭证
```

`id-token: write` 是 GitHub 后来引入的无密钥部署方式：Actions 用短期令牌向 Pages 证明身份，不需要你在仓库里存任何密钥。

## 本地和线上的差别

| | 本地 `npm run dev` | 线上构建 |
| --- | --- | --- |
| 草稿笔记（`draft: true`） | 可见 | 隐藏 |
| 构建时机 | 按需编译 | 每次 push |
| 路径 | `localhost:4321` | `https://seekingthemoon.github.io` |

因为草稿的过滤条件写的是 `import.meta.env.PROD`，所以「本地看得见、线上看不见」是符合预期的行为，不是 bug。

## 出错的时候看哪里

1. 仓库的 **Actions** 标签页 —— 构建日志，报错信息通常很直白（比如 frontmatter 少了字段）
2. 仓库 **Settings → Pages** —— 确认 Source 选的是 **GitHub Actions**，而不是某个分支
3. 线上页面样式全丢 —— 多半是 `astro.config.mjs` 里的 `site` 配错了

## 相关笔记

- [[astro-content-collections]] 讲内容在构建期是怎么被读进来的
- [[writing-a-note]] 讲怎么写一篇新笔记
