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
	}),
});

export const collections = { notes };
