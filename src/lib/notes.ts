import { getCollection, type CollectionEntry } from 'astro:content';
import {
	createResolver,
	extractLinkTargets,
	noteUrl,
	resolveNotePath,
} from './wikilinks.mjs';

export type Note = CollectionEntry<'notes'>;
export type NoteRole = 'overview' | 'topic' | 'model';

export const ROLE_LABELS: Record<NoteRole, string> = {
	overview: '总览',
	topic: '专题',
	model: '模型',
};

const ROLE_ORDER: Record<NoteRole, number> = { overview: 0, topic: 1, model: 2 };

/** 线上构建时隐藏 draft 笔记，本地 dev 时全部可见 */
function isVisible(note: Note) {
	return import.meta.env.PROD ? !note.data.draft : true;
}

/** 按日期倒序取出所有可见笔记 */
export async function getNotes(): Promise<Note[]> {
	const notes = await getCollection('notes', isVisible);
	return notes.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** 只取自己写的笔记；Agent 整理的材料单独展示 */
export async function getHumanNotes(): Promise<Note[]> {
	const notes = await getNotes();
	return notes.filter((note) => note.data.source !== 'agent');
}

/** 笔记的路径（不含 /notes/ 前缀）：优先用 frontmatter 里的 slug */
export function notePath(note: Note) {
	return note.data.slug ?? note.id;
}

/** 笔记详情页地址。id 可能含中文或子目录，这里逐段编码 */
export function noteHref(note: Note) {
	return noteUrl(notePath(note));
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

export interface GraphNode {
	id: string;
	title: string;
	href: string;
	role: NoteRole;
	tags: string[];
	/** 内容来源：human / agent */
	source: 'human' | 'agent';
	/** 入链 + 出链（去重后的邻居数） */
	degree: number;
}

export interface GraphEdge {
	source: string;
	target: string;
}

export interface NoteGraph {
	notes: Note[];
	nodes: GraphNode[];
	edges: GraphEdge[];
	/** note id → 它链接到的 note id */
	outgoing: Map<string, string[]>;
	/** note id → 链接到它的 note id */
	backlinks: Map<string, string[]>;
	byId: Map<string, Note>;
}

/**
 * 全站笔记链接图。
 *
 * 数据来源是 Markdown 原文（不是渲染后的 HTML），所以：
 *   - [[双链]] 和 /notes/... 两种写法都算
 *   - 代码块里的示例链接会被忽略
 *   - 反向链接和知识图谱用的是同一份结果，不会互相打架
 */
export async function getNoteGraph(options: { includeAgent?: boolean } = {}): Promise<NoteGraph> {
	// 默认只画自己写的笔记；图谱页可以选择把 Agent 材料也画出来（用不同颜色区分）
	const notes = (await getNotes()).filter(
		(note) => options.includeAgent || note.data.source !== 'agent',
	);
	const byId = new Map(notes.map((note) => [note.id, note]));

	const resolver = createResolver(
		notes.map((note) => ({
			id: note.id,
			title: note.data.title,
			slug: note.data.slug,
			aliases: note.data.aliases,
			source: note.data.source,
		})),
	);

	const outgoing = new Map<string, string[]>();
	const backlinks = new Map<string, string[]>(notes.map((note) => [note.id, []]));

	for (const note of notes) {
		const targets = new Set<string>();

		for (const link of extractLinkTargets(note.body ?? '')) {
			const hit =
				link.kind === 'wiki' ? resolver(link.target) : resolveNotePath(resolver, link.target);

			if (hit?.id && hit.id !== note.id && byId.has(hit.id)) {
				targets.add(hit.id);
			}
		}

		const list = [...targets];
		outgoing.set(note.id, list);
		for (const target of list) {
			backlinks.get(target)?.push(note.id);
		}
	}

	// 无向边去重：A → B 和 B → A 只画一条线
	const edgeKeys = new Set<string>();
	const edges: GraphEdge[] = [];
	for (const [source, targets] of outgoing) {
		for (const target of targets) {
			const key = [source, target].sort().join('\u0000');
			if (edgeKeys.has(key)) continue;
			edgeKeys.add(key);
			edges.push({ source, target });
		}
	}

	const degree = new Map<string, number>();
	for (const edge of edges) {
		degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
		degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
	}

	const nodes: GraphNode[] = notes
		.map((note) => ({
			id: note.id,
			title: note.data.title,
			href: noteHref(note),
			role: note.data.role,
			tags: note.data.tags,
			source: note.data.source,
			degree: degree.get(note.id) ?? 0,
		}))
		.sort(
			(a, b) =>
				ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
				b.degree - a.degree ||
				a.title.localeCompare(b.title, 'zh-CN'),
		);

	return { notes, nodes, edges, outgoing, backlinks, byId };
}
