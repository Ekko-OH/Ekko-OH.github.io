/**
 * 给 h2/h3/h4 加一个悬浮才出现的 `#` 锚点，并顺便给所有标题写好 id。
 *
 * 为什么 id 要自己算：
 * Astro 的 rehypeHeadingIds 注册在**用户 rehype 插件之后**，等它跑的时候
 * 我的插件已经执行完了 —— 那时候标题还没有 id，拿不到东西可指向。
 * 好在它的逻辑是「已有 string 类型的 id 就不动」（rehype-collect-headings.js），
 * 所以我先把 id 算好，它后面会原样沿用，TOC 用的也是这个 id，两边一致。
 *
 * 它用的也是 github-slugger，这里保持同一套算法和同一个 slugger 实例，
 * 保证同一篇里重复标题的 -1 / -2 后缀和官方行为一致。
 */
import GithubSlugger from 'github-slugger';

const ANCHORED = new Set(['h2', 'h3', 'h4']);
const SLUGGED = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** 深度优先遍历 hast，按文档顺序回调 */
function walk(node, visit) {
	if (!node || typeof node !== 'object') return;
	if (node.type === 'element') visit(node);
	if (Array.isArray(node.children)) {
		for (const child of node.children) walk(child, visit);
	}
}

/** 取标题里的纯文本，和 rehypeHeadingIds 的取法保持一致（`{` 转义成 `${`） */
function headingText(node) {
	let text = '';
	const collect = (child) => {
		if (child.type === 'text' || child.type === 'raw') {
			if (typeof child.value === 'string') text += child.value.replace(/\{/g, '${');
			return;
		}
		if (Array.isArray(child.children)) child.children.forEach(collect);
	};
	node.children.forEach(collect);
	return text;
}

export default function rehypeHeadingAnchor() {
	return (tree) => {
		const slugger = new GithubSlugger();

		walk(tree, (node) => {
			if (!SLUGGED.has(node.tagName)) return;

			node.properties = node.properties || {};

			// 已有 id（比如手写的 HTML 标题）就尊重它
			if (typeof node.properties.id !== 'string') {
				node.properties.id = slugger.slug(headingText(node));
			}

			if (!ANCHORED.has(node.tagName)) return;

			node.children.unshift({
				type: 'element',
				tagName: 'a',
				properties: {
					className: ['header-anchor'],
					href: `#${node.properties.id}`,
					// 装饰性链接：读屏不需要念，也不占 Tab 键
					ariaHidden: 'true',
					tabIndex: -1,
				},
				children: [{ type: 'text', value: '#' }],
			});
		});
	};
}
