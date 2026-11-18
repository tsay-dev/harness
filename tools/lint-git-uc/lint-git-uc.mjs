#!/usr/bin/env node
//
//  lint git uc — コミットが指す UC が実装に入れる状態かの検査（harness lint git uc。draft なのに実装、を防ぐ）
//
//  コミットメッセージの UC: トレーラ（または --uc）の UC について、UC と REQ が active で、契約が fixed であることを確かめる。
//  違反の集め方と報告、引数の読み方は tools/_shared/spec-cli.mjs（lint spec と同じ）。
//
//  使い方:
//    harness lint git uc --message <file>       commit メッセージの UC: トレーラの UC が実装可能か検証（baseline は見ない）
//    harness lint git uc --uc UC-012            指定 UC が実装可能（UC / REQ が active・契約 fixed）か検証
//        [--unit <名前>]                        モノレポ（harness.config.json の git.units）のルートで実行するときの unit。
//                                               --message では unit をコミット 1 行目の scope から決める（ADR-0040）
//        [--docs docs]                          docs のフォルダ
//
//  終了コード: 0=OK / 1=違反あり / 2=使い方エラー
//

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseStrictYaml } from "../_shared/strict-yaml.mjs";
import { CONFIG_FILE, renamedConfigHint } from "../_shared/config.mjs";
import { reqDocsOf } from "../_shared/reqs.mjs";
import { specDirs } from "../_shared/spec-tree.mjs";
import { err, errors, parseArgs, readFm, report } from "../_shared/spec-cli.mjs";

const COMMAND = "lint git uc";

function findUcDir(docsDir, id) {
	const goalsRoot = join(docsDir, "goals");
	for (const gdir of specDirs(goalsRoot).dirs) {
		const g = basename(gdir);
		const hit = specDirs(gdir).dirs.map((d) => basename(d)).find((d) => d === id || d.startsWith(id + "-"));
		if (hit) return join(goalsRoot, g, hit);
	}
	return null;
}

//  モノレポのホスト（harness.config.json の git.units）では docs が unit ごとにあり、UC の番号も unit ごとに振られる。
//  どの unit の UC かは UC-nnn だけでは決まらないので、--message はコミット 1 行目の scope で、
//  --uc は --unit で決める（docs/adr/ADR-0040）。units の書式（名前の形・ディレクトリの実在）を検査するのは
//  lint git branch と lint git message で、ここでは名前 → ディレクトリの対応だけを読む。
//  返り値: null = 未宣言（単一ユニット。docs は cwd 直下） / Map<名前, ディレクトリ> / undefined = 設定異常
const UNITS_CONFIG = CONFIG_FILE;
const COMMIT_SCOPE_RE = /^[A-Za-z]+(?:\(([^()]*)\))?!?: /;

function readUnits() {
	if (!existsSync(UNITS_CONFIG)) {
		//  古い名前のファイルだけが残っていると、monorepo を単一ユニットと取り違えるので、案内を出して止める
		const hint = renamedConfigHint(UNITS_CONFIG);
		if (!hint) return null;
		console.error(`${COMMAND}: ${UNITS_CONFIG} が無い${hint}`);
		return undefined;
	}
	let cfg;
	try {
		cfg = JSON.parse(readFileSync(UNITS_CONFIG, "utf8"));
	} catch (e) {
		console.error(`${COMMAND}: ${UNITS_CONFIG} が JSON として読めない（${e.message}）`);
		return undefined;
	}
	const decl = cfg?.git?.units;
	if (decl === undefined) return null;
	const units = new Map();
	if (decl !== null && typeof decl === "object" && !Array.isArray(decl)) {
		for (const [name, dir] of Object.entries(decl)) if (name !== "_comment" && typeof dir === "string" && dir.trim()) units.set(name, dir);
	}
	if (units.size === 0) {
		console.error(`${COMMAND}: ${UNITS_CONFIG} の git.units から unit を読めない（書式は lint git branch で確かめる）`);
		return undefined;
	}
	return units;
}

//  コミットメッセージの 1 行目（空行と commit-msg ファイルの # 行を飛ばす）の scope。無ければ null
function scopeOf(msg) {
	const header = msg.split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#")) ?? "";
	return COMMIT_SCOPE_RE.exec(header)?.[1] || null;
}

function gateUc(docsDir, id) {
	const dir = findUcDir(docsDir, id);
	if (!dir || !existsSync(join(dir, "UC.md"))) {
		err("gate", `${id}: 対応する UC が無い（${docsDir}/goals/<GOAL-nn-slug>/${id}-<slug>/UC.md を作る）`);
		return;
	}
	const uc = readFm(join(dir, "UC.md")).data;
	if (uc.status !== "active") err("gate", `${id}: UC が active でない（現在 ${uc.status ?? "不明"}。draft のまま実装しない）`);
	const reqs = reqDocsOf(join(dir, "UC.md"), readFileSync(join(dir, "UC.md"), "utf8"), id).docs;
	if (reqs.length === 0) err("gate", `${id}: REQ が 1 件も無い（状態 × イベント表から REQ を導出し、UC.md の「要件」の節に書いてから実装する）`);
	for (const d of reqs) {
		const s = d.status;
		if (s === "draft" || !s) err("gate", `${id}: ${d.id} が active でない（現在 ${s ?? "不明"}）`);
	}
	//  契約は「存在し、かつ fixed」を要求する（契約なしのまま実装が進む事故を断つ）
	const contractFile = join(dir, "contract.yaml");
	if (!existsSync(contractFile)) {
		err("gate", `${id}: 契約が無い（${basename(dir)}/contract.yaml を作り fixed にする）`);
		return;
	}
	const { root } = parseStrictYaml(readFileSync(contractFile, "utf8"));
	if (root["x-status"] !== "fixed") err("gate", `${id}: 契約が fixed でない（draft のまま実装しない）`);
}

function cmdGate(docsDir, opts) {
	let ids = [];
	let msg = null;
	if (opts.uc) ids = [opts.uc];
	else if (opts.message) {
		if (!existsSync(opts.message)) {
			console.error(`${COMMAND}: メッセージファイルが無い: ${opts.message}`);
			return 2;
		}
		msg = readFileSync(opts.message, "utf8");
		ids = [...msg.matchAll(/^UC:\s*(UC-\d+)/gim)].map((m) => m[1]);
		if (ids.length === 0) return 0; //  トレーラ未使用はオプトイン。素通り（未強制）
	} else {
		console.error(`${COMMAND}: --message <file> か --uc UC-nnn が要る`);
		return 2;
	}

	const units = readUnits();
	if (units === undefined) return 2;
	const names = units ? [...units.keys()].join(" / ") : "";
	if (opts.unit !== undefined && (!units || msg !== null)) {
		console.error(`${COMMAND}: --unit は git.units を宣言したホストで --uc と一緒に使う（--message では unit をコミットの scope から決める）`);
		return 2;
	}
	let unit = null;
	if (units && msg === null) {
		if (!units.has(opts.unit)) {
			console.error(`${COMMAND}: モノレポでは --uc に --unit <名前> が要る（使えるのは ${names}）`);
			return 2;
		}
		unit = opts.unit;
	} else if (units) {
		const scope = scopeOf(msg);
		if (!units.has(scope)) {
			err("gate", `${ids.join(", ")}: コミットの scope ${scope ?? "（なし）"} が unit でない（UC は unit の docs にある。UC: を付けるコミットの scope は ${names} のどれか）`);
			report(COMMAND);
			return 1;
		}
		unit = scope;
	}

	const unitDocs = unit ? join(units.get(unit), docsDir) : docsDir;
	for (const id of ids) gateUc(unitDocs, id);
	report(COMMAND);
	return errors.length > 0 ? 1 : 0;
}

const opts = parseArgs(COMMAND, process.argv.slice(2));
process.exit(cmdGate(opts.docs, opts));
