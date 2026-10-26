#!/usr/bin/env node
/**
 * 把 Obsidian vault 里带 `publish: true` 的笔记同步到博客。
 *
 * 设计原则：
 *   - Obsidian 是唯一写作现场，src/content/notes 只是发布副本
 *   - 只同步显式标了 publish 的笔记，避免把整个 vault 发出去
 *   - 图片复制到 public/images/obsidian/<笔记>/，正文路径随之改写
 *   - [[#同页标题]] 转成普通锚点；[[其他笔记]] 留给博客的双链插件
 *   - 输出文件带 `<!-- synced:obsidian ... -->` 标记，方便下次清理过期副本
 *
 * 用法：
 *   npm run sync
 *   OBSIDIAN_DIR="/path/to/卡片盒" npm run sync
 */
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const VAULT_DIR = path.resolve(
	process.env.OBSIDIAN_DIR || path.join(os.homedir(), 'i/Obsidian-Cloud/卡片盒'),
);
const NOTES_DIR = path.join(ROOT, 'src/content/notes');
const IMAGES_DIR = path.join(ROOT, 'public/images/obsidian');
const MANIFEST_FILE = path.join(ROOT, '.obsidian-sync.json');
const MARKER = '<!-- synced:obsidian';
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const INTERNAL_TAGS = new Set(['卡片盒', '永久', '闪念', '文献', '结构', '模板', '待整理']);
const ROLES = new Set(['overview', 'topic', 'model']);

function fail(message) {
	console.error(`\n✗ ${message}`);
	process.exitCode = 1;
}

function warn(message) {
	console.warn(`  ! ${message}`);
}

function unquote(value) {
	const text = String(value).trim();
	if (
		(text.startsWith('"') && text.endsWith('"')) ||
		(text.startsWith("'") && text.endsWith("'"))
	) {
		return text.slice(1, -1);
	}
	return text;
}

function parseFrontmatter(source) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
	if (!match) return { data: {}, body: source };

	const data = {};
	let currentKey = null;

	for (const rawLine of match[1].split(/\r?\n/)) {
		if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;

		const item = /^\s*-\s+(.*)$/.exec(rawLine);
		if (item && currentKey) {
			if (!Array.isArray(data[currentKey])) data[currentKey] = [];
			data[currentKey].push(unquote(item[1]));
			continue;
		}

		const pair = /^([^:#][^:]*?):\s*(.*)$/.exec(rawLine);
		if (!pair) continue;

		const key = pair[1].trim();
		const value = pair[2].trim();
		currentKey = null;

		if (!value) {
			data[key] = [];
			currentKey = key;
			continue;
		}

		if (value.startsWith('[') && value.endsWith(']')) {
			data[key] = value
				.slice(1, -1)
				.split(',')
				.map((part) => unquote(part))
				.filter(Boolean);
			continue;
		}

		if (/^(true|yes)$/i.test(value)) {
			data[key] = true;
		} else if (/^(false|no)$/i.test(value)) {
			data[key] = false;
		} else {
			data[key] = unquote(value);
		}
	}

	return { data, body: source.slice(match[0].length) };
}

function isTruthy(value) {
	return value === true || ['true', 'yes', '1', '是'].includes(String(value).trim().toLowerCase());
}

function asList(value) {
	if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
	if (typeof value === 'string' && value.trim()) {
		return value
			.split(/[,，]/)
			.map((item) => item.trim())
			.filter(Boolean);
	}
	return [];
}

function formatDate(value, fallback) {
	const date = value ? new Date(String(value)) : fallback;
	return (Number.isNaN(date.valueOf()) ? fallback : date).toISOString().slice(0, 10);
}

function safeName(value) {
	const name = String(value)
		.replace(/[\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 100);
	return name || 'note';
}

function safeSlugPath(value) {
	const segments = String(value)
		.replaceAll('\\', '/')
		.split('/')
		.map((segment) => segment.trim())
		.filter((segment) => segment && segment !== '.' && segment !== '..')
		.map((segment) => safeName(segment));
	return segments.join('/') || 'note';
}

function yamlString(value) {
	return JSON.stringify(String(value));
}

function dateFromStat(info) {
	return info.birthtime instanceof Date && info.birthtime.valueOf() > 0 ? info.birthtime : info.mtime;
}

function firstH1(body) {
	const match = /^#\s+(.+?)\s*$/m.exec(body);
	return match ? match[1].trim() : '';
}

/** 博客页头已经渲染了标题，正文里的同名 H1 要去掉，避免出现两个 h1 */
function stripTitleHeading(body, title) {
	const trimmed = body.trimStart();
	const match = /^#\s+(.+?)\s*(?:\r?\n|$)/.exec(trimmed);
	if (!match || match[1].trim() !== title) return body;
	return trimmed.slice(match[0].length).replace(/^\s+/, '');
}

async function collectMarkdown(dir, out = []) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (entry.name.startsWith('.')) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (['node_modules', 'Tmp', '_模板', 'assets'].includes(entry.name)) continue;
			await collectMarkdown(full, out);
		} else if (entry.isFile() && entry.name.endsWith('.md')) {
			out.push(full);
		}
	}
	return out;
}

function relativeToVault(file) {
	return path.relative(VAULT_DIR, file).split(path.sep).join('/');
}

async function buildAssetIndex(dir, map = new Map()) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await buildAssetIndex(full, map);
		} else if (entry.isFile() && IMAGE_EXT.test(entry.name)) {
			if (!map.has(entry.name)) map.set(entry.name, []);
			map.get(entry.name).push(full);
		}
	}
	return map;
}

function resolveAsset(reference, noteDir, assetIndex) {
	const clean = decodeURI(reference.split(/[?#]/)[0]);
	if (!clean || /^(https?:|data:|\/)/i.test(clean)) return null;

	const candidates = [
		path.resolve(noteDir, clean),
		path.resolve(noteDir, 'assets', clean),
		path.resolve(VAULT_DIR, clean),
	];
	const exact = candidates.find((candidate) => existsSync(candidate));
	if (exact) return exact;

	const byName = assetIndex.get(path.basename(clean));
	return byName?.length === 1 ? byName[0] : null;
}

async function replaceAsync(source, regex, replacer) {
	const matches = [...source.matchAll(regex)];
	if (matches.length === 0) return source;

	let output = '';
	let lastIndex = 0;
	for (const match of matches) {
		output += source.slice(lastIndex, match.index);
		output += await replacer(match);
		lastIndex = match.index + match[0].length;
	}
	return output + source.slice(lastIndex);
}

async function copyAsset(source, noteKey, cache) {
	if (cache.has(source)) return cache.get(source);

	const ext = path.extname(source);
	const base = path.basename(source, ext);
	const hash = createHash('sha1').update(path.relative(VAULT_DIR, source)).digest('hex').slice(0, 6);
	const fileName = `${base}-${hash}${ext}`;
	const dir = path.join(IMAGES_DIR, noteKey);
	await mkdir(dir, { recursive: true });
	await copyFile(source, path.join(dir, fileName));

	const webPath = `/images/obsidian/${encodeURIComponent(noteKey)}/${encodeURIComponent(fileName)}`;
	cache.set(source, webPath);
	return webPath;
}

async function transformBody(body, noteDir, noteKey, assetIndex, assetCache, stats) {
	let output = body.replace(/[ \t]+$/gm, '').replace(/%%[\s\S]*?%%/g, '');

	// 1. Obsidian 图片嵌入：![[image.png]] / ![[image.png|300]]
	output = await replaceAsync(
		output,
		/!\[\[([^[\]|]+?)(?:\|([^\]]+))?\]\]/g,
		async (match) => {
			const [full, target, alias] = match;
			const clean = target.trim();
			if (!IMAGE_EXT.test(clean)) return full;

			const source = resolveAsset(clean, noteDir, assetIndex);
			if (!source) {
				warn(`找不到图片：${clean}`);
				return full;
			}

			const webPath = await copyAsset(source, noteKey, assetCache);
			stats.images += 1;
			const width = /^(\d+)(?:x\d+)?$/.exec(alias?.trim() ?? '');
			const style = width ? ` style="width:${width[1]}px;"` : '';
			return `<img src="${webPath}" alt="${clean}"${style} />`;
		},
	);

	// 2. 普通 Markdown 图片
	output = await replaceAsync(
		output,
		/!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g,
		async (match) => {
			const [full, alt, rawTarget] = match;
			const target = rawTarget.replace(/^<|>$/g, '');
			if (!IMAGE_EXT.test(target)) return full;
			const source = resolveAsset(target, noteDir, assetIndex);
			if (!source) return full;
			const webPath = await copyAsset(source, noteKey, assetCache);
			stats.images += 1;
			return `![${alt}](${webPath})`;
		},
	);

	// 3. 裸 HTML <img src="assets/...">，保留 style 等属性
	output = await replaceAsync(
		output,
		/(<img\b[^>]*?\bsrc=)(["'])(.*?)\2/gi,
		async (match) => {
			const [full, prefix, quote, rawTarget] = match;
			if (!IMAGE_EXT.test(rawTarget) || rawTarget.startsWith('/images/')) return full;
			const source = resolveAsset(rawTarget, noteDir, assetIndex);
			if (!source) return full;
			const webPath = await copyAsset(source, noteKey, assetCache);
			stats.images += 1;
			return `${prefix}${quote}${webPath}${quote}`;
		},
	);

	// 4. 同篇标题链接：[[#小节]] → [小节](#slug)
	output = output.replace(/\[\[#([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (full, heading, alias) => {
		const text = (alias ?? heading).trim();
		const slug = new GithubSlugger().slug(heading.trim());
		return `[${text}](#${slug})`;
	});

	return output;
}

function outputFrontmatter({ title, description, date, updated, tags, role, aliases, slug, order, source, uuid }) {
	const lines = ['---', `title: ${yamlString(title)}`];
	// uuid 是这篇笔记的长期身份证：只在发布时生成一次，之后永不改写
	if (uuid) lines.push(`uuid: ${yamlString(uuid)}`);

	if (description) lines.push(`description: ${yamlString(description)}`);
	lines.push(`date: ${date}`);
	if (updated && updated !== date) lines.push(`updated: ${updated}`);
	lines.push(`role: ${role}`);
	if (source === 'agent') lines.push('source: agent');
	if (order !== undefined) lines.push(`order: ${order}`);
	lines.push(`tags: [${tags.map(yamlString).join(', ')}]`);
	if (aliases.length > 0) lines.push(`aliases: [${aliases.map(yamlString).join(', ')}]`);
	if (slug) lines.push(`slug: ${yamlString(slug)}`);

	lines.push('---');
	return lines.join('\n');
}

async function loadManifest() {
	try {
		return JSON.parse(await readFile(MANIFEST_FILE, 'utf8'));
	} catch {
		return { generated: {} };
	}
}

async function main() {
	if (!existsSync(VAULT_DIR)) {
		fail(`找不到 Obsidian 目录：${VAULT_DIR}`);
		return;
	}

	console.log(`Obsidian: ${VAULT_DIR}`);
	console.log(`博客:     ${path.relative(ROOT, NOTES_DIR)}\n`);

	const files = await collectMarkdown(VAULT_DIR);
	const assetIndex = await buildAssetIndex(VAULT_DIR);
	const oldManifest = await loadManifest();
	const generated = {};
	const stats = { notes: 0, images: 0, skipped: 0 };

	for (const file of files) {
		const relative = relativeToVault(file);
		const source = await readFile(file, 'utf8');
		const { data, body } = parseFrontmatter(source);

		// 页面类笔记（目前是首页 About）由 sync-about.mjs 单独处理，
		// 不要把它们放进笔记集和 Notes 时间线。
		if (String(data.page || '').toLowerCase() === 'about') {
			stats.skipped += 1;
			continue;
		}

		if (!isTruthy(data.publish)) {
			stats.skipped += 1;
			continue;
		}

		const title = String(data.title || data.标题 || firstH1(body) || path.basename(file, '.md')).trim();
		const isOverview = /总览|索引|地图|导航/.test(title) || relative.startsWith('4 结构/');
		const explicitRole = String(data.role || '').trim();
		const type = String(data.type || '').trim().toLowerCase();
		const role = ROLES.has(explicitRole)
			? explicitRole
			: ['总览', '结构', 'overview'].includes(type)
				? 'overview'
				: ['模型', 'model'].includes(type)
					? 'model'
					: isOverview
						? 'overview'
						: 'topic';

		const sourceTags = asList(data.blog_tags ?? data.tags ?? data.标签);
		const tags = [...new Set(sourceTags.filter((tag) => !INTERNAL_TAGS.has(tag)))];
		const aliases = [...new Set(asList(data.aliases ?? data.别名))];

		const info = await stat(file);
		const fallback = dateFromStat(info);
		const date = formatDate(data.date ?? data.创建 ?? data.created, fallback);
		const updated = formatDate(data.updated ?? data.更新 ?? data.modified, fallback);

		const blogSlug = String(data.blog_slug ?? data.blogSlug ?? '').replace(/\.md$/i, '');
		const targetRel = blogSlug
			? `${safeSlugPath(String(blogSlug))}.md`
			: `${safeName(title)}.md`;
		const target = path.resolve(NOTES_DIR, targetRel);

		if (!target.startsWith(NOTES_DIR + path.sep)) {
			fail(`不安全的同步路径：${targetRel}`);
			continue;
		}

		const noteKey = targetRel.replace(/\.md$/i, '').replace(/[\\/]/g, '-');
		// 每次重建这个笔记的图片目录，避免改图后留下旧文件
		await rm(path.join(IMAGES_DIR, noteKey), { recursive: true, force: true });
		const assetCache = new Map();
		const transformed = await transformBody(
			stripTitleHeading(body, title),
			path.dirname(file),
			noteKey,
			assetIndex,
			assetCache,
			stats,
		);

		const isAgentSource =
			isTruthy(data.agent) ||
			relative.startsWith('5 Agent') ||
			relative.startsWith('Agent');

		const rawOrder = data.blog_order ?? data.order;
		const order =
			rawOrder !== undefined && rawOrder !== '' && !Number.isNaN(Number(rawOrder))
				? Number(rawOrder)
				: undefined;

		const frontmatter = outputFrontmatter({
			title,
			description: data.blog_description
				? String(data.blog_description)
				: data.description
					? String(data.description)
					: '',
			date,
			updated,
			tags,
			role,
			aliases,
			slug: data.slug ? String(data.slug) : '',
			order,
			source: isAgentSource ? 'agent' : 'human',
			uuid: data.uuid ? String(data.uuid) : '',
		});

		const marker = `${MARKER} source="${relative}" -->`;
		const content = `${frontmatter}\n\n${marker}\n\n${transformed.trim()}\n`;

		await mkdir(path.dirname(target), { recursive: true });

		if (existsSync(target)) {
			const previous = await readFile(target, 'utf8');
			if (!previous.includes(MARKER)) {
				warn(`覆盖了非同步文件：${path.relative(ROOT, target)}`);
			}
		}

		await writeFile(target, content, 'utf8');
		generated[relative] = { target: targetRel, images: [...assetCache.values()] };
		stats.notes += 1;
		console.log(`✓ ${relative}  →  ${targetRel}`);
	}

	// 清理上次同步、这次已经取消发布的副本；只删带 marker 的文件。
	// 注意：笔记在 vault 里改名/换目录时 source 会变，但 target 可能没变，
	// 这种 target 仍然属于这次同步结果，不能删。
	const currentTargets = new Set(Object.values(generated).map((entry) => entry.target));
	for (const [source, entry] of Object.entries(oldManifest.generated ?? {})) {
		if (generated[source] || currentTargets.has(entry.target)) continue;
		const target = path.resolve(NOTES_DIR, entry.target);
		if (!target.startsWith(NOTES_DIR + path.sep) || !existsSync(target)) continue;
		const content = await readFile(target, 'utf8');
		if (content.includes(MARKER)) {
			await rm(target);
			console.log(`- 删除过期副本：${entry.target}`);
		}
	}

	await writeFile(
		MANIFEST_FILE,
		`${JSON.stringify({ generated, updatedAt: new Date().toISOString() }, null, 2)}\n`,
		'utf8',
	);

	console.log(`\n完成：${stats.notes} 篇笔记，${stats.images} 张图片；跳过 ${stats.skipped} 篇未发布笔记。`);
}

main().catch((error) => {
	fail(error.stack ?? String(error));
});
