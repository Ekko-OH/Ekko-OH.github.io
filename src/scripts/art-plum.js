/**
 * 梅枝背景。
 *
 * 首次访问：同步生成完整的一幅枝条，立刻烘焙成白色透明蒙版并写入 localStorage。
 * 之后换页、切标签页：只把这张缓存图按当前尺寸重绘，再用当前主题色着色，
 * 不再随机、也不再跑生成。只有缓存损坏或隐私模式下，才退回逐帧生长动画。
 *
 * 生成算法：从视口四条边各起一条，向内生长。每段长度 0~6px、方向抖动 ±15°，
 * 然后按概率分成两枝；分叉概率用一棵子树共享的段数计数，群体规模才能稳定。
 * 四个起点各有各的计数器。
 *
 * 注意：缓存的是成品蒙版图像，不是随机种子。换页不会再“用同一个种子重新生成”，
 * 而是直接 drawImage 这张已经画好的图。
 */

const STROKE_WIDTH = 1;
const SEGMENT_MAX = 6; // 每段最长 6px
const ANGLE_JITTER = Math.PI / 12; // 分叉方向抖动 ±15°
const YOUNG_SEGMENTS = 30; // 每棵子树前多少段享受更高的分叉概率
const CHANCE_YOUNG = 0.8;
const CHANCE_OLD = 0.5;
const EDGE_BLEED = 100; // 出界超过这么多就停止生长

/** 生成时坐标保留一位小数，够用且让后面烘焙蒙版轻一点。 */
const roundCoord = (value) => Math.round(value * 10) / 10;

const CACHE_KEY = 'plum-art-image-v1';
const CACHE_VERSION = 1;

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

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createPlumArt(canvas, { onComplete } = {}) {
	const ctx = canvas.getContext('2d');

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
	/** 这一轮画过的所有线段，用来存成固定背景 */
	let segments = [];
	let completed = false;

	function resize() {
		const dpr = window.devicePixelRatio || 1;
		// DevTools 停靠/移动窗口的瞬间 clientWidth 可能短暂为 0，
		// 这里兜一下，避免 drawImage 收到 0 宽高报错。
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

		segments.push([roundCoord(x), roundCoord(y), roundCoord(nx), roundCoord(ny)]);

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

	function finish() {
		if (completed) return;
		completed = true;
		if (segments.length === 0) return;
		try {
			onComplete?.({ width, height, segments: segments.slice() });
		} catch (error) {
			console.error('plum finish callback failed', error);
		}
	}

	function settle() {
		if (drawn >= MIN_SEGMENTS || topUps >= MAX_TOP_UPS) {
			finish();
			return;
		}
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
		segments = [];
		completed = false;
		drawn = 0;
		topUps = 0;

		// 窄屏只留上下两条，左右会太挤
		const edges = width < 500 ? [0, 1] : [0, 1, 2, 3];
		queue = edges.map((edge) => seedAt(edge));

		lastFrame = performance.now();
		raf = requestAnimationFrame(tick);
	}

	/**
	 * 同步一次性生成完整枝条。第一页加载时用它，生成完立刻缓存，
	 * 这样即使马上切页也已经有一张固定画面可复用。
	 */
	function generate(color) {
		stop();
		resize();
		ctx.clearRect(0, 0, width, height);
		ctx.lineWidth = STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.strokeStyle = color;
		stroke = color;
		segments = [];
		completed = false;
		drawn = 0;
		topUps = 0;

		const edges = width < 500 ? [0, 1] : [0, 1, 2, 3];
		queue = edges.map((edge) => seedAt(edge));

		let index = 0;
		while (index < queue.length && drawn < MAX_SEGMENTS) {
			const task = queue[index];
			index += 1;
			task();

			if (index >= queue.length && queue.length > 0 && drawn < MIN_SEGMENTS && topUps < MAX_TOP_UPS) {
				topUps += 1;
				topUp();
			}
		}

		finish();
	}

	/**
	 * 直接绘制已经生成好的画面（白色枝条蒙版），不做生长动画。
	 * 用当前主题色重新着色，所以明暗切换也还是同一幅枝条。
	 */
	function drawMask(source, color) {
		stop();
		queue = [];
		if (canvas.clientWidth < 1 || canvas.clientHeight < 1) return;
		resize();
		ctx.clearRect(0, 0, width, height);

		// 按 cover 铺：保持缓存画面比例，宁可裁掉一点，也不在 DevTools 改变视口时被拉扁。
		const sourceWidth = source.naturalWidth || source.width || width;
		const sourceHeight = source.naturalHeight || source.height || height;
		const cover = Math.max(width / sourceWidth, height / sourceHeight);
		const drawWidth = sourceWidth * cover;
		const drawHeight = sourceHeight * cover;
		ctx.drawImage(
			source,
			(width - drawWidth) / 2,
			(height - drawHeight) / 2,
			drawWidth,
			drawHeight,
		);
		ctx.globalCompositeOperation = 'source-in';
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, width, height);
		ctx.globalCompositeOperation = 'source-over';
		stroke = color;
		completed = true;
	}

	return {
		/** 清空重画。color 传当前主题对应的描边色 */
		draw: (color) => start(color),
		generate,
		drawMask,
		stop,
		isRunning: () => Boolean(raf) || queue.length > 0,
		setColor: (color) => {
			ctx.strokeStyle = color;
			stroke = color;
		},
	};
}

/** 读取第一次生成时烘焙下来的成品图。 */
function readPlumCache() {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const data = JSON.parse(raw);
		if (
			data?.version !== CACHE_VERSION ||
			!Number.isFinite(data.width) ||
			!Number.isFinite(data.height) ||
			data.width <= 0 ||
			data.height <= 0 ||
			typeof data.image !== 'string' ||
			!data.image.startsWith('data:image/')
		) {
			return null;
		}
		return data;
	} catch {
		return null;
	}
}

function writePlumCache(data) {
	try {
		localStorage.setItem(
			CACHE_KEY,
			JSON.stringify({
				version: CACHE_VERSION,
				width: Math.round(data.width * 10) / 10,
				height: Math.round(data.height * 10) / 10,
				image: data.image,
			}),
		);
	} catch (error) {
		console.error('plum cache write failed', error);
	}
}

/** 把第一次生长出来的线段烘焙成一张白色透明蒙版，之后只复用这张图。 */
function createMaskImage(segments, sourceWidth, sourceHeight) {
	const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
	// 限制最长边，避免 4K/8K 屏幕把 localStorage 撑爆
	const scale = Math.min(dpr, 2560 / Math.max(sourceWidth, sourceHeight));
	const mask = document.createElement('canvas');
	mask.width = Math.max(1, Math.round(sourceWidth * scale));
	mask.height = Math.max(1, Math.round(sourceHeight * scale));

	const maskCtx = mask.getContext('2d');
	if (!maskCtx) return null;

	maskCtx.setTransform(scale, 0, 0, scale, 0, 0);
	maskCtx.lineWidth = STROKE_WIDTH;
	maskCtx.lineCap = 'round';
	maskCtx.strokeStyle = '#fff';

	for (const [x1, y1, x2, y2] of segments) {
		maskCtx.beginPath();
		maskCtx.moveTo(x1, y1);
		maskCtx.lineTo(x2, y2);
		maskCtx.stroke();
	}

	return mask;
}

/**
 * 挂到页面上的 canvas：优先显示缓存下来的成品画面；没有缓存时生成一次，
 * 画完把成品烘焙成图存起来。之后换页、切标签页都直接画这张图，不再跑生成。
 */
export function initPlumArt() {
	const canvas = document.querySelector('[data-art-plum]');
	if (!canvas) return;

	const cached = readPlumCache();
	/** @type {{ source: CanvasImageSource } | null} */
	let mask = null;
	let waitingForCache = Boolean(cached);

	const currentColor = () =>
		getComputedStyle(canvas).getPropertyValue('--art-stroke').trim() || '#88888825';

	const art = createPlumArt(canvas, {
		onComplete: ({ width, height, segments }) => {
			const maskCanvas = createMaskImage(segments, width, height);
			if (!maskCanvas) return;

			const webp = maskCanvas.toDataURL('image/webp', 0.92);
			const image = webp.startsWith('data:image/webp') ? webp : maskCanvas.toDataURL('image/png');

			mask = { source: maskCanvas };
			writePlumCache({ width, height, image });
			paint();
		},
	});

	function paint() {
		if (waitingForCache) return;
		const color = currentColor();

		if (mask) {
			art.drawMask(mask.source, color);
			return;
		}

		// 第一次生长过程中切换主题/尺寸，只换颜色，不要重新随机
		if (art.isRunning()) {
			art.setColor(color);
			return;
		}

		art.draw(color);
	}

	if (cached) {
		const image = new Image();
		image.onload = () => {
			waitingForCache = false;
			mask = { source: image };
			paint();
		};
		image.onerror = () => {
			waitingForCache = false;
			mask = null;
			try {
				// 缓存坏了就重新同步生成一张，不要退回逐帧长出来
				art.generate(currentColor());
			} catch (error) {
				console.error('plum regenerate failed', error);
				paint();
			}
		};
		image.src = cached.image;
	} else {
		waitingForCache = false;
		try {
			// 同步生成完整背景并立刻写入缓存；不依赖动画跑完
			art.generate(currentColor());
		} catch (error) {
			console.error('plum generate failed', error);
			paint();
		}
	}

	// 切换深浅色：同一幅画面，只换描边色
	new MutationObserver(paint).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme'],
	});

	// 故意不在 resize 时重绘：打开 DevTools / 拖动窗口会触发大量 resize，
	// 重绘会让背景闪一下，也会把画面按新宽高重新拉伸。canvas 本身是 100% 尺寸，
	// 交给 CSS 缩放同一张图即可；主题切换仍然会按当前尺寸重绘一次。
}
