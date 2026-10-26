/**
 * 给「宽表」打标记。
 *
 * 15 列这种对照表放进 34rem 的正文列里，浏览器会把每列压到 min-content，
 * 中文表头和值会被拆成一字一行（"开 / 闭 / 源"），完全没法读。
 * 这里按列数判断：≥ minColumns 的表格加 .wide 类，由 global.css 接管成
 * 「不换行 + 横向滚动 + 斑马纹 + 紧凑字号」的数据表样式。
 *
 * 窄表不加类，仍然是普通表格，行为和以前一致。
 */

/** 数一张表有多少列：取 thead/tbody 里第一行的单元格数 */
function countColumns(table) {
	for (const section of table.children ?? []) {
		if (section.tagName !== 'thead' && section.tagName !== 'tbody') continue;
		const row = (section.children ?? []).find((node) => node.tagName === 'tr');
		if (!row) continue;
		return (row.children ?? []).filter(
			(node) => node.tagName === 'th' || node.tagName === 'td',
		).length;
	}
	return 0;
}

export default function rehypeWideTable({ minColumns = 10 } = {}) {
	const walk = (node) => {
		if (node.type === 'element' && node.tagName === 'table' && countColumns(node) >= minColumns) {
			const properties = (node.properties ??= {});
			const existing = properties.className;
			properties.className = Array.isArray(existing)
				? [...existing, 'wide']
				: existing
					? [existing, 'wide']
					: ['wide'];
		}
		for (const child of node.children ?? []) walk(child);
	};

	return (tree) => walk(tree);
}
