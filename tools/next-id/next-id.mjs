#!/usr/bin/env node
//
//  next-id — 次の空き ID を出力し、同時に予約する（harness next-id。依存ゼロの Node）
//
//  ディレクトリの一覧から次の番号を推測すると、並行して動く作業が同じ番号を取る（R-204）。
//  定義済みの ID（読み方は tools/_shared/refs.mjs。lint refs・index と同じ）と、まだ使われていない予約の両方を使用済みとして数える。
//
//  使い方:
//    harness next-id <goal|uc|req|br|nfr|adr> [--reserve N] [--root .] [--config harness.config.json]
//      次の空き ID を N 件（既定 1）出力し、同時に予約する。予約は .trace-reservations.json に mkdir ロックで原子的に記録するので、
//      並行する作業が同時に呼んでも同じ番号は返らない。req は UC.md の表の ID も使用済みに数える
//
//  終了コード: 0 = 出力した / 2 = 使い方・設定エラー
//

import { existsSync, mkdirSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { splitUc } from "../_shared/reqs.mjs";
import { specDirs } from "../_shared/spec-tree.mjs";
import { DOC_PATHS, collectDefinitions, lookup, openProject, p, read, usage, useCommandName, walk } from "../_shared/refs.mjs";
import { exitWith } from "../_shared/stdio.mjs";

const NAME = "next-id";
useCommandName(NAME);

//  採番は「読んで最大＋1」だけでは並行 Task が同じ番号を得る。予約台帳（.trace-reservations.json）を
//  mkdir ロック（存在すれば EEXIST になる原子操作）の中で読み書きし、返した番号をその場で使用済みにする。
//  予約は ID が定義・参照された時点で自然に消える（台帳から落とす）。1 日たっても使われない予約は落とす
//  （番号は意味を持たず再利用も禁じられていないので、漏れた番号が空くだけで害はない）
const RESERVATION_FILE = ".trace-reservations.json";
const RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;
const LOCK_STALE_MS = 30 * 1000;

function withLock(root, fn) {
	const lock = join(root, ".trace-next.lock");
	const deadline = Date.now() + 5000;
	for (;;) {
		try {
			mkdirSync(lock);
			break;
		} catch (e) {
			if (e.code !== "EEXIST") throw e;
			try {
				if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
					rmdirSync(lock); //  落ちたプロセスのロック
					continue;
				}
			} catch {}
			if (Date.now() > deadline) {
				exitWith(2, `${NAME}: 採番ロックが取れない（${lock} が残っている。他の next-id が動いていなければ削除する）`);
			}
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 + Math.floor(Math.random() * 20));
		}
	}
	try {
		return fn();
	} finally {
		try {
			rmdirSync(lock);
		} catch {}
	}
}

function usedNumbers(cfg, kind, prefix) {
	const nums = new Set(Object.keys(collectDefinitions(cfg)).filter((i) => i.startsWith(prefix)).map((i) => Number(i.split("-")[1])));
	//  GOAL の番号は概要の GOAL の表の行（collectDefinitions。planned・withdrawn も含む）と、GOAL のフォルダの名前から数える
	//  （行を消し忘れたフォルダの番号も使い回さない。ADR-0076）
	if (kind === "goal")
		for (const d of specDirs(p(cfg, "docs.goals_dir")).dirs) {
			const m = /^GOAL-(\d+)/.exec(basename(d));
			if (m) nums.add(Number(m[1]));
		}
	//  UC.md の状態 × イベント表が予約した REQ ID は、ファイルがまだ無くても使用済み
	if (kind === "req")
		for (const f of walk(p(cfg, "docs.goals_dir"), [".md"]))
			if (basename(f) === "UC.md") {
				//  数えるのは、UC 自身の部分（表の予約）と、「要件」の節の小節の見出しだけ。REQ の本文に書かれた番号
				//  （ほかのプロジェクトの REQ への言及など）は、このプロジェクトの番号ではない
				const parts = splitUc(read(f));
				for (const x of parts.ucText.matchAll(/\bREQ-(\d+)\b/g)) nums.add(Number(x[1]));
				for (const r of parts.reqs) nums.add(Number(r.id.split("-")[1]));
			}
	return nums;
}

function nextIds(cfg, kind, count) {
	kind = kind.toLowerCase();
	const prefix = kind.toUpperCase() + "-";
	const pattern = cfg.id_patterns?.[kind] || "";
	const m = pattern.match(/\\d\{(\d+)\}/);
	const width = m ? Number(m[1]) : 3;
	const file = join(cfg._root, RESERVATION_FILE);
	return withLock(cfg._root, () => {
		const used = usedNumbers(cfg, kind, prefix);
		const now = Date.now();
		let ledger = [];
		if (existsSync(file)) {
			try {
				ledger = JSON.parse(read(file));
			} catch {
				ledger = [];
			}
		}
		//  使われた予約と古い予約を落とす
		ledger = ledger.filter((r) => r.kind === kind ? !r.ids.every((n) => used.has(n)) && now - r.at < RESERVATION_TTL_MS : now - r.at < RESERVATION_TTL_MS);
		for (const r of ledger) if (r.kind === kind) for (const n of r.ids) used.add(n);
		let n = used.size ? Math.max(...used) + 1 : 1;
		const ids = [];
		while (ids.length < count) ids.push(n++);
		ledger.push({ kind, ids, at: now });
		writeFileSync(file, JSON.stringify(ledger) + "\n");
		return ids.map((x) => `${prefix}${String(x).padStart(width, "0")}`);
	});
}

//  ---- 引数と main ---------------------------------------------------------------

const KINDS = ["goal", "uc", "req", "br", "nfr", "adr"];

//  最初の引数が種類。残りがオプション
function parseArgs(argv) {
	if (argv.length === 0) usage(`種類が要る（${KINDS.join("|")}）`);
	const opts = { kind: argv[0], root: ".", config: null, reserve: 1 };
	for (let i = 1; i < argv.length; i++) {
		const a = argv[i];
		const value = () => (i + 1 < argv.length ? argv[++i] : usage(`${a} には値が要る`));
		if (a === "--root") opts.root = value();
		else if (a === "--config") opts.config = value();
		else if (a === "--reserve") opts.reserve = Number(value());
		else usage(`不明な引数 ${a}`);
	}
	return opts;
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const { cfg, declError } = openProject(opts);
	if (!KINDS.includes(opts.kind.toLowerCase())) usage(`種類は ${KINDS.join("|")} のいずれか`);
	if (!Number.isInteger(opts.reserve) || opts.reserve < 1) usage("--reserve: 1 以上の整数");
	if (DOC_PATHS.some((k) => typeof lookup(cfg, k) !== "string")) return declError();
	//  GOAL の ID は概要の行で定義するので、概要が無ければ採番の根拠が無い
	if (opts.kind.toLowerCase() === "goal" && typeof lookup(cfg, "docs.overview") !== "string") usage("goal の採番には docs.overview（<docs>/00-overview.md）の宣言が要る（GOAL の ID は概要の GOAL の表の行で定義する / ADR-0076）");
	console.log(nextIds(cfg, opts.kind, opts.reserve).join("\n"));
	return 0;
}

process.exitCode = main();
