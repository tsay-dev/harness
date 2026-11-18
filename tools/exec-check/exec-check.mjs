#!/usr/bin/env node
//
//  exec-check — テストが本番と同じ組み立てを通り、ソースが実際に実行され、アプリの入口が契約と合っているかの検査
//  （harness 同梱ツール。依存ゼロの Node）
//
//  テストが通っていても、テストが本番とは別の組み立てを通っていたり、どのテストからも実行されないコードが
//  残っていたり、契約に無い入口がアプリに残っていたりすると、仕様どおりに動くことの裏付けにならない。
//  実装のコードに書く印（名乗り）ではなく、実行の記録と、アプリ自身が出した入口の一覧で確かめる（ADR-0066 / ADR-0070）。
//  このツールはファイルと記録を読むだけで、テストもコマンドも実行しない（実行の記録は利用プロジェクトのテストのコマンドが、
//  入口の一覧は commands.list_entries のコマンドが作る。完了の判定では、検査の並び tools/gate-hook/suite.mjs が実行して渡す）。
//
//  設定（harness.config.json）:
//    "entry": {
//      "compose": "apps/api/src/compose.ts#assembleApps",      本番の組み立て（<ファイル>#<名前>）
//      "test_entry": "tests/support/app.ts#createTestApp"       テストの入口（<ファイル>#<名前>）
//    }
//    "coverage": {
//      "report": "coverage/lcov.info",                          実行の記録（lcov 形式）。テストのコマンドが毎回作る
//      "scope": ["apps/api/src", "packages/shared/src"],        この記録で確かめるソースの範囲（glob。! で除外）。省略すると source.dirs の全部
//      "not_run": [{ "path": "src/server.ts", "reason": "…" },  どのテストからも実行されないことを認めたファイル
//                  { "path": "src/a.ts#legacy", "reason": "…" }]  …と、呼ばれないことを認めた関数（<ファイル>#<関数の名前>）
//      "functions": { "none": "<理由>" }                        関数の単位の検査（V6・V7）を使わないとき。省略すると使う
//    }
//    "commands": { "list_entries": "node scripts/list-entries.mjs" }   アプリの入口の一覧を 1 行 1 件の JSON で標準出力に出すコマンド
//  entry と coverage は { "none": "<理由>" } と書ける。省略したものは「未宣言」と表示する（確かめていないことを見えるままにする）。
//  commands.list_entries は、コマンドか { "none": "<理由>" } を必ず書く（none は、撤回されていない UC の fixed の契約に inbound の操作が無い間だけ通る）。
//  active な REQ と source があるプロジェクトでは、coverage の none・省略・形の誤りを trace-check の C26 が違反にする。
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
//      V4  not_run の各項目は、path がソースのファイルか「<ファイル>#<関数の名前>」で、reason があり、実際に 1 行も実行されていない
//          （関数なら 1 回も呼ばれていない）。実行されるようになったら、項目を消す
//      V5  entry.compose のファイルが実行されている（entry を宣言しているとき）。記録に関数ごとの情報（FN / FNDA）が
//          あれば、compose の名前の関数が 1 回以上呼ばれていることまで確かめる
//      V6  範囲に入るソースの名前のある関数は、1 回以上呼ばれている（not_run に書いた関数と、V3 で違反になるファイルを除く）。
//          名前の無い関数（記録の名前が ( や < で始まるものと anonymous_<数字>。無名のコールバックなど）は対象にしない
//      V7  記録に関数ごとの情報（FN / FNDA）がある。出さない道具を使うなら coverage.functions を { "none": "<理由>" } にする。
//          「FNF:0」は、そのファイルが関数を持たないことの印にだけ使う（FN / FNDA の代わりには数えない）
//    entries（harness lint entries）
//      入口と操作は、文字の完全一致で比べる（http は method と path、それ以外は名前。harness はパスを解釈しない）
//      E1  一覧にある入口が、撤回されていない UC の fixed の契約の、inbound の操作のどれにも合わない。
//          合う操作が 1 つも無い入口（契約に無い入口）と、合う操作が fixed でない契約にしか無い入口の 2 通りを、文を分けて報告する。
//          契約の外の入口を認める宣言は無い。生存確認や静的なファイルの配信も、契約の操作として書く
//      E2  fixed の契約の、owned かつ inbound の操作に合う入口が、一覧に無い
//      E4  一覧か、契約の操作の入口を読めない（当てはまる場合の一覧は README の検査項目の表）
//      （E3 は欠番。契約に書かない入口の宣言 entries.outside_contract の検査だったが、その宣言を廃止した）
//  確かめるのは「1 回も実行されなかったファイル・関数が無いこと」まで。行ごとの割合のしきい値は持たない。
//
//  使い方:
//    node exec-check.mjs entry    [--root <プロジェクトのルート>] [--config <設定ファイル>]
//    node exec-check.mjs coverage [--root <プロジェクトのルート>] [--config <設定ファイル>] [--since <エポックからのミリ秒>]
//    node exec-check.mjs entries  [--root <プロジェクトのルート>] [--config <設定ファイル>] [--from <入口の一覧のファイル>]
//                                 --from を省くと、一覧を標準入力から読む（<一覧を出すコマンド> | node exec-check.mjs entries）
//
//  終了コード: 0 = 違反なし（未宣言・none を含む） / 1 = 違反あり / 2 = 使い方・設定ファイルが無い・JSON として読めない

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { CONFIG_FILE, renamedConfigHint } from "../_shared/config.mjs";
import { allUcDirs, goalsRootOf } from "../_shared/spec-tree.mjs";
import { ENTRY_TRANSPORTS, TRANSPORTS, isFilledText } from "../_shared/contract-vocab.mjs";
import { parseFrontmatter } from "../_shared/frontmatter.mjs";
import { inScope } from "../_shared/glob.mjs";
import { parseStrictYaml } from "../_shared/strict-yaml.mjs";

const TAG = "[exec-check]";
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";
const isNone = (v) => isMap(v) && typeof v.none === "string" && v.none.trim() !== "";
const posixPath = (p) => p.split(sep).join("/");

function usage(msg) {
	if (msg) console.error(`${TAG} ${msg}`);
	console.error("usage: exec-check.mjs entry|coverage|entries [--root .] [--config <設定ファイル>] [--since <ms>] [--from <入口の一覧のファイル>]");
	process.exit(2);
}

function parseArgs(argv) {
	const mode = argv[0];
	if (mode !== "entry" && mode !== "coverage" && mode !== "entries") usage(mode === undefined ? "entry・coverage・entries のどれかを指定する" : `知らないコマンド: ${mode}`);
	const opts = { mode, root: ".", config: null, since: null, from: null };
	for (let i = 1; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--root" || a === "--config" || a === "--since" || a === "--from") {
			if (argv[i + 1] === undefined) usage(`${a} に値が無い`);
			opts[a.slice(2)] = argv[++i];
		} else usage(`知らない引数: ${a}`);
	}
	if (opts.since !== null) {
		if (mode !== "coverage") usage("--since は coverage でだけ使える");
		if (!/^\d+$/.test(opts.since)) usage("--since はエポックからのミリ秒（整数）");
		opts.since = Number(opts.since);
	}
	if (opts.from !== null && mode !== "entries") usage("--from は entries でだけ使える");
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

//  戻り: { files: Map<root からの相対パス, { lines: 実行する行の数, hit: 実行された行の数, fns: Map<関数の名前, 実行回数>,
//         fnInfo: 関数の情報（FN / FNDA）が 1 行でもあったか, noFns: 「FNF:0」（関数を持たないファイルの印）があったか }>,
//         outside: root の外を指していた SF の例 }
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
	let fnDecls = []; //  この記録の FN: の行の中身（「<行>,<名前>」か「<開始行>,<終了行>,<名前>」）
	let fndaNames = new Set(); //  この記録の FNDA: の名前
	//  FN: の行から名前を取る。名前はカンマを含みうる（引数の型を含む名前など）ので、最後のカンマでは切れない。
	//  同じ記録の FNDA: の名前と一致するほうを採る。FNDA が無い関数は、行が 2 つ並ぶ形ならその後ろ、そうでなければ最初のカンマの後ろ
	const fnName = (decl) => {
		const short = /^\d+,(.+)$/.exec(decl)?.[1];
		const long = /^\d+,\d+,(.+)$/.exec(decl)?.[1];
		if (short !== undefined && fndaNames.has(short)) return short;
		if (long !== undefined && fndaNames.has(long)) return long;
		return long ?? short ?? null;
	};
	const close = () => {
		if (cur !== null && !sawDA && summary) {
			cur.lines += summary.lf;
			cur.hit += summary.lh;
		}
		if (cur !== null)
			for (const decl of fnDecls) {
				const name = fnName(decl);
				if (name && !cur.fns.has(name)) cur.fns.set(name, 0);
			}
		cur = null;
		summary = null;
		sawDA = false;
		fnDecls = [];
		fndaNames = new Set();
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
			if (!files.has(key)) files.set(key, { lines: 0, hit: 0, fns: new Map(), fnInfo: false, noFns: false });
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
			//  同じ名前の関数が複数あれば、呼ばれた回数を足す（記録は名前でしか区別できない）
			const m = /^FNDA:(\d+),(.+)$/.exec(line);
			if (!m) continue;
			cur.fnInfo = true;
			fndaNames.add(m[2]);
			cur.fns.set(m[2], (cur.fns.get(m[2]) ?? 0) + Number(m[1]));
		} else if (line.startsWith("FN:")) {
			cur.fnInfo = true;
			fnDecls.push(line.slice(3));
		}
		//  関数を 1 つも持たないファイルにも、関数の情報を出す道具は「FNF:0」を書く。関数の情報が落ちたファイルと見分ける印にだけ使い、
		//  「記録に関数の情報がある」ことの根拠には数えない（FNF:0 だけの記録を、関数の単位まで確かめたことにしない）
		else if (/^FNF:0+$/.test(line)) cur.noFns = true;
		else if (line === "end_of_record") close();
	}
	close();
	return { files, outside };
}

//  名前の無い関数（無名のコールバックなど）。記録を出す道具が付けた仮の名前（Istanbul の (anonymous_3)、Node の anonymous_3、
//  <anonymous> など）は、編集のたびに変わるので指せない。検査の対象にしない
const isUnnamed = (name) => /^[(<]|^anonymous_\d+$/.test(name);

function checkCoverage(cfg, root, since, entry) {
	const errs = [];
	const cov = cfg.coverage;
	if (!isMap(cov)) return { errs: [`V1  coverage は { "report", "not_run" } か { "none": "<理由>" } で書く（実際: ${JSON.stringify(cov)}）`] };
	for (const k of Object.keys(cov)) if (!["report", "not_run", "scope", "functions"].includes(k)) errs.push(`V1  coverage に知らないキー「${k}」がある（report・scope・not_run・functions だけ）`);
	//  関数の単位の検査（V6・V7）は、省略すると使う。使わないなら、理由を書いて宣言する（黙って粗い検査に落とさない）
	const fnOff = cov.functions !== undefined;
	if (fnOff && !(isNone(cov.functions) && Object.keys(cov.functions).length === 1 && !/[\r\n]/.test(cov.functions.none)))
		errs.push('V7  coverage.functions は、関数の単位の検査を使わないときにだけ { "none": "<理由>" } と書く（使うなら、キーを消す）');
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

	//  not_run の宣言。path は、ファイルか「<ファイル>#<関数の名前>」（そのままの文字列がソースのファイルなら、ファイルとして読む）
	const notRun = new Map();
	const notRunFns = new Map(); //  "<ファイル>#<名前>" -> { file, name }
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
		const hash = sources.includes(p) ? -1 : p.indexOf("#");
		if (hash > 0) {
			const file = p.slice(0, hash);
			const name = p.slice(hash + 1);
			if (notRunFns.has(p)) errs.push(`V4  ${at}.path が重複している: ${p}`);
			else if (!sources.includes(file)) errs.push(`V4  ${at}.path のファイルがソースのファイルでない: ${file}（「<ファイル>#<関数の名前>」のファイルは、範囲に入る実在のファイルにする）`);
			else if (!name || isUnnamed(name)) errs.push(`V4  ${at}.path の関数の名前が無い: ${p}（名前の無い関数は検査の対象でないので、書けない）`);
			else if (fnOff) errs.push(`V4  ${at}.path は関数を指しているが、coverage.functions が none なので関数の単位では確かめていない: ${p}（項目を消す）`);
			notRunFns.set(p, { file, name });
			continue;
		}
		if (notRun.has(p)) errs.push(`V4  ${at}.path が重複している: ${p}`);
		else if (!sources.includes(p)) errs.push(`V4  ${at}.path がソースのファイルでない: ${p}（範囲に入る実在のファイルを 1 つずつ書く。ディレクトリは書けない。関数は「<ファイル>#<関数の名前>」で書く）`);
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
	//  関数の単位（V6・V7）。1 行も実行されなかったファイル（V3）と、ファイルごと認めたもの（not_run）の中の関数は、重ねて数えない
	const uncalled = [];
	const noFnInfo = []; //  行の情報はあるのに、関数の情報（FN / FNDA）も、関数を持たない印（FNF:0）も無いファイル
	let namedFns = 0;
	const anyFnInfo = sources.some((f) => report.get(f)?.fnInfo);
	//  none にできるのは、記録に関数の情報が 1 つも無いときだけ（出せる道具を使っているのに、粗い検査に落とさない）
	if (fnOff && anyFnInfo && isNone(cov.functions))
		errs.push(`V7  coverage.functions を none にできない（実行の記録 ${cov.report} に、関数ごとの情報 FN / FNDA がある）。coverage.functions を消して、関数の単位まで確かめる（none の理由: ${cov.functions.none.trim()}）`);
	if (!fnOff) {
		for (const f of sources) {
			const r = report.get(f);
			if (!r) continue;
			if (anyFnInfo && !r.fnInfo && !r.noFns && r.lines > 0 && !notRun.has(f)) noFnInfo.push(f);
			if (notRun.has(f) || (r.lines > 0 && r.hit === 0)) continue;
			for (const [name, count] of r.fns) {
				if (isUnnamed(name)) continue;
				namedFns++;
				if (count === 0 && !notRunFns.has(`${f}#${name}`)) uncalled.push(`${f}#${name}`);
			}
		}
		for (const [key, { file, name }] of notRunFns) {
			const r = report.get(file);
			if (!r || !sources.includes(file) || !name || isUnnamed(name)) continue;
			if (notRun.has(file)) errs.push(`V4  ${key}: ファイル ${file} ごと coverage.not_run に書いてあるので、関数の項目は要らない（消す）`);
			else if (!r.fns.has(name)) errs.push(`V4  ${key}: 実行の記録の ${file} に、${name} という名前の関数が無い（名前を変えたか消したなら、coverage.not_run から消す）`);
			else if (r.fns.get(name) > 0) errs.push(`V4  ${key} は呼ばれている。coverage.not_run から消す`);
		}
	}
	const list = (fs) => fs.slice(0, 20).map((f) => `\n        ${f}`).join("") + (fs.length > 20 ? `\n        …ほか ${fs.length - 20} 件` : "");
	if (missing.length) {
		const none = missing.length === sources.length - [...notRun.keys()].filter((k) => sources.includes(k) && !report.has(k)).length;
		const example = none ? `。記録のパスの例: ${[...report.keys()].slice(0, 2).join("、")}${outsideHint}（ソースのパスと基準が合っているかを確かめる）` : "";
		errs.push(`V2  実行の記録に載っていないソースが ${missing.length} 件ある（テストのコマンドの記録の対象に入れる）${example}:${list(missing)}`);
	}
	if (uncalled.length)
		errs.push(`V6  どのテストからも 1 回も呼ばれなかった関数が ${uncalled.length} 件ある（テストを通すか、使っていなければ消すか、理由を coverage.not_run に「<ファイル>#<関数の名前>」で書く）:${list(uncalled)}`);
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
	//  関数の情報を出さない記録を、関数の単位まで確かめたことにしない
	if (noFnInfo.length)
		errs.push(`V7  実行の記録の中で、関数ごとの情報（FN / FNDA）も、関数を持たないことを示す「FNF:0」も無いソースが ${noFnInfo.length} 件ある（ほかのファイルには FN / FNDA がある。記録をまとめるときに関数の情報が落ちていないか、記録を出す道具の設定を確かめる）:${list(noFnInfo)}`);
	if (!fnOff && !anyFnInfo && withLines > 0)
		errs.push(`V7  実行の記録に、関数ごとの情報（FN / FNDA）が 1 つも無い: ${cov.report}（関数ごとの記録を書き出す設定にする。「FNF:0」だけの記録は、関数の情報がある記録に数えない。出せない道具なら、coverage.functions を { "none": "<理由>" } にして、関数の単位では確かめないことを宣言する）`);
	const outside = allSources.length - sources.length;
	return {
		errs,
		summary:
			`確かめたソース ${sources.length} 件（実行する行があるもの ${withLines} 件）、` +
			(fnOff ? "関数の単位では確かめていない" : `確かめた名前のある関数 ${namedFns} 件`) +
			`、実行されないことを認めたもの ${notRun.size + notRunFns.size} 件`,
		outside: outside > 0 ? `範囲（coverage.scope）の外のソース ${outside} 件は、この記録では確かめていない` : null,
	};
}

//  ---- 入口の一覧と契約の突き合わせ（entries） -----------------------------------

//  入口の突き合わせは、文字の完全一致で行う。http は method と path、それ以外は名前を、一覧と契約でそのまま比べる。
//  harness はパスを解釈しない（:id と {id} を同じとみなさない。* を特別に扱わない。末尾の / も大文字小文字もならさない）。
//  枠組みの書き方から契約の書き方へ直すのは、一覧を出すスクリプト（commands.list_entries）の役目（ADR-0070）

//  入口の種類は、契約の transport と同じ語彙（tools/_shared/contract-vocab.mjs）。一覧の kind に使う
const ENTRY_KINDS = TRANSPORTS;

//  入口の同一性（突き合わせに使う鍵）と、表示の書き方。鍵は、項目の並びを JSON にしたもの（項目の中の文字で、別の入口と同じ鍵にならない）
const httpEntry = (method, path) => ({ key: JSON.stringify(["http", method, path]), label: `${method} ${path}` });
const namedEntry = (kind, name) => ({ key: JSON.stringify([kind, name]), label: `${kind} ${name}` });
//  項目が「書いてある」かの判定は isFilledText（spec-lint と同じもの。空白だけは空とみなす）

//  契約の操作 1 つから、入口を読む。戻り: null（inbound でない） / { key, label } /
//  { label, field, problem }（比べる項目が、空でない文字列になっていない。transport が入口の種類に無い）
function inboundEntryOf(name, op) {
	if (!isMap(op) || op.direction !== "inbound") return null;
	if (op.transport === "http") {
		const wire = isMap(op.wire) ? op.wire : {};
		for (const k of ["method", "path"])
			if (!isFilledText(wire[k])) return { label: `http（wire.${k}: ${JSON.stringify(wire[k] ?? null)}）`, field: `wire.${k}`, problem: `空でない文字列でない（実際: ${JSON.stringify(wire[k] ?? null)}）` };
		return httpEntry(wire.method, wire.path);
	}
	if (!TRANSPORTS.includes(op.transport)) return { label: `transport: ${JSON.stringify(op.transport ?? null)}`, field: "transport", problem: `入口の種類（${ENTRY_KINDS.join(" / ")}）に無い` };
	if (!ENTRY_TRANSPORTS.includes(op.transport)) return namedEntry(op.transport, name);
	if (!isFilledText(op.entry)) return { label: `${op.transport}（entry: ${JSON.stringify(op.entry ?? null)}）`, field: "entry", problem: `空でない文字列でない（実際: ${JSON.stringify(op.entry ?? null)}）` };
	return namedEntry(op.transport, op.entry);
}

//  撤回されていない UC の契約の inbound の操作: [{ id: "UC-nnn#操作名", key, label, status, fixed, fixedOwned }]
//  入口を読めない操作（wire.method・wire.path・entry が空でない文字列でない、transport が入口の種類に無い）は { id, label, field, problem } で、key を持たない
//  status は契約の x-status（無ければ null）。入口の突き合わせ先（E1）にするのは fixed の契約の操作だけ（draft の契約は、人が承認していない）
//  契約の読み方は tools/_shared/strict-yaml.mjs（spec-lint / trace-check / contract-run と同じ）。構文の誤りは spec-lint が報告し、ここは読めた分だけ使う
function inboundOperations(cfg, root) {
	//  根の決め方と、フォルダの数え方は tools/_shared/spec-tree.mjs（spec-lint が検査しない場所の契約を、突き合わせ先に数えない）
	const goals = goalsRootOf({ hostRoot: root, cfg }).root;
	if (goals === null) return null;
	const out = [];
	for (const { ucDir: udir } of allUcDirs(goals)) {
		const ucFile = join(udir, "UC.md");
		const file = join(udir, "contract.yaml");
		if (!existsSync(ucFile) || !existsSync(file)) continue;
		const uc = parseFrontmatter(readFileSync(ucFile, "utf8")).data;
		if (uc.status === "withdrawn") continue;
		const { root: doc } = parseStrictYaml(readFileSync(file, "utf8"));
		if (!isMap(doc) || !isMap(doc.operations)) continue;
		for (const [name, op] of Object.entries(doc.operations)) {
			const e = inboundEntryOf(name, op);
			if (e === null) continue;
			const status = typeof doc["x-status"] === "string" ? doc["x-status"] : null;
			out.push({ id: `${uc.id ?? "?"}#${name}`, ...e, status, fixed: status === "fixed", fixedOwned: status === "fixed" && op.owned === true });
		}
	}
	return out;
}

//  一覧（1 行 1 件の JSON）を読む。戻り: { entries: [{ key, label, line }], errs }
function parseEntryList(text) {
	const errs = [];
	const entries = [];
	const seen = new Map();
	text.split(/\r?\n/).forEach((raw, i) => {
		if (!raw.trim()) return;
		const at = `一覧の ${i + 1} 行目`;
		let v;
		try {
			v = JSON.parse(raw);
		} catch {
			errs.push(`E4  ${at}が JSON でない: ${raw.trim().slice(0, 80)}（1 行に 1 件の JSON を出す。それ以外の出力は標準エラーへ出す）`);
			return;
		}
		if (!isMap(v) || !ENTRY_KINDS.includes(v.kind)) {
			errs.push(`E4  ${at}: kind が無いか、知らない種類（${ENTRY_KINDS.join(" / ")} のどれかにする）`);
			return;
		}
		const want = v.kind === "http" ? ["kind", "method", "path"] : ["kind", "name"];
		const unknown = Object.keys(v).filter((k) => !want.includes(k));
		if (unknown.length) errs.push(`E4  ${at}: 知らない項目「${unknown.join("、")}」がある（kind が ${v.kind} なら ${want.join("・")} だけ）`);
		let e;
		if (v.kind === "http") {
			if (!isFilledText(v.method) || !isFilledText(v.path)) {
				errs.push(`E4  ${at}: kind が http の入口は、method と path を、空でない文字列で持つ（契約の wire.method・wire.path と、文字どおり同じに書く）`);
				return;
			}
			e = httpEntry(v.method, v.path);
		} else {
			if (!isFilledText(v.name)) {
				errs.push(`E4  ${at}: kind が ${v.kind} の入口は、name を、空でない文字列で持つ（契約の entry と、文字どおり同じに書く。entry を持たない種類は操作の名前）`);
				return;
			}
			e = namedEntry(v.kind, v.name);
		}
		if (seen.has(e.key)) errs.push(`E4  ${at}: 同じ入口が ${seen.get(e.key)} 行目にもある: ${e.label}`);
		else {
			seen.set(e.key, i + 1);
			entries.push(e);
		}
	});
	return { entries, errs };
}

function checkEntries(cfg, root, opts) {
	const NOT_CHECKED = "契約に無い入口が無いかを確かめていない";
	const ops = inboundOperations(cfg, root);
	if (ops === null) {
		console.log(`  err  E4  設定の docs.goals_dir が無いので、契約を読めない（monorepo では unit のディレクトリを --root に指定する）`);
		return 1;
	}
	const errs = [];
	//  none を認める条件と、0 行の一覧を認める条件は同じ: fixed の契約に inbound の操作が無い間だけ
	const fixedOps = ops.filter((o) => o.fixed);
	const readableOps = ops.filter((o) => !o.problem);
	//  入口を読めない契約の操作（比べる項目が空でない文字列でない、transport が入口の種類に無い）は、どの入口とも合わない。
	//  同じ操作は spec-lint も違反にする（判定は tools/_shared/contract-vocab.mjs の isFilledText）。ここでも、owned・x-status によらず報告する
	for (const o of ops)
		if (o.problem) errs.push(`E4  契約の操作 ${o.id} の ${o.field} を読めない: ${o.problem}（契約の書き方の誤りで、このままではどの入口とも合わない）`);
	//  契約の外の入口を認める宣言は廃止した。残っていれば、黙って読み飛ばさない
	if (cfg.entries !== undefined)
		errs.push("E4  設定の entries は廃止した（契約の外の入口は置けない）。キーを削除し、そこに書いていた入口は、契約の inbound の操作として書く");
	const decl = isMap(cfg.commands) ? cfg.commands.list_entries : undefined;
	let listed = null;
	if (decl === undefined) errs.push('E4  commands.list_entries が宣言されていない（アプリの入口の一覧を 1 行 1 件の JSON で標準出力に出すコマンドを書く。入口が無いなら { "none": "<理由>" }）');
	else if (isMap(decl) && "none" in decl) {
		if (!isNone(decl) || Object.keys(decl).length !== 1) errs.push('E4  commands.list_entries の none は、理由の文字列だけを持つ（{ "none": "<理由>" }）');
		else if (fixedOps.length)
			errs.push(`E4  commands.list_entries は none にできない（撤回されていない UC の fixed の契約に inbound の操作が ${fixedOps.length} 件ある。例: ${fixedOps[0].id}）。入口の一覧を出すコマンドを書く（none の理由: ${decl.none.trim()}）`);
		else console.log(`  commands.list_entries = none（${decl.none.trim()}）: ${NOT_CHECKED}`);
	} else if (!isText(decl)) errs.push('E4  commands.list_entries は、文字列のコマンドか { "none": "<理由>" } で書く');
	else {
		let text;
		if (opts.from !== null) {
			const p = resolve(opts.from);
			if (!existsSync(p) || !statSync(p).isFile()) {
				console.error(`${TAG} --from のファイルが無い: ${opts.from}`);
				return 2;
			}
			text = readFileSync(p, "utf8");
		} else {
			if (process.stdin.isTTY) usage(`入口の一覧を渡す（${decl} | exec-check.mjs entries、または --from <一覧を書き出したファイル>）`);
			text = readFileSync(0, "utf8");
		}
		const parsed = parseEntryList(text);
		errs.push(...parsed.errs);
		listed = parsed.entries;
		//  fixed の契約に inbound の操作があるのに一覧が空なら、一覧を出すコマンドが入口を出せていない。
		//  fixed でない契約の操作しか無い間は、入口をまだ置けない（E1）ので、0 行が正しい
		if (!text.trim() && fixedOps.length)
			errs.push(`E4  入口の一覧が 0 行（撤回されていない UC の fixed の契約に inbound の操作が ${fixedOps.length} 件ある。例: ${fixedOps[0].id}）。commands.list_entries のコマンドが、入口を標準出力に出しているかを確かめる`);
	}

	if (listed !== null) {
		//  突き合わせ先は fixed の契約の操作だけ。fixed でない契約の操作は、「合う操作はあるが承認されていない」と伝えるためにだけ引く
		const fixedKeys = new Set(readableOps.filter((o) => o.fixed).map((o) => o.key));
		const pending = new Map(); //  鍵 -> fixed でない契約の操作（最初の 1 件）
		for (const o of readableOps) if (!o.fixed && !pending.has(o.key)) pending.set(o.key, o);
		const listedKeys = new Set(listed.map((e) => e.key));
		for (const e of listed) {
			if (fixedKeys.has(e.key)) continue;
			const p = pending.get(e.key);
			if (p)
				errs.push(
					`E1  契約が fixed でない入口: ${e.label}（合う操作 ${p.id} はあるが、${p.status === null ? "その契約に x-status が無い" : `その契約の x-status が ${p.status}`}。fixed でない契約の操作は、入口の突き合わせ先に数えない。人間の承認を得て契約を fixed にするまで、この検査は通らない）`,
				);
			else errs.push(`E1  契約に無い入口: ${e.label}（契約に inbound の操作として書くか、使っていなければ入口を消す。生存確認や静的なファイルの配信のような入口も、契約に書く。突き合わせは文字の完全一致で、パラメーターの書き方や名前、method の大文字小文字、末尾の / が違っても合わない）`);
		}
		for (const o of readableOps)
			if (o.fixedOwned && !listedKeys.has(o.key))
				errs.push(
					`E2  ${o.id}（fixed、owned かつ inbound）に合う入口が、一覧に無い: ${o.label}（入口を実装するか、一覧を出すコマンドが載せているかを確かめる）`,
				);
	}
	for (const e of errs) console.log(`  err  ${e}`);
	if (errs.length) {
		console.log(`${TAG} 違反 ${errs.length} 件`);
		return 1;
	}
	if (listed !== null)
		console.log(`${TAG} OK: ${listed.length ? `入口 ${listed.length} 件（すべて fixed の契約の inbound の操作に合う）` : "入口は無い"}、fixed の契約の inbound の操作 ${fixedOps.length} 件`);
	return 0;
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const configPath = opts.config ? resolve(opts.config) : join(resolve(opts.root), CONFIG_FILE);
	const root = resolve(opts.root);
	const cfg = loadConfig(configPath);
	if (opts.mode === "entries") return checkEntries(cfg, root, opts);
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
	if (isMap(cfg.coverage) && isNone(cfg.coverage.functions) && !/[\r\n\u0000-\u001f]/.test(cfg.coverage.functions.none))
		console.log(`  coverage.functions = none（${cfg.coverage.functions.none.trim()}）: 呼ばれなかった関数が無いかを確かめていない（ファイルの単位まで）`);
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
