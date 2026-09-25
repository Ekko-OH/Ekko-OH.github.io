/**
 * 梅枝背景。
 *
 * 照 antfu.me 的 ArtPlum（1.8KB，Vue 组件）用原生 JS 重写，无依赖。
 * 算法：从视口四条边各起一条，向内生长。每段长度 0~6px、方向抖动 ±15°，
 * 然后按概率分成两枝；每帧只推进待办队列里随机的一部分，其余推到下一帧，
 * 于是能看到枝条一帧一帧"抽"出来。队列空了就彻底停下，不空转。
 *
 * 几个容易写错的细节：
 *
 * 1. 分叉概率用的那个「段数」不是每条路径各自的深度，而是**沿着一整棵子树共享**的
 *    计数器。前 30 段按 80% 分叉，之后一律 50% —— 之后每段平均只生出一个子枝
 *    （2 × 0.5 = 1），群体规模稳定、枝条跑到画布外自然消亡。若按「每层深度」判，
 *    前 30 层 80% 分叉会让数量涨到 1.6^30，直接卡死。
 * 2. 四个起点**各有各的计数器**（参考站里是默认参数 `a = { value: 0 }`，每个种子新建
 *    一次），也就是 4 × 30 段的高概率预算。全树共用一个的话会明显比参考站稀疏。
 * 3. 这是个「临界分支过程」，**有时会提前灭绝**——枝条全跑出画布，段数远没到上限
 *    就结束了，看起来就偏稀。兜底做法是**再补几个起点接着长**（见 settle）。
 *    注意千万别用「清空重画」——那会让用户看到长到一半突然重来。
 */

const STROKE_WIDTH = 1;
const SEGMENT_MAX = 6; // 每段最长 6px
const ANGLE_JITTER = Math.PI / 12; // 分叉方向抖动 ±15°
const YOUNG_SEGMENTS = 30; // 每棵子树前多少段享受更高的分叉概率
const CHANCE_YOUNG = 0.8;
const CHANCE_OLD = 0.5;
const EDGE_BLEED = 100; // 出界超过这么多就停止生长

/**
 * 生长速度由两个数决定：
 *   - FRAME_INTERVAL：两帧至少间隔多少毫秒（帧率上限）
 *   - DEFER_FRACTION：每帧把**多大比例**的待办推迟到下一帧处理 —— 越大越慢
 *
 * 参考站是 25ms / 0.5（一半推迟、一半执行），实测约 6~8 秒就长满，比它自己那种
 * 慢吞吞长几十秒的观感快得多。这里用 40ms / 0.88：帧率还有 25fps、不至于一顿一顿，
 * 但每帧只推进 12%，整体慢约 4 倍，接近参考站的节奏。
 *
 * 注意别把语义写反：`Math.random() < DEFER_FRACTION` 为真时是**推迟**，
 * 所以这个数调小反而会变快。
 */
const FRAME_INTERVAL = 40;
const DEFER_FRACTION = 0.88;

/**
 * 段数上限。
 *
 * 参考站没有上限：它会画到所有枝条自然出界为止，实测 50 秒时仍在生长
 * （不透明像素 193k）。这里主动收敛：画到这么多段就停，得到一个稳定、中等密度的背景
 * ——实测参考站常见的收敛态约 30k 像素，和这个上限下的结果接近。
 * 想去掉上限就设成 Infinity。
 */
const MAX_SEGMENTS = 9000;
/** 低于这个段数就算"太稀"，往边上补种继续长 */
const MIN_SEGMENTS = 4500;
/** 补种次数上限，防止极端情况下反复补种 */
const MAX_TOP_UPS = 6;
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
	let topUps = 0;
	/** 当前这轮的颜色，供重画/补种时复用 */
	let stroke = '';

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

	/** 第 edge 条边的起点（0=上 1=下 2=左 3=右），位置随机取 20%~80% */
	function seedAt(edge) {
		const at = () => Math.random() * 0.6 + 0.2;
		if (edge === 0) return () => branch(at() * width, -5, Math.PI / 2, { count: 0 });
		if (edge === 1) return () => branch(at() * width, height + 5, -Math.PI / 2, { count: 0 });
		if (edge === 2) return () => branch(-5, at() * height, 0, { count: 0 });
		return () => branch(width + 5, at() * height, Math.PI, { count: 0 });
	}

	/** 太稀时补种：随机挑两条边再加两个起点，接着长（不清空重画） */
	function topUp() {
		const edges = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, 2);
		queue.push(...edges.map((edge) => seedAt(edge)));
	}

	function settle() {
		if (drawn >= MIN_SEGMENTS || topUps >= MAX_TOP_UPS) return;
		topUps += 1;
		topUp();
		lastFrame = performance.now();
		raf = requestAnimationFrame(tick);
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
			if (Math.random() < DEFER_FRACTION) queue.push(task);
			else task();
		}
		raf = requestAnimationFrame(tick);
	}

	function stop() {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
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
		topUps = 0;

		// 窄屏只留上下两条，左右会太挤
		const edges = width < 500 ? [0, 1] : [0, 1, 2, 3];
		queue = edges.map((edge) => seedAt(edge));

		if (reduceMotion) {
			let guard = 0;
			while (guard < MAX_STEPS && drawn < MAX_SEGMENTS) {
				if (queue.length === 0) {
					if (drawn >= MIN_SEGMENTS || topUps >= MAX_TOP_UPS) break;
					topUps += 1;
					topUp();
				}
				const pending = queue;
				queue = [];
				for (const task of pending) {
					// 内层也要判上限：一轮的待办可能有上千条，只在 while 上判会超出一大截
					if (drawn >= MAX_SEGMENTS) break;
					task();
					guard += 1;
				}
			}
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
