/**
 * [[双链]] 的解析规则，Markdown 插件和构建期（反向链接 / 知识图谱）共用这一份。
 *
 * 为什么要有索引，而不是像以前那样直接把目标 slug 化：
 *   - 笔记的网址来自文件名，但标题可以不一样（`Softmax与采样.md` → 标题 `Softmax 与采样`）
 *   - 文件名里有空格、标点、子目录时，slug 化和 Astro 的 id 对不上
 *   - 想支持 Obsidian 的 `aliases` 和 `[[笔记#小节]]`
 *
 * 解析顺序：完整 id（可含子目录）→ 文件名 → 标题 → slug → aliases。
 * 都不命中才回退到「按目标猜一个网址」，并标成 missing。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import GithubSlugger from 'github-slugger';

/** 和 Astro glob loader 一致：每个路径段都过一遍 github-slugger */
function slugifyId(id) {
	return id
		.split('/')
		.map((segment) => new GithubSlugger().slug(segment))
		.join('/')
		.replace(/\/index$/, '');
}

/** 把 id 统一成 posix 风格、去掉 .md */
function normaliseId(value) {
	return value.replaceAll(sep, '/').replace(/\.md$/i, '').replace(/^\.?\//, '');
}

/** 查找用的 key：忽略大小写、首尾空白和多余空格 */
function normaliseKey(value) {
	return normaliseId(String(value)).replace(/\s+/g, ' ').trim().toLowerCase();
}

function basename(id) {
	return id.split('/').pop() ?? id;
}

function unquote(value) {
	const text = String(value).trim();
	if (
		(text.startsWith('"') && text.endsWith('"')) ||
		(text.startsWith("'") && text.endsWith("'"))
	) {
		return text.slice(1, -1);
	}
	return text;
}

/**
 * 从 Markdown 源文件里读 frontmatter。
 * 只关心 title / slug / aliases，不需要完整的 YAML 解析器。
 */
function parseFrontmatter(source) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
	if (!match) return {};

	const data = {};
	let listKey = null;

	for (const rawLine of match[1].split(/\r?\n/)) {
		const line = rawLine.replace(/\s+#.*$/, '');
		const item = /^\s*-\s+(.*)$/.exec(line);
		if (item && listKey) {
			data[listKey].push(unquote(item[1]));
			continue;
		}

		const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
		if (!pair) continue;

		const [, key, rawValue] = pair;
		const value = rawValue.trim();
		listKey = null;

		if (!value) {
			data[key] = [];
			listKey = key;
			continue;
		}

		if (value.startsWith('[') && value.endsWith(']')) {
			data[key] = value
				.slice(1, -1)
				.split(',')
				.map((part) => unquote(part))
				.filter(Boolean);
			continue;
		}

		data[key] = unquote(value);
	}

	return data;
}

function walk(dir, base = dir, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith('.')) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full, base, out);
		} else if (entry.isFile() && /\.md$/i.test(entry.name)) {
			out.push(full);
		}
	}
	return out;
}

const indexCache = new Map();

/**
 * 扫描一个笔记目录，得到解析需要的记录。
 * 用文件的 mtime 当缓存键：新建/改名/改标题后，dev 里下一次渲染就会重建索引。
 *
 * @param {string} dir
 * @returns {{ id: string, title: string, slug?: string, aliases?: string[] }[]}
 */
export function loadNoteIndex(dir) {
	const files = walk(dir).sort();
	const signature = files.map((file) => `${relative(dir, file)}:${statSync(file).mtimeMs}`).join('|');
	const cached = indexCache.get(dir);
	if (cached && cached.signature === signature) return cached.records;

	const records = files.map((file) => {
		const source = readFileSync(file, 'utf8');
		const data = parseFrontmatter(source);
		const rawId = normaliseId(relative(dir, file));
		const id = slugifyId(rawId);
		return {
			id,
			title: typeof data.title === 'string' && data.title ? data.title : basename(rawId),
			slug: typeof data.slug === 'string' ? data.slug : undefined,
			aliases: Array.isArray(data.aliases) ? data.aliases : [],
			source: data.source === 'agent' ? 'agent' : 'human',
		};
	});

	indexCache.set(dir, { signature, records });
	return records;
}

/**
 * @param {{ id: string, title?: string, slug?: string, aliases?: string[] }[]} records
 */
export function createResolver(records) {
	/** @type {Map<string, { id: string, title: string, path: string, slug?: string }>} */
	const byKey = new Map();

	for (const record of records) {
		const id = normaliseId(record.id);
		const path = record.slug || id;
		const entry = {
			id,
			title: record.title || basename(id),
			path,
			slug: record.slug,
			source: record.source === 'agent' ? 'agent' : 'human',
		};

		const keys = [id, basename(id), entry.title, record.slug, ...(record.aliases ?? [])];
		for (const key of keys) {
			if (!key) continue;
			const norm = normaliseKey(key);
			if (norm && !byKey.has(norm)) byKey.set(norm, entry);
		}
	}

	return (target) => {
		const raw = String(target).split('#')[0].trim();
		if (!raw) return null;

		const candidates = [normaliseKey(raw)];
		const withoutLead = raw.replace(/^\.?\//, '');
		if (withoutLead !== raw) candidates.push(normaliseKey(withoutLead));
		if (withoutLead.includes('/')) candidates.push(normaliseKey(basename(withoutLead)));
		if (raw.includes('/')) candidates.push(normaliseKey(basename(raw)));

		for (const key of candidates) {
			const hit = byKey.get(key);
			if (hit) return hit;
		}
		return null;
	};
}

/** 把笔记路径编码成网址；子目录之间的 `/` 保留，每段单独编码 */
export function noteUrl(path, heading) {
	const encoded = String(path)
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/');
	const anchor = heading ? `#${encodeURIComponent(heading)}` : '';
	return `/notes/${encoded}/${anchor}`;
}

/** 把 `/notes/foo/` 这类正文链接还原成笔记 id，再交给 resolver */
export function resolveNotePath(resolver, href) {
	let path;
	try {
		path = decodeURIComponent(String(href).split(/[?#]/)[0]);
	} catch {
		return null;
	}

	const marker = '/notes/';
	const index = path.indexOf(marker);
	if (index === -1) return null;

	const id = path.slice(index + marker.length).replace(/\/+$/, '');
	if (!id) return null;
	return resolver(id);
}

const FENCE = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm;
const INLINE_CODE = /`[^`\n]*`/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const WIKILINK = /!?\[\[([^[\]\n]+)\]\]/g;
const MARKDOWN_LINK = /(?<!!)\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g;
const HTML_LINK = /<a\b[^>]*\bhref=["']([^"']+)["']/gi;

/** 去掉代码块和行内代码，避免把示例里的链接算进图谱 */
function stripCode(markdown) {
	return markdown
		.replace(HTML_COMMENT, '')
		.replace(FENCE, '')
		.replace(INLINE_CODE, '');
}

/**
 * 提取正文里所有指向其他笔记的链接。
 * 返回的是原始目标，由调用方决定用 wikilink 还是路径规则解析。
 *
 * @param {string} markdown
 * @returns {{ kind: 'wiki' | 'path', target: string, heading?: string }[]}
 */
export function extractLinkTargets(markdown) {
	if (!markdown) return [];
	const source = stripCode(markdown);
	/** @type {{ kind: 'wiki' | 'path', target: string, heading?: string }[]} */
	const links = [];

	for (const match of source.matchAll(WIKILINK)) {
		const inner = match[1];
		const [targetPart] = inner.split('|');
		const [target, heading] = targetPart.split('#');
		const clean = target.trim();
		if (!clean) continue;
		links.push({ kind: 'wiki', target: clean, heading: heading?.trim() || undefined });
	}

	for (const match of source.matchAll(MARKDOWN_LINK)) {
		const href = match[1].replace(/^<|>$/g, '');
		if (/\/notes\//.test(href)) links.push({ kind: 'path', target: href });
	}

	for (const match of source.matchAll(HTML_LINK)) {
		const href = match[1];
		if (/\/notes\//.test(href)) links.push({ kind: 'path', target: href });
	}

	return links;
}
