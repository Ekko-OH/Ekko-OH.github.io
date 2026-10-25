/**
 * 梅枝背景。
 *
 * 参考 antfu 的 ArtPlum：从视口四条边各起一条，向内逐帧生长。
 * 每次页面加载都重新长一次，不做图片缓存、不存种子。
 * 密度上限 10000 段，避免生成得比参考页更密。
 */

const STROKE_WIDTH = 1;
const SEGMENT_MAX = 6; // 每段最长 6px
const ANGLE_JITTER = Math.PI / 12; // 分叉方向抖动 ±15°
const YOUNG_SEGMENTS = 30; // 每棵子树前多少段享受更高的分叉概率
const CHANCE_YOUNG = 0.8;
const CHANCE_OLD = 0.5;
const EDGE_BLEED = 100; // 出界超过这么多就停止生长
const MAX_SEGMENTS = 10_000;

const FRAME_INTERVAL = 1000 / 50; // 50fps
const DEFER_FRACTION = 0.5; // 每帧推迟一半，保留有机的推进节奏

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createPlumArt(canvas) {
	const ctx = canvas.getContext('2d');

	let width = 0;
	let height = 0;
	let queue = [];
	let raf = 0;
	let lastFrame = 0;
	let drawn = 0;
	let stroke = '';

	function resize() {
		const dpr = window.devicePixelRatio || 1;
		width = Math.max(1, canvas.clientWidth);
		height = Math.max(1, canvas.clientHeight);
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	function branch(x, y, angle, state) {
		const len = Math.random() * SEGMENT_MAX;
		const nx = x + len * Math.cos(angle);
		const ny = y + len * Math.sin(angle);

		state.count += 1;

		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(nx, ny);
		ctx.stroke();

		// 和 ArtPlum 一致：先定下两个子枝角度，再做越界判断
		const rad1 = angle + Math.random() * ANGLE_JITTER;
		const rad2 = angle - Math.random() * ANGLE_JITTER;

		if (nx < -EDGE_BLEED || nx > width + EDGE_BLEED || ny < -EDGE_BLEED || ny > height + EDGE_BLEED) {
			return;
		}

		drawn += 1;
		const chance = state.count <= YOUNG_SEGMENTS ? CHANCE_YOUNG : CHANCE_OLD;

		if (Math.random() < chance) {
			queue.push(() => branch(nx, ny, rad1, state));
		}
		if (Math.random() < chance) {
			queue.push(() => branch(nx, ny, rad2, state));
		}
	}

	/** 第 edge 条边的起点（0=上 1=下 2=左 3=右），位置随机取 20%~80% */
	function seedAt(edge) {
		const at = () => Math.random() * 0.6 + 0.2;
		if (edge === 0) return () => branch(at() * width, -5, Math.PI / 2, { count: 0 });
		if (edge === 1) return () => branch(at() * width, height + 5, -Math.PI / 2, { count: 0 });
		if (edge === 2) return () => branch(-5, at() * height, 0, { count: 0 });
		return () => branch(width + 5, at() * height, Math.PI, { count: 0 });
	}

	function stop() {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		queue = [];
	}

	function tick(now) {
		if (now - lastFrame < FRAME_INTERVAL) {
			raf = requestAnimationFrame(tick);
			return;
		}
		lastFrame = now;

		if (queue.length === 0 || drawn >= MAX_SEGMENTS) {
			raf = 0;
			return;
		}

		const pending = queue;
		queue = [];
		for (const task of pending) {
			if (drawn >= MAX_SEGMENTS) break;
			if (Math.random() < DEFER_FRACTION) queue.push(task);
			else task();
		}
		raf = requestAnimationFrame(tick);
	}

	function start(color) {
		stop();
		resize();
		ctx.clearRect(0, 0, width, height);
		ctx.lineWidth = STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.strokeStyle = color;
		stroke = color;
		drawn = 0;

		// 窄屏只留上下两条，左右会太挤
		const edges = width < 500 ? [0, 1] : [0, 1, 2, 3];
		queue = edges.map((edge) => seedAt(edge));

		lastFrame = performance.now();
		raf = requestAnimationFrame(tick);
	}

	return {
		draw: (color) => start(color),
		stop,
	};
}

/**
 * 每次页面加载都重新生长；不缓存成品、不写 localStorage。
 */
export function initPlumArt() {
	const canvas = document.querySelector('[data-art-plum]');
	if (!canvas) return;

	// 清掉旧版本留下的缓存，避免误以为还在复用
	try {
		for (const key of Object.keys(localStorage)) {
			if (key.startsWith('plum-art')) localStorage.removeItem(key);
		}
	} catch {
		// localStorage 不可用就忽略
	}

	const art = createPlumArt(canvas);

	const draw = () => {
		const color = getComputedStyle(canvas).getPropertyValue('--art-stroke').trim() || '#88888825';
		art.draw(color);
	};

	draw();

	// 切换深浅色时重新长一次；每次都是新的随机枝条
	new MutationObserver(draw).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme'],
	});
}
