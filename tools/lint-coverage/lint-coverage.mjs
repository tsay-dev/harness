#!/usr/bin/env node
//
//  lint coverage — テストの実行の記録を読み、どのテストからも実行されなかったソースと関数を洗い出す検査（harness lint coverage。依存ゼロの Node）
//
//  テストが通っていても、どのテストからも実行されないコードが残っていれば、仕様どおりに動くことの裏付けにならない。
//  実装のコードに書く印（名乗り）ではなく、実行の記録と、アプリ自身が出した入口の一覧で確かめる（ADR-0066 / ADR-0070）。
//  このコマンドはファイルと記録を読むだけで、テストもコマンドも実行しない（完了の判定では、検査の並び tools/_shared/suite.mjs が実行して渡す）。
//  引数と設定の読み方は tools/_shared/entry.mjs（lint entry・lint coverage・lint entries で同じ）。
//  実行の記録は、利用プロジェクトのテストのコマンドが作る。
//
//  設定（harness.config.json）:
//    "coverage": {
//      "report": "coverage/lcov.info",                          実行の記録（lcov 形式）。テストのコマンドが毎回作る
//      "scope": ["apps/api/src", "packages/shared/src"],        この記録で確かめるソースの範囲（glob。! で除外）。省略すると source.dirs の全部
//      "not_run": [{ "path": "src/server.ts", "reason": "…" },  どのテストからも実行されないことを認めたファイル
//                  { "path": "src/a.ts#legacy", "reason": "…" }]  …と、呼ばれないことを認めた関数（<ファイル>#<関数の名前>）
//      "functions": { "none": "<理由>" }                        関数の単位の検査（V6・V7）を使わないとき。省略すると使う
//    }
//  coverage は { "none": "<理由>" } と書ける。省略すると「未宣言」と表示する（確かめていないことを見えるままにする）。
//  active な REQ と source があるプロジェクトでは、coverage の none・省略・形の誤りを lint refs の C26 が違反にする。
//
//  検査項目:
//    V1  記録が実在し、lcov として読めて、--since より新しい（古い記録で通さない）
//    V2  範囲（coverage.scope。省略すると source.dirs）に入るソースのファイルが、すべて記録に載っている
//        （not_run に書いたファイルは、載っていなくてもよい）。
//        範囲の外のソースは確かめず、件数を毎回表示する（確かめていない範囲を見えるままにする）
//    V3  実行する行を持つソースのファイルは、1 行以上実行されている（not_run に書いたファイルを除く）
//    V4  not_run の各項目は、path がソースのファイルか「<ファイル>#<関数の名前>」で、reason があり、実際に 1 行も実行されていない
//        （関数なら 1 回も呼ばれていない）。実行されるようになったら、項目を消す
//    V5  entry.compose のファイルが実行されている（entry を宣言しているとき）。記録に関数ごとの情報（FN / FNDA）が
//        あれば、compose の名前の関数が 1 回以上呼ばれていることまで確かめる
//    V6  範囲に入るソースの名前のある関数は、1 回以上呼ばれている（not_run に書いた関数と、V3 で違反になるファイルを除く）。
//        名前の無い関数（記録の名前が ( や < で始まるものと anonymous_<数字>。無名のコールバックなど）は対象にしない
//    V7  記録に関数ごとの情報（FN / FNDA）がある。出さない道具を使うなら coverage.functions を { "none": "<理由>" } にする。
//        「FNF:0」は、そのファイルが関数を持たないことの印にだけ使う（FN / FNDA の代わりには数えない）
//  確かめるのは「1 回も実行されなかったファイル・関数が無いこと」まで。行ごとの割合のしきい値は持たない。
//
//  使い方:
//    harness lint coverage [--root <プロジェクトのルート>] [--config <設定ファイル>] [--since <エポックからのミリ秒>]
//
//  終了コード: 0 = 違反なし（未宣言・none を含む） / 1 = 違反あり / 2 = 使い方・設定ファイルが無い・JSON として読めない

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { inScope } from "../_shared/glob.mjs";
import { isMap, isNone, isText, openProject, posixPath, readEntry, tagOf } from "../_shared/entry.mjs";

const TAG = tagOf("coverage");

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

function main() {
	const { opts, cfg, root } = openProject("coverage", process.argv.slice(2));
	const entry = readEntry(cfg, root);

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
