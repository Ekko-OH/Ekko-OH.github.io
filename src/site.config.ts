/**
 * 站点信息，改这里就能改全站显示。
 */
export const SITE = {
	/** 浏览器标题栏 / 页头显示的名字 */
	title: 'Ekko',
	/** 首页副标题 */
	tagline: '学习笔记与项目记录',
	author: 'Ekko',
	description: '个人的学习笔记与技术记录。',
	url: 'https://ekko-oh.github.io',
} as const;

/**
 * 导航：页面上只显示图标，文字放在 aria-label / title 里
 * （鼠标悬停有 tooltip，读屏也能读出来）。
 * icon 是 astro-icon 的图标名，去 https://icones.js.org 查（选 Lucide 集合）。
 */
export const NAV = [
	{ href: '/', label: '首页', icon: 'lucide:house' },
	{ href: '/notes/', label: '笔记', icon: 'lucide:notebook-pen' },
	{ href: '/graph/', label: '知识图谱', icon: 'lucide:network' },
	{ href: '/tags/', label: '标签', icon: 'lucide:tag' },
	{ href: '/about/', label: '关于', icon: 'lucide:user' },
] as const;
