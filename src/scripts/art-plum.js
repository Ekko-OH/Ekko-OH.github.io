/**
 * 梅枝背景。
 *
 * 照 antfu.me 的 ArtPlum（1.8KB，Vue 组件）用原生 JS 重写，无依赖。
 * 算法：从视口四条边各起一条，向内生长。每段长度 0~6px、方向抖动 ±15°，
 * 然后按概率分成两枝；每帧只推进待办队列里随机的一半，其余推到下一帧，
 * 于是能看到枝条一帧一帧"抽"出来。队列空了就彻底停下，不空转。
 *
 * 三个容易写错的细节：
 *
 * 1. 分叉概率用的那个「段数」不是每条路径各自的深度，而是**沿着一整棵子树共享**的
 *    计数器。前 30 段按 80% 分叉，之后一律 50% —— 之后每段平均只生出一个子枝
 *    （2 × 0.5 = 1），群体规模稳定、枝条跑到画布外自然消亡。若按「每层深度」判，
 *    前 30 层 80% 分叉会让数量涨到 1.6^30，直接卡死。
 * 2. 四个起点**各有各的计数器**（参考站里是默认参数 `a = { value: 0 }`，每个种子新建
 *    一次），也就是 4 × 30 段的高概率预算。全树共用一个的话会明显比参考站稀疏。
 * 3. 这是个「临界分支过程」，**有时会提前灭绝**——枝条全跑出画布，段数远没到上限
 *    就结束了，看起来就偏稀（实测三次能跑到 6948 / 24615 / 27973 像素，差 4 倍）。
 *    参考站也有这个特性。这里加了兜底：太稀就换个形状重画（见 MIN_SEGMENTS）。
 */

const STROKE_WIDTH = 1;
const SEGMENT_MAX = 6; // 每段最长 6px
const ANGLE_JITTER = Math.PI / 12; // 分叉方向抖动 ±15°
const YOUNG_SEGMENTS = 30; // 每棵子树前多少段享受更高的分叉概率
const CHANCE_YOUNG = 0.8;
const CHANCE_OLD = 0.5;
const EDGE_BLEED = 100; // 出界超过这么多就停止生长
const FRAME_INTERVAL = 25; // 帧节流，约 40fps，和参考站一致

/**
 * 段数上限。
 *
 * 参考站没有上限：实测它 50 秒时仍在生长（不透明像素 193k，是 20 秒时的 4 倍），
 * 也就是背景会一直变密、动画一直占着 CPU（要等所有枝条自然出界，而这个"灭绝时间"
 * 的尾巴很长）。这里主动收敛：画到这么多段就停，得到一个稳定、中等密度的背景。
 * 想去掉上限就设成 Infinity。
 */
const MAX_SEGMENTS = 9000;
/** 低于这个段数就算"太稀"，换个形状重来（见文件头第 3 点） */
const MIN_SEGMENTS = 4500;
const MAX_ATTEMPTS = 4;
/** 减少动效时一次性画完的保险阀 */
const MAX_STEPS = 200000;

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createPlumArt(canvas) {
	const ctx = canvas.getContext('2d');
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	let width = 0;
	let height = 0;
	let queue = [];
	let raf = 0;
	let lastFrame = 0;
	/** 已画段数：既用于封顶，也用于判断这棵树是不是太稀 */
	let drawn = 0;
	/** 当前这轮的颜色和重试次数，供 settle 使用 */
	let stroke = '';
	let attempt = 1;

	function resize() {
		const dpr = window.devicePixelRatio || 1;
		width = canvas.clientWidth;
		height = canvas.clientHeight;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	function branch(x, y, angle, state) {
		const len = Math.random() * SEGMENT_MAX;
		const nx = x + len * Math.cos(angle);
		const ny = y + len * Math.sin(angle);

		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(nx, ny);
		ctx.stroke();

		if (nx < -EDGE_BLEED || nx > width + EDGE_BLEED || ny < -EDGE_BLEED || ny > height + EDGE_BLEED) {
			return;
		}

		state.count += 1;
		drawn += 1;
		const chance = state.count <= YOUNG_SEGMENTS ? CHANCE_YOUNG : CHANCE_OLD;

		if (Math.random() < chance) {
			queue.push(() => branch(nx, ny, angle + Math.random() * ANGLE_JITTER, state));
		}
		if (Math.random() < chance) {
			queue.push(() => branch(nx, ny, angle - Math.random() * ANGLE_JITTER, state));
		}
	}

	/** 生长结束后的收尾：太稀就换个形状重来 */
	function settle() {
		if (drawn < MIN_SEGMENTS && attempt < MAX_ATTEMPTS) {
			start(stroke, attempt + 1);
		}
	}

	function tick(now) {
		if (now - lastFrame < FRAME_INTERVAL) {
			raf = requestAnimationFrame(tick);
			return;
		}
		lastFrame = now;

		if (queue.length === 0 || drawn >= MAX_SEGMENTS) {
			raf = 0;
			settle();
			return;
		}

		const pending = queue;
		queue = [];
		for (const task of pending) {
			// 一帧内的待办可能有上千条，这里也要判上限，否则每次跑出来的密度会差很多
			if (drawn >= MAX_SEGMENTS) break;
			if (Math.random() < 0.5) queue.push(task);
			else task();
		}
		raf = requestAnimationFrame(tick);
	}

	function stop() {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	}

	function start(color, nextAttempt = 1) {
		stop();
		resize();
		ctx.clearRect(0, 0, width, height);
		ctx.lineWidth = STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.strokeStyle = color;
		stroke = color;
		attempt = nextAttempt;
		drawn = 0;

		// 起点在边长的 20%~80% 处，稍微画到视口外一点，好让枝条从边缘"长进来"。
		// 每个起点一份独立的 state（见文件头第 2 点）
		const at = () => Math.random() * 0.6 + 0.2;
		const seed = (x, y, angle) => () => branch(x, y, angle, { count: 0 });
		queue = [
			seed(at() * width, -5, Math.PI / 2),
			seed(at() * width, height + 5, -Math.PI / 2),
			seed(-5, at() * height, 0),
			seed(width + 5, at() * height, Math.PI),
		];
		// 窄屏只留上下两条，左右会太挤
		if (width < 500) queue = queue.slice(0, 2);

		if (reduceMotion) {
			let guard = 0;
			while (queue.length > 0 && guard < MAX_STEPS && drawn < MAX_SEGMENTS) {
				const pending = queue;
				queue = [];
				for (const task of pending) {
					// 内层也要判上限：一轮的待办可能有上千条，只在 while 上判会超出一大截
					if (drawn >= MAX_SEGMENTS) break;
					task();
					guard += 1;
				}
			}
			settle();
			return;
		}

		lastFrame = performance.now();
		raf = requestAnimationFrame(tick);
	}

	return {
		/** 清空重画。color 传当前主题对应的描边色 */
		draw: (color) => start(color),
		stop,
	};
}

/**
 * 挂到页面上的 canvas：初次绘制、跟随主题改色、窗口变化时重画。
 */
export function initPlumArt() {
	const canvas = document.querySelector('[data-art-plum]');
	if (!canvas) return;

	const art = createPlumArt(canvas);

	const draw = () => {
		// 颜色从 CSS 变量取，明暗两套各自定义（参考站是写死一个灰，暗色下偏淡）
		const color = getComputedStyle(canvas).getPropertyValue('--art-stroke').trim() || '#88888825';
		art.draw(color);
	};

	draw();

	// 切换深浅色时重画（形状会重新随机，可以接受）
	new MutationObserver(draw).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme'],
	});

	// 窗口尺寸变化时重画，防抖
	let resizeTimer = 0;
	window.addEventListener('resize', () => {
		clearTimeout(resizeTimer);
		resizeTimer = window.setTimeout(draw, 300);
	});
}
