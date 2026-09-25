import { defineConfig, presetIcons, presetWind3 } from 'unocss';

/**
 * UnoCSS 配置。
 *
 * 这个站的基础样式仍然手写在 src/styles/global.css，UnoCSS 主要用来：
 *   1. 用原子类写零散的布局/间距（如 flex、gap-2、mt-4）
 *   2. 用 i-lucide-xxx 这种类名直接用图标，不用逐个 import SVG
 *
 * 图标集来自 @iconify-json/lucide（见 package.json 的 devDependencies）。
 * 想换图标集就装对应的 @iconify-json/* 包，类名跟着变，比如 i-tabler-moon。
 */
export default defineConfig({
	presets: [
		presetWind3({
			// 站点已有的基础样式在 global.css 里（box-sizing、边距等），
			// 关掉 UnoCSS 自带的 preflight，避免两套 reset 互相覆盖。
			preflight: false,
			// 让 dark: 变体跟随 <html data-theme="dark">，
			// 和站点的主题切换机制保持一致（不是 class 也不是 media）。
			dark: { dark: '[data-theme="dark"]' },
		}),
		presetIcons({
			scale: 1.2,
			// 单色图标用 mask 生成，颜色继承 currentColor，
			// 所以图标会自动跟着文字颜色和主题变，不用为深色模式单独处理。
			mode: 'mask',
			extraProperties: {
				display: 'inline-block',
				'vertical-align': 'middle',
			},
		}),
	],
	// 只在这些文件里找类名，避免把中文笔记正文当成类名来扫
	content: {
		filesystem: ['src/**/*.{astro,ts,tsx,js,jsx}'],
	},
});
