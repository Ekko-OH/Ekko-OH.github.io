/**
 * 把 ```mermaid 代码块变成浏览器端 Mermaid 能接管的容器。
 *
 * 为什么不交给 Shiki：
 *   - Shiki 会把 Mermaid 源码高亮成代码，浏览器端就拿不到原始图定义
 *   - 这里在 Markdown 阶段就替换成 <div class="mermaid">，由
 *     src/scripts/mermaid.js 动态 import mermaid 并渲染
 *
 * 只有页面里真的出现 Mermaid 时，客户端才会加载 mermaid 本体，
 * 普通笔记不会多付这份体积。
 */

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function transform(node) {
	if (!node || typeof node !== 'object' || !Array.isArray(node.children)) return;

	node.children = node.children.map((child) => {
		if (child?.type === 'code' && child.lang === 'mermaid') {
			return {
				type: 'html',
				value: `<div class="mermaid">${escapeHtml(child.value)}</div>`,
			};
		}
		transform(child);
		return child;
	});
}

export default function remarkMermaid() {
	return (tree) => {
		transform(tree);
	};
}
