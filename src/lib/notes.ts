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

/** 侧栏目录树的节点 */
export type NoteTreeNode = {
	label: string;
	/** 有 href 的是笔记，没有的是目录 */
	href?: string;
	children: NoteTreeNode[];
};

/**
 * 把笔记列表变成目录树：笔记 id 里的 `/` 当作目录层级。
 *
 *   writing-a-note        → 一个条目
 *   os/memory             → 目录 os 下的条目 memory
 *
 * 目前笔记都是平铺的，所以看到的是一层；以后加了子目录会自动出现层级。
 * 目录排在笔记前面，各自保持传入顺序（笔记是日期倒序）。
 */
export function buildNoteTree(notes: Note[]): NoteTreeNode[] {
	const roots: NoteTreeNode[] = [];
	const folders = new Map<string, NoteTreeNode>();

	for (const note of notes) {
		const segments = note.id.split('/');
		const fileName = segments.pop() ?? note.id;

		let siblings = roots;
		let prefix = '';

		for (const segment of segments) {
			prefix = prefix ? `${prefix}/${segment}` : segment;
			let folder = folders.get(prefix);
			if (!folder) {
				folder = { label: segment, children: [] };
				folders.set(prefix, folder);
				siblings.push(folder);
			}
			siblings = folder.children;
		}

		siblings.push({
			label: note.data.title || fileName,
			href: noteHref(note.id),
			children: [],
		});
	}

	const sortFoldersFirst = (nodes: NoteTreeNode[]): NoteTreeNode[] => [
		...nodes.filter((node) => !node.href).map((n) => ({ ...n, children: sortFoldersFirst(n.children) })),
		...nodes.filter((node) => node.href),
	];

	return sortFoldersFirst(roots);
}
