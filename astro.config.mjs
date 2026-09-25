// @ts-check
import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';
import { unified } from '@astrojs/markdown-remark';
import remarkObsidian from './src/plugins/remark-obsidian.mjs';

// https://astro.build/config
export default defineConfig({
	// 部署在 https://seekingthemoon.github.io （用户主页仓库，根路径，不需要 base）
	site: 'https://seekingthemoon.github.io',
	// 用 @unocss/astro 而不是 unocss/astro：后者会自动塞一个 presetWind3()，
	// 会让 uno.config.ts 里的 preflight: false 失效。预设统一在 uno.config.ts 里配。
	integrations: [UnoCSS()],
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
