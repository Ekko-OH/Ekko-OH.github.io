import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * 笔记集合。
 *
 * 新增一篇笔记 = 在 src/content/notes/ 下新建一个 .md 文件，
 * 文件名（不含扩展名）就是 URL：foo-bar.md → /notes/foo-bar/
 * 中文文件名也可以：数学归纳法.md → /notes/数学归纳法/
 *
 * 如果想让文件名和 URL 不一致，在 frontmatter 里写 slug: 自定义地址
 *
 * role 决定这篇笔记在「技术书」里的层级，只影响展示（角色徽标 / 图谱配色）：
 *   overview = 总览，topic = 专题，model = 具体模型
 * aliases 是 Obsidian 风格的别名，[[别名]] 也能链过来。
 */
const notes = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		date: z.coerce.date(),
		updated: z.coerce.date().optional(),
		tags: z.array(z.string()).default([]),
		/** draft: true 的笔记只在本地 dev 可见，不会出现在线上构建里 */
		draft: z.boolean().default(false),
		slug: z.string().optional(),
		/** 长期不变的唯一标识（UUIDv7），发布时生成一次，改标题/改网址都不变 */
		uuid: z.string().optional(),
		/** 内容来源：human = 自己写，agent = Agent 整理 */
		source: z.enum(['human', 'agent']).default('human'),
		/** 在整本书里的位置：总览 / 专题 / 模型 */
		role: z.enum(['overview', 'topic', 'model']).default('topic'),
		/** 同一组里的阅读顺序；不写就按日期倒序 */
		order: z.number().optional(),
		/** [[别名]] 也能解析到这篇笔记 */
		aliases: z.array(z.string()).default([]),
	}),
});

/** 独立页面（目前是首页 About），内容由 Obsidian 的 关于.md 同步而来。 */
const pages = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
	}),
});

export const collections = { notes, pages };
