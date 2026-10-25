/**
 * 给每个代码块加一个「复制」按钮。
 *
 * 为什么在浏览器端包一层，而不是构建期出组件：
 *   正文是 markdown 渲染出来的，构建期没有一个地方能拿到「每个 <pre> 的插槽」；
 *   等 DOM 就绪后统一包一层最省事，也不会动到 Shiki 已经写好的高亮结构。
 *
 * 结构变成：
 *   <div class="code-block">
 *     <pre class="astro-code">…</pre>
 *     <button class="code-copy">复制</button>
 *   </div>
 *
 * 按钮必须放在 <pre> 外面：pre 里的所有文本都会被 textContent 读走，
 * 塞进去的话复制出来的代码末尾会多一个「复制」。
 */

/** 拿代码文本。Shiki 把每一行包成 <span class="line">，textContent 仍然保留换行。 */
function readCode(pre) {
	const code = pre.querySelector('code') ?? pre;
	// 只吃掉末尾的空行：中间的空行是代码的一部分，不能动
	return code.textContent.replace(/\n+$/, '');
}

/**
 * 写入剪贴板。
 *
 * 优先用异步 API；它在非安全上下文（比如局域网用 http:// 打开）里根本不存在，
 * 所以还要留一条 textarea + execCommand 的老路——这条路的唯一缺点是会闪一下选区。
 */
async function writeClipboard(text) {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (error) {
			// 没权限或被浏览器拒绝，往下走降级方案
		}
	}

	const textarea = document.createElement('textarea');
	textarea.value = text;
	// 放在视口外，避免页面跳动；readonly 防止移动端弹键盘
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.top = '-1000px';
	textarea.style.opacity = '0';
	document.body.append(textarea);

	const selection = document.getSelection();
	// 先存下用户原本的选区，复制完要还回去
	const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

	try {
		textarea.select();
		const ok = document.execCommand('copy');
		if (previous && selection) {
			selection.removeAllRanges();
			selection.addRange(previous);
		}
		return ok;
	} catch (error) {
		console.warn('[code-copy] 复制失败', error);
		return false;
	} finally {
		textarea.remove();
	}
}

function createButton(pre) {
	const button = document.createElement('button');
	button.type = 'button';
	// 用 title 而不是 aria-label：按钮文字本身就是标签，别让读屏读两遍
	button.title = '复制代码';
	button.className = 'code-copy';
	button.textContent = '复制';
	button.setAttribute('aria-live', 'polite');

	let timer = 0;

	button.addEventListener('click', async () => {
		const ok = await writeClipboard(readCode(pre));

		window.clearTimeout(timer);
		button.dataset.state = ok ? 'done' : 'error';
		button.textContent = ok ? '已复制' : '复制失败';

		timer = window.setTimeout(() => {
			delete button.dataset.state;
			button.textContent = '复制';
		}, 1600);
	});

	return button;
}

export function initCodeCopy() {
	const blocks = document.querySelectorAll('.prose pre');
	if (blocks.length === 0) return;

	for (const pre of blocks) {
		// 已经包过了就别重复包（万一以后上了 View Transitions，脚本可能跑两次）
		if (pre.parentElement?.classList.contains('code-block')) continue;

		const wrapper = document.createElement('div');
		wrapper.className = 'code-block';

		pre.replaceWith(wrapper);
		wrapper.append(pre, createButton(pre));
	}
}
