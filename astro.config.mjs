// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkObsidian from './src/plugins/remark-obsidian.mjs';

// https://astro.build/config
export default defineConfig({
	// 部署在 https://seekingthemoon.github.io （用户主页仓库，根路径，不需要 base）
	site: 'https://seekingthemoon.github.io',
	markdown: {
		// Astro 7 默认用 Sätteri 处理器，但它不跑 remark 插件。
		// 这里显式选回 remark/rehype 管线，才能用下面这个插件处理
		// Obsidian 的 [[wikilink]] 和 > [!note] callout 语法。
		processor: unified({
			remarkPlugins: [remarkObsidian],
		}),
		shikiConfig: {
			// 跟随系统深浅色自动切换代码配色
			themes: { light: 'github-light', dark: 'github-dark' },
			wrap: true,
		},
	},
});
