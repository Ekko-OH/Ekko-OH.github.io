/**
 * 处理从 Obsidian 复制过来的两种专有语法，避免它们原样显示成
 * "[[某某笔记]]" 和 "> [!note]" 这种噪音。
 *
 * 1. [[笔记名]] / [[笔记名|显示文字]] / [[笔记名#小节]]  →  指向笔记的链接
 *    解析顺序见 src/lib/wikilinks.mjs：文件名、标题、slug、aliases 都认。
 *    找不到目标时仍然生成链接，但加 .wikilink-missing，样式上是虚线下划线。
 * 2. > [!note] 标题            →  带样式的 callout 块
 *    （样式在 src/styles/global.css 里，按 data-callout 区分颜色）
 *
 * 索引在每次渲染时重建（按文件 mtime 缓存），所以 dev 里新建笔记、
 * 改标题之后不用重启也能正确解析。
 */
import GithubSlugger from 'github-slugger';
import { fileURLToPath } from 'node:url';
import { createResolver, loadNoteIndex, noteUrl } from '../lib/wikilinks.mjs';

const NOTES_DIR = fileURLToPath(new URL('../content/notes', import.meta.url));

/** 没写标题时，每种 callout 的默认标题 */
const DEFAULT_TITLES = {
	note: '笔记',
	info: '信息',
	tip: '提示',
	hint: '提示',
	important: '重要',
	warning: '注意',
	caution: '警告',
	danger: '危险',
	error: '错误',
	success: '完成',
	question: '疑问',
	quote: '引用',
	example: '示例',
	abstract: '摘要',
	summary: '摘要',
	todo: '待办',
	bug: '问题',
	failure: '失败',
	cite: '引用',
};

/** 只用来给「目标还不存在」的链接猜一个地址 */
function slugify(value) {
	return new GithubSlugger().slug(value.trim());
}

const CALLOUT_MARKER = /^\[!([A-Za-z]+)\]([+-]?)[ \t]*/;
const WIKILINK = /(!?)\[\[([^[\]\n]+?)\]\]/g;
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|avif|pdf)$/i;

/**
 * 把一个段落按第一个软换行拆成「第一行」和「剩余部分」。
 * mdast 里软换行是 text 节点里的 "\n"。
 */
function splitFirstLine(children) {
	const head = [];
	const rest = [];
	let done = false;

	for (const child of children) {
		if (done) {
			rest.push(child);
			continue;
		}
		if (child.type === 'text' && child.value.includes('\n')) {
			const index = child.value.indexOf('\n');
			const firstLine = child.value.slice(0, index);
			const remainder = child.value.slice(index + 1);
			if (firstLine) head.push({ ...child, value: firstLine });
			if (remainder) rest.push({ ...child, value: remainder });
			done = true;
			continue;
		}
		head.push(child);
	}

	return { head, rest };
}

/** 取出节点数组的纯文本 */
function textOf(nodes) {
	return nodes
		.map((node) => {
			if (node.type === 'text' || node.type === 'inlineCode') return node.value;
			if (Array.isArray(node.children)) return textOf(node.children);
			return '';
		})
		.join('')
		.trim();
}

/** 去掉剩余内容开头的换行，避免 callout 正文前多一个空行 */
function trimLeadingBreaks(children) {
	let index = 0;
	while (index < children.length) {
		const child = children[index];
		if (child.type === 'break') {
			index++;
			continue;
		}
		if (child.type === 'text') {
			const value = child.value.replace(/^\n+/, '');
			if (value === '') {
				index++;
				continue;
			}
			children[index] = { ...child, value };
		}
		break;
	}
	return children.slice(index);
}

/** 把 blockquote 识别并改造成 callout；不是 callout 就返回 false */
function transformCallout(node) {
	const paragraph = node.children.find((child) => child.type === 'paragraph');
	if (!paragraph) return false;

	const first = paragraph.children[0];
	if (!first || first.type !== 'text') return false;

	const match = first.value.match(CALLOUT_MARKER);
	if (!match) return false;

	const [, rawType] = match;
	const type = rawType.toLowerCase();

	const { head, rest } = splitFirstLine(paragraph.children);

	// 首行形如 "[!note] 标题"，把标记去掉，剩下的就是标题
	const [firstLineNode, ...restOfHead] = head;
	const headAfterMarker = [{ ...firstLineNode, value: firstLineNode.value.slice(match[0].length) }, ...restOfHead];
	const title = textOf(headAfterMarker) || DEFAULT_TITLES[type] || rawType;

	// 首行后面还有内容的话，才是 callout 的正文
	const body = trimLeadingBreaks(rest);
	if (body.length > 0) {
		paragraph.children = body;
	} else {
		node.children = node.children.filter((child) => child !== paragraph);
	}

	node.data = {
		...node.data,
		hProperties: {
			...node.data?.hProperties,
			className: ['callout', `callout-${type}`],
			'data-callout': type,
			'data-callout-title': title,
		},
	};

	return true;
}

/** 把一条 [[wikilink]] 变成链接节点 */
function wikiLinkNode({ bang, target, heading, alias, resolver }) {
	const label = alias?.trim() || (heading ? `${target} › ${heading}` : target);
	const headingSlug = heading ? new GithubSlugger().slug(heading) : '';

	// 图片附件：静态站里没有 Obsidian 的附件目录，老老实实显示成提示
	if (bang === '!' && IMAGE_FILE.test(target)) {
		return { type: 'text', value: `（附件：${label}）` };
	}

	const hit = resolver(target);
	const url = hit ? noteUrl(hit.path, headingSlug) : noteUrl(slugify(target), headingSlug);
	const classes = ['wikilink'];
	if (!hit) classes.push('wikilink-missing');
	if (hit?.source === 'agent') classes.push('wikilink-agent');
	if (bang === '!') classes.push('wikilink-embed');

	return {
		type: 'link',
		url,
		title: hit ? (hit.source === 'agent' ? 'Agent 整理' : null) : `笔记「${target}」还不存在`,
		data: { hProperties: { className: classes } },
		children: [{ type: 'text', value: bang === '!' ? `↳ ${label}` : label }],
	};
}

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

/**
 * 裸 HTML 块（例如 <div class="book-map">）里的文字是 html 节点，
 * 不经过 Markdown 的行内解析，所以 [[双链]] 需要在这里单独换掉。
 */
function wikiLinkHtml(full, bang, inner, resolver) {
	const [targetPart, alias] = inner.split('|');
	const [target, heading] = targetPart.split('#');
	const clean = target.trim();
	if (!clean) return full;

	const label = alias?.trim() || (heading ? `${clean} › ${heading.trim()}` : clean);
	if (bang === '!' && IMAGE_FILE.test(clean)) {
		return `（附件：${escapeHtml(label)}）`;
	}

	const headingSlug = heading ? new GithubSlugger().slug(heading.trim()) : '';
	const hit = resolver(clean);
	const url = hit ? noteUrl(hit.path, headingSlug) : noteUrl(slugify(clean), headingSlug);
	const classes = ['wikilink'];
	if (!hit) classes.push('wikilink-missing');
	if (hit?.source === 'agent') classes.push('wikilink-agent');
	if (bang === '!') classes.push('wikilink-embed');
	const title = hit
		? hit.source === 'agent'
			? ' title="Agent 整理"'
			: ''
		: ` title="笔记「${escapeHtml(clean)}」还不存在"`;

	return `<a href="${url}" class="${classes.join(' ')}"${title}>${escapeHtml(
		bang === '!' ? `↳ ${label}` : label,
	)}</a>`;
}

function transformHtmlNode(node, resolver) {
	if (typeof node.value !== 'string' || !node.value.includes('[[')) return node;
	const value = node.value.replace(WIKILINK, (full, bang, inner) => wikiLinkHtml(full, bang, inner, resolver));
	return { ...node, value };
}

/** 把 text 节点里的 [[wikilink]] 替换成链接节点 */
function transformTextNode(node, resolver) {
	const value = node.value;
	if (!value.includes('[[')) return null;

	WIKILINK.lastIndex = 0;
	const result = [];
	let lastIndex = 0;
	let match;

	while ((match = WIKILINK.exec(value)) !== null) {
		const [full, bang, inner] = match;
		if (match.index > lastIndex) {
			result.push({ type: 'text', value: value.slice(lastIndex, match.index) });
		}

		const [targetPart, alias] = inner.split('|');
		const [target, heading] = targetPart.split('#');

		if (!target.trim()) {
			// [[#同页小节]]：保持原样
			result.push({ type: 'text', value: full });
		} else {
			result.push(
				wikiLinkNode({
					bang,
					target: target.trim(),
					heading: heading?.trim(),
					alias,
					resolver,
				}),
			);
		}

		lastIndex = match.index + full.length;
	}

	if (result.length === 0) return null;
	if (lastIndex < value.length) {
		result.push({ type: 'text', value: value.slice(lastIndex) });
	}

	return result;
}

/** 手动深度优先遍历，避免额外依赖 unist-util-visit */
function walk(node, visit, resolver) {
	if (!node || typeof node !== 'object' || !Array.isArray(node.children)) return;

	node.children = node.children.flatMap((child) => {
		if (child?.type === 'text') {
			const replaced = transformTextNode(child, resolver);
			return replaced ?? [child];
		}
		if (child?.type === 'html') {
			return [transformHtmlNode(child, resolver)];
		}
		return [child];
	});

	for (const child of node.children) {
		visit(child);
		walk(child, visit, resolver);
	}
}

export default function remarkObsidian() {
	return (tree) => {
		// 每次渲染都取一次：mtime 没变时内部直接命中缓存
		const resolver = createResolver(loadNoteIndex(NOTES_DIR));

		walk(
			tree,
			(node) => {
				if (node.type === 'blockquote') transformCallout(node);
			},
			resolver,
		);
	};
}
