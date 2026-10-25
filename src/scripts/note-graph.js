/**
 * 知识图谱：一个不依赖第三方库的力导向图。
 *
 * 数据由 /graph/ 页面在构建时注入到 window.__NOTE_GRAPH__：
 *   nodes: { id, title, href, role, tags, degree }
 *   links: { source, target }
 *
 * 交互：悬停高亮邻居、拖动节点、拖动背景平移、滚轮缩放、搜索过滤、
 * 点击节点选中并列出相连节点；双击或面板按钮打开笔记。节点不画箭头，因为双链本来就是双向的。
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs = {}) {
	const node = document.createElementNS(SVG_NS, name);
	for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
	return node;
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

export function initNoteGraph() {
	const data = window.__NOTE_GRAPH__;
	const svg = document.getElementById('note-graph');
	const stage = document.querySelector('[data-graph-stage]');
	const status = document.querySelector('[data-graph-status]');
	const selectionPanel = document.querySelector('[data-graph-selection]');
	const selectionTitle = document.querySelector('[data-graph-selection-title]');
	const selectionMeta = document.querySelector('[data-graph-selection-meta]');
	const selectionList = document.querySelector('[data-graph-selection-list]');
	const selectionOpen = document.querySelector('[data-graph-selection-open]');
	const selectionClose = document.querySelector('[data-graph-selection-close]');

	if (!data || !svg || !stage || !status) return;

	const roleLabels = data.roleLabels ?? { overview: '总览', topic: '专题', model: '模型' };
	const defaultStatus = status.textContent ?? '';
	const width = () => stage.clientWidth || 800;
	const height = () => stage.clientHeight || 520;

	let viewWidth = width();
	let viewHeight = height();
	let scale = 1;
	let tx = 0;
	let ty = 0;
	let alpha = 1;
	let running = false;
	let dragNode = null;
	let panStart = null;
	let selectedNode = null;

	svg.setAttribute('viewBox', `0 0 ${viewWidth} ${viewHeight}`);

	const sizeInput = document.getElementById('graph-size');
	let nodeScale = 0.85;
	try {
		const saved = Number(localStorage.getItem('graph-node-scale-v2'));
		if (saved >= 0.35 && saved <= 1.35) {
			nodeScale = saved;
			if (sizeInput) sizeInput.value = String(saved);
		}
	} catch {
		// localStorage 不可用时用默认值
	}

	const nodes = data.nodes.map((node) => {
		const baseR =
			7 +
			(node.role === 'overview' ? 4 : node.role === 'model' ? 1 : 0) +
			Math.min(9, Math.sqrt(node.degree) * 2.2);
		return {
			...node,
			x: 0,
			y: 0,
			vx: 0,
			vy: 0,
			fixed: false,
			baseR,
			r: baseR * nodeScale,
		};
	});
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const links = data.links
		.map((link) => ({
			source: byId.get(link.source),
			target: byId.get(link.target),
		}))
		.filter((link) => link.source && link.target);

	const neighbors = new Map(nodes.map((node) => [node.id, new Set()]));
	for (const link of links) {
		neighbors.get(link.source.id).add(link.target.id);
		neighbors.get(link.target.id).add(link.source.id);
	}

	// ---------- 初始布局：主线居中，专题一圈，模型一圈 ----------

	const centreX = viewWidth / 2;
	const centreY = viewHeight / 2;

	function placeRing(list, radius, offset = -Math.PI / 2) {
		list.forEach((node, index) => {
			const angle = offset + (index / Math.max(1, list.length)) * Math.PI * 2;
			node.x = centreX + Math.cos(angle) * radius;
			node.y = centreY + Math.sin(angle) * radius * 0.78;
		});
	}

	const overviews = nodes.filter((node) => node.role === 'overview');
	const topics = nodes.filter((node) => node.role === 'topic');
	const models = nodes.filter((node) => node.role === 'model');

	if (overviews.length === 0) {
		// 没有显式主线时，把连接最多的节点放在中间
		const [hub, ...rest] = [...nodes].sort((a, b) => b.degree - a.degree);
		if (hub) {
			hub.x = centreX;
			hub.y = centreY;
			overviews.push(hub);
			const index = topics.indexOf(hub);
			if (index !== -1) topics.splice(index, 1);
		}
		placeRing(rest.filter((node) => !overviews.includes(node)), 170);
	} else {
		if (overviews.length === 1) {
			overviews[0].x = centreX;
			overviews[0].y = centreY;
		} else {
			placeRing(overviews, 44, -Math.PI / 2);
		}
		const compact = viewWidth < 520;
		placeRing(topics, Math.min(viewWidth, viewHeight) * (compact ? 0.26 : 0.34));
		placeRing(models, Math.min(viewWidth, viewHeight) * (compact ? 0.32 : 0.46), Math.PI / 8);
	}

	// ---------- DOM ----------

	const viewport = svgEl('g', { class: 'graph-viewport' });
	const linkLayer = svgEl('g', { class: 'graph-links' });
	const nodeLayer = svgEl('g', { class: 'graph-nodes' });
	viewport.append(linkLayer, nodeLayer);
	svg.append(viewport);

	for (const link of links) {
		link.el = svgEl('line', { class: 'graph-link' });
		linkLayer.append(link.el);
	}

	for (const node of nodes) {
		const group = svgEl('g', {
			class: `graph-node role-${node.role} source-${node.source}`,
			tabindex: '0',
			role: 'button',
			'aria-pressed': 'false',
			'aria-label': `选择「${node.title}」查看相连节点；${roleLabels[node.role] ?? ''}${node.source === 'agent' ? '，Agent 整理' : ''}，${node.degree} 条连接`,
		});
		const hit = svgEl('circle', { class: 'graph-node-hit', r: node.r + 10 });
		const halo = svgEl('circle', { class: 'graph-node-halo', r: node.r + 5 });
		const circle = svgEl('circle', { class: 'graph-node-dot', r: node.r });
		const label = svgEl('text', {
			class: 'graph-node-label',
			y: node.r + 13,
		});
		label.textContent = node.title;
		label.style.fontSize = '10.5px';

		node.hit = hit;
		node.halo = halo;
		node.dot = circle;
		node.label = label;

		group.append(hit, halo, circle, label);
		group.addEventListener('pointerenter', () => highlight(node));
		group.addEventListener('pointerleave', clearHighlight);
		group.addEventListener('focus', () => highlight(node));
		group.addEventListener('blur', clearHighlight);
		group.addEventListener('pointerdown', (event) => startNodeDrag(event, node));
		group.addEventListener('dblclick', (event) => {
			event.preventDefault();
			window.location.href = node.href;
		});
		group.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				if (selectedNode === node) {
					clearSelection();
				} else {
					selectNode(node);
				}
			}
		});

		node.el = group;
		nodeLayer.append(group);
	}

	// ---------- 变换 / 坐标 ----------

	function applyTransform() {
		viewport.setAttribute('transform', `translate(${tx.toFixed(2)}, ${ty.toFixed(2)}) scale(${scale.toFixed(3)})`);
	}

	function viewPoint(event) {
		const rect = svg.getBoundingClientRect();
		return {
			x: ((event.clientX - rect.left) / rect.width) * viewWidth,
			y: ((event.clientY - rect.top) / rect.height) * viewHeight,
		};
	}

	function worldPoint(point) {
		return { x: (point.x - tx) / scale, y: (point.y - ty) / scale };
	}

	function zoomAt(clientX, clientY, factor) {
		const rect = svg.getBoundingClientRect();
		const px = ((clientX - rect.left) / rect.width) * viewWidth;
		const py = ((clientY - rect.top) / rect.height) * viewHeight;
		const next = clamp(scale * factor, 0.45, 2.8);
		if (next === scale) return;

		const worldX = (px - tx) / scale;
		const worldY = (py - ty) / scale;
		scale = next;
		tx = px - worldX * scale;
		ty = py - worldY * scale;
		applyTransform();
	}

	// ---------- 高亮 / 搜索 ----------

	function highlight(node) {
		if (!node || dragNode) return;
		// 悬停时冻结布局：节点不再移动，点击才不会点空
		alpha = 0;
		const around = neighbors.get(node.id) ?? new Set();

		for (const item of nodes) {
			const active = item === node;
			const neighbour = around.has(item.id);
			item.el.classList.toggle('is-active', active);
			item.el.classList.toggle('is-neighbour', neighbour);
			item.el.classList.toggle('is-dim', !active && !neighbour);
		}

		for (const link of links) {
			const active = link.source === node || link.target === node;
			link.el.classList.toggle('is-active', active);
			link.el.classList.toggle('is-dim', !active);
		}

		const tags = node.tags?.length ? ` · #${node.tags.join(' #')}` : '';
		const agent = node.source === 'agent' ? ' · Agent 整理' : '';
		status.textContent = `${node.title} · ${roleLabels[node.role] ?? ''}${agent} · ${node.degree} 条连接${tags}`;
	}

	function clearHighlight() {
		if (dragNode) return;
		if (selectedNode) {
			highlight(selectedNode);
			status.textContent = `已选中：${selectedNode.title} · ${neighbors.get(selectedNode.id)?.size ?? 0} 个相连节点`;
			return;
		}
		for (const item of nodes) item.el.classList.remove('is-active', 'is-neighbour', 'is-dim');
		for (const link of links) link.el.classList.remove('is-active', 'is-dim');
		status.textContent = defaultStatus;
	}

	function renderSelection(node) {
		if (!selectionPanel || !selectionTitle || !selectionMeta || !selectionList || !selectionOpen) return;

		const around = [...(neighbors.get(node.id) ?? [])]
			.map((id) => byId.get(id))
			.filter(Boolean)
			.filter((item) => !item.el.classList.contains('is-hidden'))
			.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));

		selectionTitle.textContent = node.title;
		selectionMeta.textContent = `${roleLabels[node.role] ?? ''}${node.source === 'agent' ? ' · Agent 整理' : ' · 我的笔记'} · ${around.length} 个相连节点`;
		selectionList.innerHTML = '';

		if (around.length === 0) {
			const empty = document.createElement('li');
			empty.className = 'graph-selection-empty';
			empty.textContent = '当前没有可显示的相连节点。';
			selectionList.append(empty);
		} else {
			for (const item of around) {
				const li = document.createElement('li');
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'graph-selection-link';
				if (item.source === 'agent') button.classList.add('is-agent');
				button.textContent = item.title;
				button.addEventListener('click', (event) => {
					event.stopPropagation();
					selectNode(item);
				});
				li.append(button);
				selectionList.append(li);
			}
		}

		selectionOpen.href = node.href;
		selectionOpen.textContent = `打开「${node.title}」→`;
		selectionPanel.hidden = false;
	}

	function selectNode(node) {
		if (!node) return;
		selectedNode = node;
		for (const item of nodes) {
			item.el.setAttribute('aria-pressed', item === node ? 'true' : 'false');
		}
		highlight(node);
		renderSelection(node);
		status.textContent = `已选中：${node.title} · ${neighbors.get(node.id)?.size ?? 0} 个相连节点`;
	}

	function clearSelection() {
		selectedNode = null;
		for (const item of nodes) {
			item.el.classList.remove('is-active', 'is-neighbour', 'is-dim');
			item.el.setAttribute('aria-pressed', 'false');
		}
		for (const link of links) link.el.classList.remove('is-active', 'is-dim');
		if (selectionPanel) selectionPanel.hidden = true;
		status.textContent = defaultStatus;
	}

	selectionClose?.addEventListener('click', clearSelection);

	const search = document.getElementById('graph-search');
	search?.addEventListener('input', () => {
		const query = search.value.trim().toLowerCase();
		let count = 0;

		for (const node of nodes) {
			const match =
				!query ||
				node.title.toLowerCase().includes(query) ||
				node.tags?.some((tag) => tag.toLowerCase().includes(query));
			node.el.classList.toggle('is-filtered', !match);
			if (match) count += 1;
		}

		status.textContent = query ? `筛选「${query}」：${count} 篇笔记` : defaultStatus;
	});

	// ---------- 拖动 / 平移 / 缩放 ----------

	function startNodeDrag(event, node) {
		event.stopPropagation();
		event.preventDefault();
		svg.setPointerCapture(event.pointerId);

		dragNode = {
			node,
			startX: event.clientX,
			startY: event.clientY,
			moved: false,
		};
		node.fixed = true;
		highlight(node);
		status.textContent = `${node.title} · 松手后选中，拖动可以调整位置`;
	}

	svg.addEventListener('pointerdown', (event) => {
		if (event.button !== 0 && event.pointerType === 'mouse') return;
		svg.setPointerCapture(event.pointerId);
		panStart = {
			clientX: event.clientX,
			clientY: event.clientY,
			tx,
			ty,
			moved: false,
		};
	});

	svg.addEventListener('pointermove', (event) => {
		if (dragNode) {
			const point = worldPoint(viewPoint(event));
			dragNode.node.x = point.x;
			dragNode.node.y = point.y;
			dragNode.node.vx = 0;
			dragNode.node.vy = 0;

			if (Math.hypot(event.clientX - dragNode.startX, event.clientY - dragNode.startY) > 4) {
				dragNode.moved = true;
			}

			alpha = Math.max(alpha, 0.35);
			reheat();
			return;
		}

		if (panStart) {
			if (Math.hypot(event.clientX - panStart.clientX, event.clientY - panStart.clientY) > 4) {
				panStart.moved = true;
			}
			tx = panStart.tx + (event.clientX - panStart.clientX);
			ty = panStart.ty + (event.clientY - panStart.clientY);
			applyTransform();
		}
	});

	function endPointer(event) {
		if (dragNode) {
			const { node, moved } = dragNode;
			node.fixed = false;
			dragNode = null;
			alpha = 1;
			reheat();
			if (!moved) {
				selectNode(node);
			}
		} else if (panStart && !panStart.moved) {
			// 点空白处取消选中
			clearSelection();
		}
		panStart = null;
		if (svg.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
	}

	svg.addEventListener('pointerup', endPointer);
	svg.addEventListener('pointercancel', endPointer);

	svg.addEventListener(
		'wheel',
		(event) => {
			event.preventDefault();
			zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
		},
		{ passive: false },
	);

	for (const button of document.querySelectorAll('[data-graph-action]')) {
		button.addEventListener('click', () => {
			const action = button.getAttribute('data-graph-action');
			const rect = svg.getBoundingClientRect();
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;

			if (action === 'in') zoomAt(cx, cy, 1.25);
			if (action === 'out') zoomAt(cx, cy, 0.8);
			if (action === 'reset') {
				scale = 1;
				tx = 0;
				ty = 0;
				applyTransform();
			}
		});
	}

	// ---------- 力导向 ----------

	function reheat() {
		alpha = Math.max(alpha, 0.7);
		if (!running) {
			running = true;
			requestAnimationFrame(tick);
		}
	}

	function tick() {
		if (!running) return;

		const cx = viewWidth / 2;
		const cy = viewHeight / 2;

		for (let index = 0; index < nodes.length; index += 1) {
			const node = nodes[index];
			if (node.fixed) continue;

			let forceX = (cx - node.x) * 0.0018;
			let forceY = (cy - node.y) * 0.0018;

			for (let otherIndex = 0; otherIndex < nodes.length; otherIndex += 1) {
				if (index === otherIndex) continue;
				const other = nodes[otherIndex];
				let dx = node.x - other.x;
				let dy = node.y - other.y;
				let distance2 = dx * dx + dy * dy;
				if (distance2 < 1) {
					dx = (Math.random() - 0.5) * 2;
					dy = (Math.random() - 0.5) * 2;
					distance2 = dx * dx + dy * dy;
				}
				const distance = Math.sqrt(distance2);
				const force = 2600 / Math.max(distance2, 900);
				forceX += (dx / distance) * force;
				forceY += (dy / distance) * force;
			}

			node.vx = (node.vx + forceX * alpha) * 0.82;
			node.vy = (node.vy + forceY * alpha) * 0.82;

			const speed = Math.hypot(node.vx, node.vy);
			if (speed > 14) {
				node.vx = (node.vx / speed) * 14;
				node.vy = (node.vy / speed) * 14;
			}

			node.x += node.vx;
			node.y += node.vy;
		}

		for (const link of links) {
			const dx = link.target.x - link.source.x;
			const dy = link.target.y - link.source.y;
			const distance = Math.hypot(dx, dy) || 1;
			const desired = 128 + link.source.r + link.target.r;
			const force = (distance - desired) * 0.017 * alpha;
			const fx = (dx / distance) * force;
			const fy = (dy / distance) * force;

			if (!link.source.fixed) {
				link.source.vx += fx;
				link.source.vy += fy;
			}
			if (!link.target.fixed) {
				link.target.vx -= fx;
				link.target.vy -= fy;
			}
		}

		const padding = 54;
		for (const node of nodes) {
			if (node.fixed) continue;
			node.x = clamp(node.x, padding, viewWidth - padding);
			node.y = clamp(node.y, padding, viewHeight - padding);
		}

		alpha *= 0.96;
		render();

		if (alpha < 0.01) {
			running = false;
			return;
		}
		requestAnimationFrame(tick);
	}

	function render() {
		for (const link of links) {
			link.el.setAttribute('x1', link.source.x.toFixed(1));
			link.el.setAttribute('y1', link.source.y.toFixed(1));
			link.el.setAttribute('x2', link.target.x.toFixed(1));
			link.el.setAttribute('y2', link.target.y.toFixed(1));
		}
		for (const node of nodes) {
			node.el.setAttribute('transform', `translate(${node.x.toFixed(1)}, ${node.y.toFixed(1)})`);
		}
	}

	// ---------- 节点大小 ----------

	function setNodeScale(next) {
		nodeScale = clamp(next, 0.35, 1.35);
		for (const node of nodes) {
			node.r = node.baseR * nodeScale;
			node.dot.setAttribute('r', node.r);
			node.hit.setAttribute('r', node.r + 10);
			node.halo.setAttribute('r', node.r + 5);
			node.label.setAttribute('y', node.r + 13);
		}
		if (sizeInput) sizeInput.value = String(nodeScale);
		alpha = Math.max(alpha, 0.35);
		reheat();
	}

	sizeInput?.addEventListener('input', () => {
		setNodeScale(Number(sizeInput.value));
		try {
			localStorage.setItem('graph-node-scale-v2', String(nodeScale));
		} catch {
			// 存不了就算了
		}
	});

	// ---------- 只看我的笔记 ----------

	const hideAgent = document.getElementById('graph-hide-agent');
	const stats = document.querySelector('[data-graph-stats]');

	function updateStats() {
		if (!stats) return;
		const visibleNodes = nodes.filter((node) => !node.el.classList.contains('is-hidden')).length;
		const visibleLinks = links.filter((link) => !link.el.classList.contains('is-hidden')).length;
		stats.textContent = `${visibleNodes} 篇 · ${visibleLinks} 条链接`;
	}

	function applyAgentFilter() {
		const hide = Boolean(hideAgent?.checked);
		for (const node of nodes) {
			node.el.classList.toggle('is-hidden', hide && node.source === 'agent');
		}
		for (const link of links) {
			const agentEdge = link.source.source === 'agent' || link.target.source === 'agent';
			link.el.classList.toggle('is-hidden', hide && agentEdge);
		}
		if (hide && selectedNode?.source === 'agent') {
			clearSelection();
		} else if (selectedNode) {
			renderSelection(selectedNode);
		}
		status.textContent = hide
			? '只看我的笔记：已隐藏 Agent 整理材料。'
			: defaultStatus;
		updateStats();
	}

	hideAgent?.addEventListener('change', applyAgentFilter);
	applyAgentFilter();

	// ---------- 启动 ----------

	const focusId = new URLSearchParams(window.location.search).get('focus');
	const focus = focusId ? byId.get(focusId) : null;

	applyTransform();
	render();
	reheat();

	if (focus) {
		selectNode(focus);
		scale = 1.12;
		tx = viewWidth / 2 - focus.x * scale;
		ty = viewHeight / 2 - focus.y * scale;
		applyTransform();
		status.textContent = `已定位：${focus.title} · ${neighbors.get(focus.id)?.size ?? 0} 个相连节点`;
	}

	// 窗口尺寸变化时只更新画布和中心力，不重置用户调好的视角
	new ResizeObserver(() => {
		const nextWidth = width();
		const nextHeight = height();
		if (nextWidth === viewWidth && nextHeight === viewHeight) return;

		// 旋转屏幕 / 改窗口时按比例缩放已有坐标，别把节点留在画布外
		const ratioX = nextWidth / viewWidth;
		const ratioY = nextHeight / viewHeight;
		for (const node of nodes) {
			node.x *= ratioX;
			node.y *= ratioY;
			node.vx = 0;
			node.vy = 0;
		}
		tx *= ratioX;
		ty *= ratioY;

		viewWidth = nextWidth;
		viewHeight = nextHeight;
		svg.setAttribute('viewBox', `0 0 ${viewWidth} ${viewHeight}`);
		applyTransform();
		reheat();
	}).observe(stage);

	// 键盘用户：按 Esc 取消高亮
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			if (selectedNode) {
				clearSelection();
			} else {
				clearHighlight();
			}
			search?.blur();
		}
	});
}
