import { getCollection, type CollectionEntry } from 'astro:content';

export type Note = CollectionEntry<'notes'>;

/** 线上构建时隐藏 draft 笔记，本地 dev 时全部可见 */
function isVisible(note: Note) {
	return import.meta.env.PROD ? !note.data.draft : true;
}

/** 按日期倒序取出所有可见笔记 */
export async function getNotes(): Promise<Note[]> {
	const notes = await getCollection('notes', isVisible);
	return notes.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** 笔记详情页地址。id 可能含中文或子目录，这里做一次编码 */
export function noteHref(id: string) {
	return `/notes/${encodeURI(id)}/`;
}

/** 标签页地址 */
export function tagHref(tag: string) {
	return `/tags/${encodeURI(tag)}/`;
}

/** 统计每个标签下的笔记数（含 0 篇的标签会被过滤掉） */
export function collectTags(notes: Note[]) {
	const counts = new Map<string, number>();
	for (const note of notes) {
		for (const tag of note.data.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'));
}

/** 按年份分组，用于笔记列表页 */
export function groupByYear(notes: Note[]) {
	const groups = new Map<string, Note[]>();
	for (const note of notes) {
		const year = String(note.data.date.getFullYear());
		const list = groups.get(year) ?? [];
		list.push(note);
		groups.set(year, list);
	}
	return [...groups.entries()].map(([year, items]) => ({ year, items }));
}
