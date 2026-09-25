/**
 * 处理从 Obsidian 复制过来的两种专有语法，避免它们原样显示成
 * "[[某某笔记]]" 和 "> [!note]" 这种噪音。
 *
 * 1. [[笔记名]] / [[笔记名|显示文字]]  →  指向 /notes/<slug>/ 的链接
 *    slug 用 github-slugger 计算，和 Astro 生成笔记 id 的算法一致，
 *    所以只要目标笔记存在，链接就能点到。
 * 2. > [!note] 标题            →  带样式的 callout 块
 *    （样式在 src/styles/global.css 里，按 data-callout 区分颜色）
 *
 * 纯本地实现，只依赖 github-slugger。
 */
import GithubSlugger from 'github-slugger';

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

/** 和 Astro 生成 content id 用的算法保持一致 */
function slugify(value) {
	return new GithubSlugger().slug(value.trim());
}

const CALLOUT_MARKER = /^\[!([A-Za-z]+)\]([+-]?)[ \t]*/;
const WIKILINK = /(!?)\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;

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

/** 把 text 节点里的 [[wikilink]] 替换成链接节点 */
function transformTextNode(node) {
	const value = node.value;
	WIKILINK.lastIndex = 0;
	if (!WIKILINK.test(value)) return null;
	WIKILINK.lastIndex = 0;

	const result = [];
	let lastIndex = 0;
	let match;

	while ((match = WIKILINK.exec(value)) !== null) {
		const [full, bang, target, alias] = match;
		if (match.index > lastIndex) {
			result.push({ type: 'text', value: value.slice(lastIndex, match.index) });
		}

		const label = (alias ?? target).trim();

		if (bang === '!') {
			// 附件嵌入（![[图片.png]]）在静态站里没有对应文件，降级成纯文字提示
			result.push({ type: 'text', value: `（附件：${label}）` });
		} else {
			result.push({
				type: 'link',
				url: `/notes/${encodeURI(slugify(target))}/`,
				title: null,
				data: { hProperties: { className: ['wikilink'] } },
				children: [{ type: 'text', value: label }],
			});
		}

		lastIndex = match.index + full.length;
	}

	if (lastIndex < value.length) {
		result.push({ type: 'text', value: value.slice(lastIndex) });
	}

	return result;
}

/** 手动深度优先遍历，避免额外依赖 unist-util-visit */
function walk(node, visit) {
	if (!node || typeof node !== 'object' || !Array.isArray(node.children)) return;

	node.children = node.children.flatMap((child) => {
		if (child?.type === 'text') {
			const replaced = transformTextNode(child);
			return replaced ?? [child];
		}
		return [child];
	});

	for (const child of node.children) {
		visit(child);
		walk(child, visit);
	}
}

export default function remarkObsidian() {
	return (tree) => {
		walk(tree, (node) => {
			if (node.type === 'blockquote') transformCallout(node);
		});
	};
}
