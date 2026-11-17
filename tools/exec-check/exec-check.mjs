#!/usr/bin/env node
//
//  exec-check — テストが本番と同じ組み立てを通り、ソースが実際に実行されたかの検査（harness 同梱ツール。依存ゼロの Node）
//
//  テストが通っていても、テストが本番とは別の組み立てを通っていたり、どのテストからも実行されないコードが
//  残っていたりすると、仕様どおりに動くことの裏付けにならない。注釈（名乗り）ではなく、実行の記録で確かめる。
//  このツールはファイルと記録を読むだけで、テストは実行しない（記録は、利用プロジェクトのテストのコマンドが作る）。
//
//  設定（harness.config.json）:
//    "entry": {
//      "compose": "apps/api/src/compose.ts#assembleApps",      本番の組み立て（<ファイル>#<名前>）
//      "test_entry": "tests/support/app.ts#createTestApp"       テストの入口（<ファイル>#<名前>）
//    }
//    "coverage": {
//      "report": "coverage/lcov.info",                          実行の記録（lcov 形式）。テストのコマンドが毎回作る
//      "scope": ["apps/api/src", "packages/shared/src"],        この記録で確かめるソースの範囲（glob。! で除外）。省略すると source.dirs の全部
//      "not_run": [{ "path": "src/server.ts", "reason": "…" }]  どのテストからも実行されないことを認めたファイル
//    }
//  どちらも { "none": "<理由>" } と書ける。省略したものは「未宣言」と表示する（確かめていないことを見えるままにする）。
//
//  検査項目:
//    entry（harness lint entry）
//      X1  compose と test_entry は「<ファイル>#<名前>」の形で、ファイルが実在し、その中に名前が現れる
//      X2  test_entry のファイルの中に、compose の名前が現れる（テストの入口が、本番の組み立てを呼んでいる）
//    coverage（harness lint coverage）
//      V1  記録が実在し、lcov として読めて、--since より新しい（古い記録で通さない）
//      V2  範囲（coverage.scope。省略すると source.dirs）に入るソースのファイルが、すべて記録に載っている
//          （not_run に書いたファイルは、載っていなくてもよい）。
//          範囲の外のソースは確かめず、件数を毎回表示する（確かめていない範囲を見えるままにする）
//      V3  実行する行を持つソースのファイルは、1 行以上実行されている（not_run に書いたファイルを除く）
//      V4  not_run の各項目は、path がソースのファイルで、reason があり、実際に 1 行も実行されていない
//          （実行されるようになったら、項目を消す）
//      V5  entry.compose のファイルが実行されている（entry を宣言しているとき）。記録に関数ごとの情報（FN / FNDA）が
//          あれば、compose の名前の関数が 1 回以上呼ばれていることまで確かめる
//  確かめるのは「1 行も実行されなかったファイルが無いこと」まで。行ごとの割合のしきい値は持たない。
//
//  使い方:
//    node exec-check.mjs entry    [--root <プロジェクトのルート>] [--config <設定ファイル>]
//    node exec-check.mjs coverage [--root <プロジェクトのルート>] [--config <設定ファイル>] [--since <エポックからのミリ秒>]
//
//  終了コード: 0 = 違反なし（未宣言・none を含む） / 1 = 違反あり / 2 = 使い方・設定ファイルが無い・JSON として読めない

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { CONFIG_FILE, renamedConfigHint } from "../_shared/config.mjs";
import { inScope } from "../_shared/glob.mjs";

const TAG = "[exec-check]";
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";
const isNone = (v) => isMap(v) && typeof v.none === "string" && v.none.trim() !== "";
const posixPath = (p) => p.split(sep).join("/");

function usage(msg) {
	if (msg) console.error(`${TAG} ${msg}`);
	console.error("usage: exec-check.mjs entry|coverage [--root .] [--config <設定ファイル>] [--since <ms>]");
	process.exit(2);
}

function parseArgs(argv) {
	const mode = argv[0];
	if (mode !== "entry" && mode !== "coverage") usage(mode === undefined ? "entry か coverage を指定する" : `知らないコマンド: ${mode}`);
	const opts = { mode, root: ".", config: null, since: null };
	for (let i = 1; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--root" || a === "--config" || a === "--since") {
			if (argv[i + 1] === undefined) usage(`${a} に値が無い`);
			opts[a.slice(2)] = argv[++i];
		} else usage(`知らない引数: ${a}`);
	}
	if (opts.since !== null) {
		if (mode !== "coverage") usage("--since は coverage でだけ使える");
		if (!/^\d+$/.test(opts.since)) usage("--since はエポックからのミリ秒（整数）");
		opts.since = Number(opts.since);
	}
	return opts;
}

function loadConfig(configPath) {
	if (!existsSync(configPath)) {
		console.error(`${TAG} 設定が無い: ${configPath}（テンプレート templates/develop/${CONFIG_FILE} を host 直下に置く）${renamedConfigHint(configPath)}`);
		process.exit(2);
	}
	try {
		const cfg = JSON.parse(readFileSync(configPath, "utf8"));
		if (!isMap(cfg)) throw new Error("最上位がオブジェクトでない");
		return cfg;
	} catch (e) {
		console.error(`${TAG} ${configPath}: JSON として読めない（${e.message}）`);
		process.exit(2);
	}
}

//  text の中に、識別子 name が（より長い識別子の一部としてではなく）現れるか
function hasName(text, name) {
	const esc = name.replace(/\$/g, "\\$");
	return new RegExp(`(?<![\\p{ID_Continue}$])${esc}(?![\\p{ID_Continue}$])`, "u").test(text);
}

//  「<ファイル>#<名前>」を読む。誤りは errs に積んで null を返す
function parseRef(key, value, root, errs) {
	if (!isText(value)) {
		errs.push(`X1  entry.${key} が無い（「<ファイル>#<名前>」で書く）`);
		return null;
	}
	const m = /^([^#]+)#([\p{ID_Start}_$][\p{ID_Continue}$]*)$/u.exec(value.trim());
	if (!m) {
		errs.push(`X1  entry.${key} は「<ファイル>#<名前>」の形で書く。名前は識別子 1 つ（文字・数字・_・$。「.」や「::」でつないだ名前は書けない）（実際: ${value}）`);
		return null;
	}
	const [, file, name] = m;
	const abs = resolve(root, file);
	const rel = relative(root, abs);
	if (isAbsolute(file) || rel === ".." || rel.startsWith(`..${sep}`) || !existsSync(abs) || !statSync(abs).isFile()) {
		errs.push(`X1  entry.${key} のファイルが無い: ${file}`);
		return null;
	}
	const text = readFileSync(abs, "utf8");
	if (!hasName(text, name)) {
		errs.push(`X1  entry.${key} の名前「${name}」が ${file} の中に無い`);
		return null;
	}
	return { file: posixPath(rel), name, text };
}

//  entry を読む。戻り: { state: "undeclared" | "none" | "declared", reason?, compose?, testEntry?, errs }
function readEntry(cfg, root) {
	const errs = [];
	if (!("entry" in cfg)) return { state: "undeclared", errs };
	if (isNone(cfg.entry)) return { state: "none", reason: cfg.entry.none, errs };
	if (!isMap(cfg.entry)) {
		errs.push('X1  entry は { "compose", "test_entry" } か { "none": "<理由>" } で書く');
		return { state: "declared", errs };
	}
	for (const k of Object.keys(cfg.entry)) if (k !== "compose" && k !== "test_entry") errs.push(`X1  entry に知らないキー「${k}」がある（compose と test_entry だけ）`);
	const compose = parseRef("compose", cfg.entry.compose, root, errs);
	const testEntry = parseRef("test_entry", cfg.entry.test_entry, root, errs);
	if (compose && testEntry) {
		if (compose.file === testEntry.file) errs.push(`X2  entry.compose と entry.test_entry が同じファイルを指している（${compose.file}）。本番の組み立てとテストの入口は別のファイルに置く`);
		else if (!hasName(testEntry.text, compose.name))
			errs.push(
				`X2  テストの入口（${testEntry.file}）の中に、本番の組み立ての名前「${compose.name}」が無い。テストの入口のファイルから、本番の組み立てを名前で直接呼ぶ（別のファイルを経由して呼ぶ形は、ここでは確かめられない）`,
			);
	}
	return { state: "declared", compose, testEntry, errs };
}

//  ---- ソースのファイル --------------------------------------------------------

function walk(dir, out = []) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name === ".git" || e.name === "node_modules") continue;
		const p = join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (e.isFile()) out.push(p);
	}
	return out;
}

//  source.dirs（glob。! で除外）と source.extensions に入るファイル（root からの相対パス）。source が none・未宣言なら null
function sourceFiles(cfg, root) {
	const src = cfg.source;
	if (!isMap(src) || isNone(src) || !Array.isArray(src.dirs)) return null;
	const dirs = src.dirs.filter((d) => typeof d === "string");
	const exts = Array.isArray(src.extensions) ? src.extensions.filter((e) => typeof e === "string") : null;
	const r = spawnSync("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
	const all = r.status === 0 ? r.stdout.split("\0").filter(Boolean) : walk(root).map((p) => posixPath(relative(root, p)));
	return all
		.filter((f) => existsSync(join(root, f)) && inScope(f, dirs) && (!exts || exts.includes(extname(f))))
		.sort();
}

//  ---- 実行の記録（lcov） -------------------------------------------------------

//  戻り: { files: Map<root からの相対パス, { lines: 実行する行の数, hit: 実行された行の数, fns: Map<関数の名前, 実行回数> }>, outside: root の外を指していた SF の例 }
//  記録のパスは、絶対パスか、テストを実行したディレクトリ（root）からの相対パス。git の最上位からの相対パスも受ける。
//  行ごとの記録（DA）が無いファイルは、行の数の要約（LF / LH）を使う。
function parseLcov(text, root) {
	const top = spawnSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
	const gitTop = top.status === 0 ? top.stdout.trim() : null;
	const files = new Map();
	const outside = [];
	let cur = null;
	let summary = null; //  DA が無いときに使う LF / LH
	let sawDA = false;
	const close = () => {
		if (cur !== null && !sawDA && summary) {
			cur.lines += summary.lf;
			cur.hit += summary.lh;
		}
		cur = null;
		summary = null;
		sawDA = false;
	};
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.startsWith("SF:")) {
			close();
			const sf = line.slice(3);
			const candidates = isAbsolute(sf) ? [sf] : [resolve(root, sf), ...(gitTop ? [resolve(gitTop, sf)] : [])];
			const abs = candidates.find((c) => existsSync(c)) ?? candidates[0];
			const rel = relative(root, abs);
			if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
				if (outside.length < 2) outside.push(sf);
				continue;
			}
			const key = posixPath(rel);
			if (!files.has(key)) files.set(key, { lines: 0, hit: 0, fns: new Map() });
			cur = files.get(key);
			summary = { lf: 0, lh: 0 };
		} else if (cur === null) continue;
		else if (line.startsWith("DA:")) {
			const m = /^DA:(\d+),(-?\d+)/.exec(line);
			if (!m) continue;
			sawDA = true;
			cur.lines += 1;
			if (Number(m[2]) > 0) cur.hit += 1;
		} else if (line.startsWith("LF:")) summary.lf = Number(line.slice(3)) || 0;
		else if (line.startsWith("LH:")) summary.lh = Number(line.slice(3)) || 0;
		else if (line.startsWith("FNDA:")) {
			const m = /^FNDA:(\d+),(.+)$/.exec(line);
			if (m) cur.fns.set(m[2], (cur.fns.get(m[2]) ?? 0) + Number(m[1]));
		} else if (line.startsWith("FN:")) {
			const name = line.slice(3).split(",").pop();
			if (name && !cur.fns.has(name)) cur.fns.set(name, 0);
		} else if (line === "end_of_record") close();
	}
	close();
	return { files, outside };
}

function checkCoverage(cfg, root, since, entry) {
	const errs = [];
	const cov = cfg.coverage;
	if (!isMap(cov)) return { errs: ['V1  coverage は { "report", "not_run" } か { "none": "<理由>" } で書く'] };
	for (const k of Object.keys(cov)) if (k !== "report" && k !== "not_run" && k !== "scope") errs.push(`V1  coverage に知らないキー「${k}」がある（report・scope・not_run だけ）`);
	if (cov.scope !== undefined && (!Array.isArray(cov.scope) || cov.scope.length === 0 || !cov.scope.every(isText)))
		return { errs: [...errs, "V1  coverage.scope は、パスか glob の配列で書く（空にはできない）"] };
	if (!isText(cov.report)) return { errs: [...errs, "V1  coverage.report が無い（実行の記録のファイルを書く。lcov 形式）"] };
	const reportPath = resolve(root, cov.report);
	if (!existsSync(reportPath) || !statSync(reportPath).isFile())
		return { errs: [...errs, `V1  実行の記録が無い: ${cov.report}（テストのコマンドが lcov 形式で書き出すようにする）`] };
	if (since !== null && statSync(reportPath).mtimeMs < since)
		return { errs: [...errs, `V1  実行の記録が古い: ${cov.report}（今回のテストの実行で書き直されていない。テストのコマンドが毎回書き出すようにする）`] };
	const parsed = parseLcov(readFileSync(reportPath, "utf8"), root);
	const report = parsed.files;
	const outsideHint = parsed.outside.length ? `。記録のパスの例: ${parsed.outside.join("、")}（プロジェクトのルート ${root} の外を指している。パスの基準を確かめる）` : "";
	if (report.size === 0) return { errs: [...errs, `V1  実行の記録に、プロジェクトの中のファイルが 1 つも無い: ${cov.report}（lcov 形式で記録する）${outsideHint}`] };

	const allSources = sourceFiles(cfg, root);
	const sources = allSources === null ? null : cov.scope === undefined ? allSources : allSources.filter((f) => inScope(f, cov.scope));
	if (sources === null) return { errs: [...errs, "V2  設定の source.dirs が無いので、確かめるソースが決まらない（source を宣言する）"] };

	//  not_run の宣言
	const notRun = new Map();
	if (cov.not_run !== undefined && !Array.isArray(cov.not_run)) errs.push("V4  coverage.not_run は配列で書く（[{ path, reason }]）");
	for (const [i, x] of (Array.isArray(cov.not_run) ? cov.not_run : []).entries()) {
		const at = `coverage.not_run[${i}]`;
		if (!isMap(x) || !isText(x.path)) {
			errs.push(`V4  ${at} は { "path", "reason" } で書く`);
			continue;
		}
		for (const k of Object.keys(x)) if (k !== "path" && k !== "reason") errs.push(`V4  ${at} に知らないキー「${k}」がある（path と reason だけ）`);
		const p = posixPath(x.path.trim().replace(/^\.\//, ""));
		if (!isText(x.reason) || /[\r\n]/.test(x.reason)) errs.push(`V4  ${at}.reason は 1 行の文で書く（なぜどのテストからも実行されないのか）`);
		if (notRun.has(p)) errs.push(`V4  ${at}.path が重複している: ${p}`);
		else if (!sources.includes(p)) errs.push(`V4  ${at}.path がソースのファイルでない: ${p}（範囲に入る実在のファイルを、1 つずつ書く。ディレクトリは書けない）`);
		notRun.set(p, x);
	}

	const missing = [];
	const idle = [];
	for (const f of sources) {
		const r = report.get(f);
		if (!r) {
			if (!notRun.has(f)) missing.push(f);
			continue;
		}
		if (r.lines > 0 && r.hit === 0 && !notRun.has(f)) idle.push(f);
		if (r.hit > 0 && notRun.has(f)) errs.push(`V4  ${f} は実行されている。coverage.not_run から消す`);
	}
	const list = (fs) => fs.slice(0, 20).map((f) => `\n        ${f}`).join("") + (fs.length > 20 ? `\n        …ほか ${fs.length - 20} 件` : "");
	if (missing.length) {
		const none = missing.length === sources.length - [...notRun.keys()].filter((k) => sources.includes(k) && !report.has(k)).length;
		const example = none ? `。記録のパスの例: ${[...report.keys()].slice(0, 2).join("、")}${outsideHint}（ソースのパスと基準が合っているかを確かめる）` : "";
		errs.push(`V2  実行の記録に載っていないソースが ${missing.length} 件ある（テストのコマンドの記録の対象に入れる）${example}:${list(missing)}`);
	}
	if (idle.length)
		errs.push(`V3  どのテストからも 1 行も実行されなかったソースが ${idle.length} 件ある（テストを通すか、使っていなければ消すか、理由を coverage.not_run に書く）:${list(idle)}`);
	if (entry.state === "declared" && entry.compose) {
		const r = report.get(entry.compose.file);
		if (!r || r.hit === 0) errs.push(`V5  本番の組み立て（${entry.compose.file}）が、テストから実行されていない`);
		//  関数ごとの記録があれば、組み立ての関数そのものが呼ばれたことまで確かめる（ファイルは読み込むだけで実行済みになる）
		else if (r.fns.has(entry.compose.name) && r.fns.get(entry.compose.name) === 0)
			errs.push(`V5  本番の組み立ての関数 ${entry.compose.name}（${entry.compose.file}）が、テストから 1 回も呼ばれていない`);
	}
	const withLines = sources.filter((f) => (report.get(f)?.lines ?? 0) > 0).length;
	if (sources.length === 0) errs.push(cov.scope === undefined ? "V2  source.dirs に入るソースが 1 つも無い（source の書き方を確かめる）" : "V2  coverage.scope に入るソースが 1 つも無い（範囲の書き方を確かめる）");
	else if (withLines === 0 && missing.length < sources.length)
		errs.push(`V1  実行の記録に、行の情報（DA、または LF / LH）を持つソースが 1 つも無い: ${cov.report}（行ごとの記録を書き出す設定にする）`);
	const outside = allSources.length - sources.length;
	return {
		errs,
		summary: `確かめたソース ${sources.length} 件（実行する行があるもの ${withLines} 件）、実行されないことを認めたもの ${notRun.size} 件`,
		outside: outside > 0 ? `範囲（coverage.scope）の外のソース ${outside} 件は、この記録では確かめていない` : null,
	};
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const configPath = opts.config ? resolve(opts.config) : join(resolve(opts.root), CONFIG_FILE);
	const root = resolve(opts.root);
	const cfg = loadConfig(configPath);
	const entry = readEntry(cfg, root);

	if (opts.mode === "entry") {
		if (entry.state === "undeclared") {
			console.log(`${TAG} entry が未宣言: テストが本番と同じ組み立てを通っているかを確かめていない`);
			return 0;
		}
		if (entry.state === "none") {
			console.log(`${TAG} entry = none（${entry.reason}）: テストが本番と同じ組み立てを通っているかを確かめていない`);
			return 0;
		}
		for (const e of entry.errs) console.log(`  err  ${e}`);
		if (entry.errs.length) {
			console.log(`${TAG} 違反 ${entry.errs.length} 件`);
			return 1;
		}
		console.log(`${TAG} OK: テストの入口 ${entry.testEntry.file}#${entry.testEntry.name} は、本番の組み立て ${entry.compose.file}#${entry.compose.name} を呼んでいる`);
		return 0;
	}

	if (!("coverage" in cfg)) {
		console.log(`${TAG} coverage が未宣言: どのテストからも実行されないソースが無いかを確かめていない`);
		return 0;
	}
	if (isNone(cfg.coverage)) {
		console.log(`${TAG} coverage = none（${cfg.coverage.none}）: どのテストからも実行されないソースが無いかを確かめていない`);
		return 0;
	}
	const { errs, summary, outside } = checkCoverage(cfg, root, opts.since, entry);
	if (outside) console.log(`  ${outside}`);
	if (isMap(cfg.coverage) && Array.isArray(cfg.coverage.not_run))
		for (const x of cfg.coverage.not_run) if (isMap(x) && isText(x.path) && isText(x.reason) && !/[\r\n\u0000-\u001f]/.test(x.reason + x.path)) console.log(`  実行されないことを認めたもの: ${x.path.trim()}（${x.reason.trim()}）`);
	for (const e of errs) console.log(`  err  ${e}`);
	if (errs.length) {
		console.log(`${TAG} 違反 ${errs.length} 件`);
		return 1;
	}
	console.log(`${TAG} OK: ${summary}`);
	return 0;
}

process.exitCode = main();
