/**
 * 只在页面里存在 .mermaid 时才动态加载 Mermaid。
 *
 * 主题切换时重新渲染：Mermaid 的配色是在 render 时写进 SVG 的，
 * 不能像普通 CSS 那样跟着 data-theme 自动变。
 */
let rendering = false;
let pending = false;
let sequence = 0;

function isDark() {
	return document.documentElement.getAttribute('data-theme') === 'dark';
}

async function renderAll(blocks) {
	if (rendering) {
		pending = true;
		return;
	}

	rendering = true;
	try {
		const mermaid = (await import('mermaid')).default;
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: isDark() ? 'dark' : 'default',
			fontFamily: 'Inter, ui-sans-serif, "PingFang SC", "Microsoft YaHei", sans-serif',
		});

		for (const block of blocks) {
			if (!block.dataset.code) block.dataset.code = block.textContent;
			try {
				const { svg } = await mermaid.render(`mermaid-${sequence++}`, block.dataset.code);
				block.innerHTML = svg;
				block.classList.add('mermaid-rendered');
				block.classList.remove('mermaid-error');
			} catch (error) {
				block.classList.add('mermaid-error');
				console.warn('[mermaid] 渲染失败', error);
			}
		}
	} catch (error) {
		console.warn('[mermaid] 加载失败', error);
	} finally {
		rendering = false;
		if (pending) {
			pending = false;
			await renderAll(blocks);
		}
	}
}

export function initMermaid() {
	const blocks = [...document.querySelectorAll('.mermaid')];
	if (blocks.length === 0) return;

	renderAll(blocks);

	new MutationObserver(() => {
		renderAll(blocks);
	}).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme'],
	});
}
