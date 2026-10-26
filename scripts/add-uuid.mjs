#!/usr/bin/env node
/**
 * 给 vault 里已发布的笔记补 uuid（UUIDv7）。
 *
 * 只补不改：已经有 uuid 的文件原样跳过，所以随时可以重跑。
 * 只在 `publish: true` 的笔记上动手——没发布的内容还不需要身份证。
 *
 * 用法：
 *   node scripts/add-uuid.mjs --dry    # 只看会改哪些
 *   node scripts/add-uuid.mjs          # 真的写
 */
import { randomBytes } from 'node:crypto';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DRY = process.argv.includes('--dry');
const VAULT_DIR = path.resolve(
	process.env.OBSIDIAN_DIR || path.join(os.homedir(), 'i/Obsidian-Cloud/卡片盒'),
);
const SKIP_DIRS = new Set(['.obsidian', 'assets', '_模板', 'node_modules']);

/** UUIDv7：前 48 位是毫秒时间戳，按创建时间天然有序 */
function uuidv7() {
	const bytes = randomBytes(16);
	bytes.writeUIntBE(Date.now(), 0, 6);
	bytes[6] = (bytes[6] & 0x0f) | 0x70;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function* walk(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (entry.name.startsWith('.')) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			yield* walk(full);
		} else if (entry.isFile() && entry.name.endsWith('.md')) {
			yield full;
		}
	}
}

function splitFrontmatter(source) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
	if (!match) return null;
	return {
		head: source.slice(0, match.index),
		body: source.slice(match[0].length),
		yaml: match[1],
		closing: source.slice(match[1].length + 4, match[0].length),
	};
}

const rows = [];
for await (const file of walk(VAULT_DIR)) {
	const source = await readFile(file, 'utf8');
	const fm = splitFrontmatter(source);
	if (!fm) continue;
	if (!/^publish:\s*true\s*$/m.test(fm.yaml)) continue;
	if (/^uuid:/m.test(fm.yaml)) continue;

	const uuid = uuidv7();
	const info = await stat(file);
	rows.push({ file: path.relative(VAULT_DIR, file), uuid, mtime: info.mtime });

	if (!DRY) {
		const nextYaml = `${fm.yaml}\nuuid: "${uuid}"`;
		const next = `---\n${nextYaml}\n---\n${fm.body}`;
		await writeFile(file, next, 'utf8');
	}
}

rows.sort((a, b) => a.file.localeCompare(b.file));
for (const row of rows) {
	console.log(`${row.uuid}  ${row.file}`);
}
console.log(
	`\n${DRY ? '（dry run）' : ''}共 ${rows.length} 篇${DRY ? '待补' : '已补'} uuid`,
);
