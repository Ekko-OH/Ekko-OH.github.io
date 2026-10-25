// @ts-check
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { unified } from '@astrojs/markdown-remark';
import rehypeHeadingAnchor from './src/plugins/rehype-heading-anchor.mjs';
import remarkMermaid from './src/plugins/remark-mermaid.mjs';
import remarkObsidian from './src/plugins/remark-obsidian.mjs';

// https://astro.build/config
export default defineConfig({
	// 部署在 https://ekko-oh.github.io （用户主页仓库，根路径，不需要 base）
	site: 'https://ekko-oh.github.io',
	// 图标：<Icon name="lucide:moon" />，图标集来自 @iconify-json/lucide。
	// 本站是静态输出，不用配 include（那个选项是给 output: 'server' 控制服务端打包体积用的）。
	integrations: [icon()],
	markdown: {
		// Astro 7 默认用 Sätteri 处理器，但它不跑 remark 插件。
		// 这里显式选回 remark/rehype 管线，才能用下面这些插件处理
		// Obsidian 的 [[wikilink]] / > [!note] 语法，以及 $…$ 公式。
		processor: unified({
			// remarkMath 要排在 remarkObsidian 前面：先把 $…$ 变成 math 节点，
			// 后面那个改写文本节点的插件就不会去动公式里的内容了。
			// remarkMermaid 放在最前：先把 ```mermaid 换成容器，别让 Shiki 高亮它。
			remarkPlugins: [remarkMath, remarkMermaid, remarkObsidian],
			// rehypeKatex 用宽松模式：公式里出现中文（如 $好 = F(今天, 天气, 真)$）
			// KaTeX 默认会报错，strict:false 让它照常渲染而不是炸掉构建。
			rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }], rehypeHeadingAnchor],
		}),
		shikiConfig: {
			// 跟随系统深浅色自动切换代码配色
			themes: { light: 'github-light', dark: 'github-dark' },
			wrap: true,
		},
	},
});
