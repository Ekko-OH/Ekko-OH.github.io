/**
 * 站点信息，改这里就能改全站显示。
 */
export const SITE = {
	/** 浏览器标题栏 / 页头显示的名字 */
	title: 'Seeking the Moon',
	/** 首页副标题 */
	tagline: '学习笔记与项目记录',
	author: 'Ekko',
	description: '个人的学习笔记与技术记录。',
	url: 'https://seekingthemoon.github.io',
} as const;

export const NAV = [
	{ href: '/', label: '首页' },
	{ href: '/notes/', label: '笔记' },
	{ href: '/tags/', label: '标签' },
	{ href: '/about/', label: '关于' },
] as const;
