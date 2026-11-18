#!/usr/bin/env node
//
//  lint entries — アプリの入口の一覧を契約と突き合わせ、契約に無い入口と入口の無い操作を洗い出す検査（harness lint entries。依存ゼロの Node）
//
//  テストが通っていても、契約に無い入口がアプリに残っていれば、仕様どおりに動くことの裏付けにならない。
//  実装のコードに書く印（名乗り）ではなく、実行の記録と、アプリ自身が出した入口の一覧で確かめる（ADR-0066 / ADR-0070）。
//  このコマンドはファイルと記録を読むだけで、テストもコマンドも実行しない（完了の判定では、検査の並び tools/_shared/suite.mjs が実行して渡す）。
//  引数と設定の読み方は tools/_shared/entry.mjs（lint entry・lint coverage・lint entries で同じ）。
//  入口の一覧は、利用プロジェクトの commands.list_entries のコマンドが作る。
//
//  設定（harness.config.json）:
//    "commands": { "list_entries": "node scripts/list-entries.mjs" }   アプリの入口の一覧を 1 行 1 件の JSON で標準出力に出すコマンド
//  commands.list_entries は、コマンドか { "none": "<理由>" } を必ず書く（none は、撤回されていない UC の fixed の契約に inbound の操作が無い間だけ通る）。
//
//  検査項目:
//    入口と操作は、文字の完全一致で比べる（http は method と path、それ以外は名前。harness はパスを解釈しない）
//    E1  一覧にある入口が、撤回されていない UC の fixed の契約の、inbound の操作のどれにも合わない。
//        合う操作が 1 つも無い入口（契約に無い入口）と、合う操作が fixed でない契約にしか無い入口の 2 通りを、文を分けて報告する。
//        契約の外の入口を認める宣言は無い。生存確認や静的なファイルの配信も、契約の操作として書く
//    E2  fixed の契約の、owned かつ inbound の操作に合う入口が、一覧に無い
//    E4  一覧か、契約の操作の入口を読めない（当てはまる場合の一覧は README の検査項目の表）
//    （E3 は欠番。契約に書かない入口の宣言 entries.outside_contract の検査だったが、その宣言を廃止した）
//
//  使い方:
//    harness lint entries [--root <プロジェクトのルート>] [--config <設定ファイル>] [--from <入口の一覧のファイル>]
//                         --from を省くと、一覧を標準入力から読む（<一覧を出すコマンド> | harness lint entries）
//
//  終了コード: 0 = 違反なし / 1 = 違反あり / 2 = 使い方・設定ファイルが無い・JSON として読めない

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { allUcDirs, goalsRootOf } from "../_shared/spec-tree.mjs";
import { ENTRY_TRANSPORTS, TRANSPORTS, isFilledText } from "../_shared/contract-vocab.mjs";
import { parseFrontmatter } from "../_shared/frontmatter.mjs";
import { parseStrictYaml } from "../_shared/strict-yaml.mjs";
import { isMap, isNone, isText, openProject, tagOf, usage } from "../_shared/entry.mjs";

const TAG = tagOf("entries");

//  ---- 入口の一覧と契約の突き合わせ（entries） -----------------------------------

//  入口の突き合わせは、文字の完全一致で行う。http は method と path、それ以外は名前を、一覧と契約でそのまま比べる。
//  harness はパスを解釈しない（:id と {id} を同じとみなさない。* を特別に扱わない。末尾の / も大文字小文字もならさない）。
//  枠組みの書き方から契約の書き方へ直すのは、一覧を出すスクリプト（commands.list_entries）の役目（ADR-0070）

//  入口の種類は、契約の transport と同じ語彙（tools/_shared/contract-vocab.mjs）。一覧の kind に使う
const ENTRY_KINDS = TRANSPORTS;

//  入口の同一性（突き合わせに使う鍵）と、表示の書き方。鍵は、項目の並びを JSON にしたもの（項目の中の文字で、別の入口と同じ鍵にならない）
const httpEntry = (method, path) => ({ key: JSON.stringify(["http", method, path]), label: `${method} ${path}` });
const namedEntry = (kind, name) => ({ key: JSON.stringify([kind, name]), label: `${kind} ${name}` });
//  項目が「書いてある」かの判定は isFilledText（lint spec と同じもの。空白だけは空とみなす）

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
//  契約の読み方は tools/_shared/strict-yaml.mjs（lint spec / lint refs / run cases と同じ）。構文の誤りは lint spec が報告し、ここは読めた分だけ使う
function inboundOperations(cfg, root) {
	//  根の決め方と、フォルダの数え方は tools/_shared/spec-tree.mjs（lint spec が検査しない場所の契約を、突き合わせ先に数えない）
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
	//  同じ操作は lint spec も違反にする（判定は tools/_shared/contract-vocab.mjs の isFilledText）。ここでも、owned・x-status によらず報告する
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
			if (process.stdin.isTTY) usage("entries", `入口の一覧を渡す（${decl} | harness lint entries、または --from <一覧を書き出したファイル>）`);
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
	const { opts, cfg, root } = openProject("entries", process.argv.slice(2));
	return checkEntries(cfg, root, opts);
}

process.exitCode = main();
