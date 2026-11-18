#!/usr/bin/env node
//
//  lint spec — docs SSOT のフォーマット / ライフサイクル検証（harness lint spec）
//
//  検証対象のレイアウト（rules/develop/docs.md §10）:
//    docs/00-overview.md  01-glossary.md                         単票（OVERVIEW / GLOSSARY）。GOAL の ID は概要の GOAL の表の行で定義する（ADR-0076）
//    docs/design.md                                              【任意】How の現在形
//    docs/goals/GOAL-nn-<slug>/                                  ゴールのフォルダ（planned でない行の GOAL だけ。UC を置く）
//    docs/goals/GOAL-nn-<slug>/UC-nnn-<slug>/UC.md               ユースケース（＝縦スライスの単位）
//    docs/goals/GOAL-nn-<slug>/UC-nnn-<slug>/UC.md の「要件」の節  要件（### REQ-nnn の小節。EARS 1 文 + 検証方針。ADR-0067）
//    docs/goals/GOAL-nn-<slug>/UC-nnn-<slug>/contract.yaml       UC の境界契約（harness 独自 YAML）
//    docs/rules/BR-nnn.md  docs/nfr/NFR-nnn.md  docs/adr/ADR-nnnn-<slug>.md   横断（中央）
//    docs/verification/GLOBAL.md                                 【任意】全体の検証除外
//    docs/verification/DEFERRED.md                               【既存のものだけ】凍結済みの、過去の保留の一覧（ADR-0068）
//    docs/_shared/components.yaml                                契約の共有語彙（$ref 先）
//
//  書式の SSOT は templates/develop/ のテンプレート。必須フロントマター・必須セクション・
//  契約の必須 x- キーはテンプレートから導出する（書式改定はテンプレートを直せば lint も追従する。
//  テンプレートで「# optional」と注記されたキーだけ任意）。閉じた語彙（status / phase / pattern /
//  transport / direction）は実行コードでしか強制できないため本ツールが持つ。
//  トレーサビリティ（被覆・参照・配置の整合 C1–C26）は lint refs の仕事で、ここでは見ない。
//
//  契約フォーマットの判断は docs/adr/ADR-0001（OpenAPI をやめた理由）と
//  docs/adr/ADR-0002（パーサを自前実装し YAML を厳格サブセットに限る理由）。
//
//  使い方:
//    harness lint spec [--docs docs]                全 docs を検証（フォーマット＋ライフサイクル不変条件）
//        [--ignore-legacy-layout]                   旧レイアウト（docs/specs/）が残っていても新レイアウト側の検査を続ける（移行中）
//                                                   baseline は持たない。違反はすべて失敗（ADR-0056）
//
//  終了コード: 0=OK / 1=違反あり / 2=使い方エラー
//

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lineOf, parseStrictYaml, stripComment } from "../_shared/strict-yaml.mjs";
import { readHostConfig } from "../_shared/config.mjs";
import { parseFrontmatter } from "../_shared/frontmatter.mjs";
import { reqDocsOf } from "../_shared/reqs.mjs";
import { GOAL_ROW_STATUS, MIGRATE_HINT, OVERVIEW_FILE, OVERVIEW_ID, OVERVIEW_STATUS, overviewFormat, overviewPathOf, retiredDocsIn, policiesInForce, readOverview } from "../_shared/overview.mjs";
import { goalsRootOf, specDirs } from "../_shared/spec-tree.mjs";
import { CONTRACT_STATUS, DIRECTIONS, ENTRY_TRANSPORTS, OP_NAME_RE, TRANSPORTS, isFilledText } from "../_shared/contract-vocab.mjs";
import { VIRTUAL, err, errors, parseArgs, readFm, report, warn } from "../_shared/spec-cli.mjs";

const COMMAND = "lint spec";

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "develop");

//  テンプレートのプレースホルダ。draft を抜けた成果物に残っていたら違反
const SENTINELS = ["GOAL-00", "UC-000", "REQ-000", "BR-000", "NFR-000", "ADR-0000", "ACT-00", "KPI-00", "YYYY-MM-DD"];
const GOAL_DIR_RE = /^GOAL-\d+-[a-z0-9-]+$/;
const UC_DIR_RE = /^UC-\d+-[a-z0-9-]+$/;
const ADR_FILE_RE = /^ADR-\d+-[a-z0-9-]+\.md$/;

//  --- 閉じた語彙（実行コードでしか強制できないため本ツールが正）---
const NODE_STATUS = ["draft", "active", "withdrawn"]; //  UC / REQ / BR / NFR。active ＝ 人間が承認した（GOAL の行の語彙は tools/_shared/overview.mjs）
const SINGLETON_STATUS = ["draft", "frozen", "living"]; //  glossary / GLOBAL（概要の語彙は tools/_shared/overview.mjs）
const DEFERRED_STATUS = ["living"]; //  DEFERRED（台帳は常に現在形。draft を持たない）
const ADR_STATUS = ["proposed", "accepted", "superseded"];
const PHASES = ["定義", "構造", "実装", "検証", "完了"]; //  UC.md の phase:（工程台帳。orchestrator だけが進める）
//  アクター表の 種別 は「人間」か「システム」で始まる（lint refs C15 は「システム」で始まるものだけを人間でないと数える）
const ACTOR_KINDS = ["人間", "システム"];
const EARS_PATTERNS = ["Ubiquitous", "Event-driven", "State-driven", "Unwanted behaviour", "Optional"];
const POLICY = "検証方針"; //  REQ の検証方針セクション（所有者は test-author。中身の判定は lint refs C2/C10）
const isSettled = (s) => !!s && s !== "draft" && s !== "proposed";
//  撤回済み（withdrawn）の文書は、ID・撤回の印・理由・1 文だけの短い形でよい。経緯は git と ADR が持つので、
//  効いていた頃の節（検証方針、状態 × イベント表、例外系の走査など）を残すことを求めない
const isWithdrawn = (s) => s === "withdrawn";

//  --- 肥大の閾値（本ツールが唯一の SSOT。producer craft に数値を書き写さない）---
//  UC.md と REQ は 1 スライスで producer / oracle の全員が別コンテキストで全文を読むため、
//  分量はそのまま全エージェントのコンテキスト＝コストになる（R-1005: 1 ファイルおおむね 100 行）。
const MAX_UC_CHARS = 8000; //  UC.md 本文の文字数（行数では 1 行 1,000 字の肥大を見逃す）
const MAX_REQ_CHARS = 2500; //  REQ 本文（EARS 1 文 + 検証方針）
const MAX_BR_CHARS = 2500; //  BR 本文（存在と意図だけ。値は R-102 で機械可読側へ）
const MAX_EARS_CHARS = 200; //  EARS 文 1 本の長さ（超えるのは複数要件の圧縮 / R-401）
const MAX_UC_CROSS_REFS = 10; //  UC.md の本文中の他 UC 参照数（複製の密度。表と事前条件の ID は数えない）
const MAX_CONTRACT_LINES = 400; //  契約 YAML は 1 行 1 キーの ASCII なので行数で測る

//  --- 保留台帳 docs/verification/DEFERRED.md の語彙と閾値（本ツールが唯一の SSOT。テンプレートの注記に数値を書き写さない）---
//  昇格先の語は、凍結済みの一覧の行が持っている値（ADR-0068。行は書き換えない）。ツールの改名（ADR-0071）の後も、語は変えない
const DEFERRED_ID_RE = /^DEF-\d{3}$/;
const DEFERRED_TARGETS = ["spec-lint", "trace-check", "contract-run", "test", "typecheck", "lint", "hook", "未定"]; //  昇格先

function getSections(body) {
	const secs = [];
	let cur = null;
	for (const line of body.split(/\r?\n/)) {
		const m = line.match(/^##\s+(.*)$/);
		if (m) {
			cur = { title: m[1].trim(), lines: [] };
			secs.push(cur);
		} else if (cur) cur.lines.push(line);
	}
	return secs;
}

//  HTML コメント（テンプレートのガイダンス）を除いた実質の有無
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "");
//  コード（``` ブロックと `...` スパン）を除く。中の <...> や日付は雛形の穴でも経緯でもない
const stripCode = (s) => s.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
//  YAML の行末コメントを除く（契約のガイダンスコメントを検査対象にしない）
const stripYamlComments = (s) => s.split(/\r?\n/).map(stripComment).join("\n");
const sectionFilled = (sec) => stripComments(sec.lines.join("\n")).split("\n").some((l) => l.trim().length > 0);
const findSection = (body, test) => getSections(body).find((s) => test(s.title));
const sectionKey = (title) => title.split(/[\s（(]/)[0];

//  マークダウン表の行をセル配列で返す（区切り行は除外。ヘッダは先頭要素）
function tableRows(lines) {
	const rows = [];
	for (const line of lines) {
		const t = line.trim();
		if (!t.startsWith("|")) continue;
		const cells = t.split("|").slice(1, -1).map((c) => c.trim());
		if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) continue;
		rows.push(cells);
	}
	return rows;
}

//  文頭の blockquote 段落（連続する > 行のかたまり）を数える
function blockquoteParagraphs(text) {
	const paras = [];
	let cur = null;
	for (const line of text.split(/\r?\n/)) {
		if (line.trim().startsWith(">")) {
			if (!cur) paras.push((cur = []));
			cur.push(line.replace(/^\s*>\s?/, ""));
		} else cur = null;
	}
	return paras.map((p) => p.join(" ").trim());
}

//  --- テンプレートからの書式導出（fallback はテンプレート欠落時のみ）---
//  必須キー ＝ フロントマターのキー。行末コメントに optional とあれば任意。
//  必須セクション ＝ ## 見出しの先頭語（空白・括弧の前まで）。
//  UC のひな形（UC.md）から、UC 自身の部分と、「要件」の節の最初の REQ の文書を取り出す
function ucTemplateParts() {
	const file = join(TEMPLATE_DIR, "UC.md");
	if (!existsSync(file)) return null;
	const parts = reqDocsOf(file, readFileSync(file, "utf8"), "UC-000");
	return { uc: parts.ucText, req: parts.docs[0]?.text ?? null };
}

function deriveDocFormat(name, fallback) {
	const file = join(TEMPLATE_DIR, name);
	//  UC と REQ の書式は、どちらも UC のひな形から導く（REQ は UC.md の「要件」の節の小節。ADR-0067）
	const parts = name === "UC.md" || name === "REQ" ? ucTemplateParts() : null;
	const text = name === "UC.md" ? parts?.uc : name === "REQ" ? parts?.req : existsSync(file) ? readFileSync(file, "utf8") : null;
	if (text === null || text === undefined) return fallback;
	const { raw, body } = parseFrontmatter(text);
	const required = [];
	const optional = [];
	for (const line of raw) {
		const m = line.match(/^([^:#]+):\s*(.*)$/);
		if (!m) continue;
		(/#.*\boptional\b/.test(m[2]) ? optional : required).push(m[1].trim());
	}
	const sections = getSections(body).map((s) => sectionKey(s.title));
	if (required.length === 0) return fallback;
	return { required, optional, sections };
}

function deriveContractKeys() {
	const file = join(TEMPLATE_DIR, "contract.yaml");
	const fallback = ["x-uc", "x-status", "x-spec", "x-updated"];
	if (!existsSync(file)) return fallback;
	const keys = [];
	for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
		const m = line.match(/^(x-[\w-]+):/);
		if (m) keys.push(m[1]);
	}
	return keys.length > 0 ? keys : fallback;
}

const FORMATS = {
	overview: deriveDocFormat("00-overview.md", { required: ["id", "status"], optional: [], sections: ["解決する課題", "成功の定義", "アクター", "GOAL", "全体の方針", "やらないこと"] }),
	glossary: deriveDocFormat("01-glossary.md", { required: ["id", "status"], optional: [], sections: [] }),
	global: deriveDocFormat("verification-GLOBAL.md", { required: ["id", "status"], optional: [], sections: ["検証しない範囲"] }),
	deferred: deriveDocFormat("DEFERRED.md", { required: ["id", "status", "frozen_at"], optional: [], sections: ["保留中の指摘"] }),
	uc: deriveDocFormat("UC.md", { required: ["id", "title", "actor", "goal", "status", "phase"], optional: [], sections: ["概要", "事前条件", "主シナリオ", "状態", "例外系の走査", "事後条件"] }),
	req: deriveDocFormat("REQ", { required: ["id", "pattern", "uc", "status"], optional: ["br"], sections: [POLICY] }),
	br: deriveDocFormat("BR.md", { required: ["id", "title", "enforced_at", "status"], optional: [], sections: [] }),
	nfr: deriveDocFormat("NFR.md", { required: ["id", "category", "status"], optional: [], sections: [] }),
	adr: deriveDocFormat("ADR.md", { required: ["id", "title", "status", "date"], optional: ["supersedes"], sections: ["Context", "Decision", "Consequences", "却下した選択肢"] }),
};

//  --- 共通チェック ---

//  テンプレート由来の <...> プレースホルダの全集合（テンプレートの HTML コメント内は除く）。
//  これに一致する文字列は無条件に「雛形の穴」。それ以外の <非ASCII> は下の密着判定で絞る
const TEMPLATE_PLACEHOLDERS = (() => {
	const set = new Set();
	if (!existsSync(TEMPLATE_DIR)) return set;
	for (const name of readdirSync(TEMPLATE_DIR)) {
		if (!/\.(md|yaml)$/.test(name)) continue;
		const text = stripComments(readFileSync(join(TEMPLATE_DIR, name), "utf8"));
		for (const a of text.match(/<[^>\n]{1,60}>/g) || []) if (/[^\x00-\x7F]/.test(a)) set.add(a);
	}
	return set;
})();

function checkSentinels(file, text, status) {
	if (!isSettled(status)) return;
	//  HTML コメント・コード・YAML コメントの中は見ない（ガイダンスの転記や `<code>` の記法は穴ではない）
	const plain = stripCode(stripComments(/\.ya?ml$/.test(file) ? stripYamlComments(text) : text));
	for (const s of SENTINELS) {
		if (new RegExp(`\\b${s}\\b`).test(plain)) err(file, `${status} なのにテンプレのプレースホルダが残っている: "${s}"`);
	}
	for (const m of plain.matchAll(/<[^>\n]{1,60}>/g)) {
		const a = m[0];
		if (!/[^\x00-\x7F]/.test(a)) continue; //  HTML タグ等の ASCII は対象外
		//  テンプレートにある文字列はそのまま穴。それ以外は、直後が単語に密着していないものだけ
		//  （`<言語>.lproj` のようなメタ変数の用法は穴ではない）
		const after = plain[m.index + a.length] || "";
		if (TEMPLATE_PLACEHOLDERS.has(a) || !/[A-Za-z0-9_.\/-]/.test(after)) {
			err(file, `${status} なのにプレースホルダが残っている: "${a}"`);
			break;
		}
	}
}

function checkStatus(file, s, vocab, label = "status") {
	if (!s) {
		err(file, `${label} が無い`);
		return null;
	}
	if (!vocab.includes(s)) err(file, `${label} は ${vocab.join("|")} のいずれか。実際: "${s}"`);
	return s;
}

function checkRequiredFm(file, data, keys) {
	for (const k of keys) if (!data[k] || data[k].length === 0) err(file, `フロントマター "${k}" が空/欠落`);
}

//  必須セクションの存在と、draft を抜けた文書での空セクション
function checkSections(file, body, required, status, opts = {}) {
	if (isWithdrawn(status)) return;
	const secs = getSections(body);
	for (const key of required) {
		const found = secs.find((s) => sectionKey(s.title) === key || s.title.startsWith(key));
		if (!found) err(file, `必須セクション "${key}" が無い`);
		else if (isSettled(status) && !(opts.skipEmpty || []).includes(key) && !sectionFilled(found))
			err(file, `${status} なのにセクション "${key}" が空`);
	}
}

//  --- docs 衛生（負のリスト混入の検出。SSOT は各 producer craft）---
//  すべて warn（既存プロジェクトの validate を err で即死させない）。
function checkHygiene(file, body, kind, opts = {}) {
	const lines = body.split(/\r?\n/);
	const plain = stripComments(body);
	//  REQ の検証方針は「参照先」「値の SSOT は <path>」を書く正規の場所なので、アンカー系の検査は要件文の側だけに掛ける
	const policyIdx = kind === "req" ? plain.indexOf(`## ${POLICY}`) : -1;
	const head = policyIdx >= 0 ? plain.slice(0, policyIdx) : plain;

	//  1) 本文中の日付括弧: 「（2026-07-26 改訂）」のような経緯の追記痕。
	//     日付の直後に助詞が続く「（2026-02-29 は不正）」は検証値の記述なので対象外。コード内も見ない
	const dates = stripCode(plain).match(/[（(]\d{4}-\d{2}-\d{2}(?!\s*[はがをもとのに])/g) || [];
	if (dates.length > 0) warn(file, `本文中に日付括弧の経緯記述が ${dates.length} 件（経緯は git が持つ。本文は現在形に統合する）`);

	if (kind === "uc" || kind === "req") {
		//  2) 実装アンカー: コード側ファイルへのパス／行番号参照（コードが SSOT。BR は「値の SSOT は <path>」を書くため対象外）
		const anchors = head.match(/[\w./-]+\.(php|js|ts|jsx|tsx|sql|mjs|cjs|py|rb|go|java|swift|kt)\b(:\d+(-\d+)?)?/g) || [];
		if (anchors.length > 0) warn(file, `実装アンカーが ${anchors.length} 件（例: ${anchors[0]}）— コードが SSOT。docs に書かない`);

		//  3) framework 内部 API への言及（クラス::メソッド 形式）
		const internal = head.match(/\w+::\w+/g) || [];
		if (internal.length > 0) warn(file, `内部 API 参照が ${internal.length} 件（例: ${internal[0]}）— 観測可能な振る舞いの語彙で書く`);

		//  4) 未決の堆積セクション
		for (const s of getSections(body))
			if (/既知の課題|残存リスク|バックログ/.test(s.title)) warn(file, `セクション「${s.title}」— 未解決論点・リスクは issue 管理へ排出する`);
	}

	//  5) 肥大の煙探知機（行数でなく文字数）
	if (kind === "uc" && plain.length > MAX_UC_CHARS)
		warn(file, `本文が ${plain.length} 文字（${MAX_UC_CHARS} 文字超）— 1 UC を超えた堆積の疑い。全 producer / oracle が全文を読む（R-503 の粒度・R-1005 を見直す）`);
	if (kind === "req" && plain.length > MAX_REQ_CHARS)
		warn(file, `本文が ${plain.length} 文字（${MAX_REQ_CHARS} 文字超）— 検証方針にケースの前提・操作・期待値を書いていないか（R-601 / R-604）`);
	if (kind === "br" && plain.length > MAX_BR_CHARS)
		warn(file, `本文が ${plain.length} 文字（${MAX_BR_CHARS} 文字超）— 値・列挙は機械可読側へ（R-102）。ここは存在と意図だけ`);

	//  6) UC の他 UC 参照密度（参照先の振る舞いを複製していないか）。
	//     R-105 の疑いは散文にしか立たないので、表の行（状態 × イベント表の「不可: UC-nnn」など）と
	//     事前条件の参照列挙は数えず、本文の延べ出現だけを見る
	if (kind === "uc") {
		const selfId = opts.selfId || "";
		const prose = getSections(plain)
			.filter((s) => !s.title.startsWith("事前条件"))
			.flatMap((s) => s.lines)
			.filter((l) => !l.trim().startsWith("|"))
			.join("\n");
		const refs = (prose.match(/\bUC-\d+\b/g) || []).filter((r) => r !== selfId);
		if (refs.length > MAX_UC_CROSS_REFS)
			warn(file, `本文中の他 UC への参照が ${refs.length} 件（${MAX_UC_CROSS_REFS} 件超。表と事前条件は数えない）— 参照先の振る舞いを複製していないか。共通の規則は BR へ括り出す（R-105）`);
	}

	if (kind === "contract") {
		//  operation 配下の x-*（業務ルールの書き戻し）は validateContract の閉じたキー集合が err で落とす。ここは分量だけ見る
		const longDescs = countLongDescriptions(lines);
		if (longDescs > 0) warn(file, `長い description が ${longDescs} 件（8 行超または 200 字超）— 目的・規則・UI 説明は UC / REQ。契約は summary 1 行と短い注記のみ`);
		if (lines.length > MAX_CONTRACT_LINES) warn(file, `本文が ${lines.length} 行（${MAX_CONTRACT_LINES} 行超）— 1 UC を超えた堆積の疑い（負のリスト該当を排出する）`);
	}
}

//  YAML の description: ブロック／インラインが長い件数を数える（依存ゼロの行スキャン）
function countLongDescriptions(lines) {
	let count = 0;
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^(\s*)description:\s*(.*)$/);
		if (!m) continue;
		const indent = m[1].length;
		const rest = m[2].replace(/\s+#.*$/, "").trim();
		if (rest === ">" || rest === ">-" || rest === "|" || rest === "|-") {
			let blockLines = 0;
			let blockChars = 0;
			for (let j = i + 1; j < lines.length; j++) {
				const line = lines[j];
				if (line.trim() === "") {
					blockLines++;
					continue;
				}
				const ind = line.match(/^(\s*)/)[1].length;
				if (ind <= indent) break;
				blockLines++;
				blockChars += line.trim().length;
			}
			if (blockLines > 8 || blockChars > 200) count++;
		} else if (rest.length > 200) count++;
	}
	return count;
}

//  --- 各文書の検証 ---

//  単票（glossary / GLOBAL / DEFERRED。概要は validateOverview）。vocab は status の語彙（DEFERRED だけ living に閉じる）
function validateSingleton(file, kind, expectedId, required, vocab = SINGLETON_STATUS) {
	if (!existsSync(file)) {
		if (required) warn(file, `${basename(file)} が無い（テンプレート templates/develop/${basename(file) === "GLOBAL.md" ? "verification-GLOBAL.md" : basename(file)} 参照）`);
		return null;
	}
	const fmt = FORMATS[kind];
	const { data, body } = readFm(file);
	checkRequiredFm(file, data, fmt.required);
	if (data.id && data.id !== expectedId) err(file, `id は ${expectedId}。実際: "${data.id}"`);
	const status = checkStatus(file, data.status, vocab);
	checkSections(file, body, fmt.sections, status);
	checkSentinels(file, body, status);
	checkHygiene(file, body, "singleton");
	return { status };
}

//  1 枚の概要（00-overview.md。ADR-0076）。表の読み方は tools/_shared/overview.mjs（lint refs・guard と同じ）。
//  戻り: null（無い）| { status, goals: Map<id, 行>, policiesInForce }
function validateOverview(file) {
	if (!existsSync(file)) {
		warn(file, `${OVERVIEW_FILE} が無い（テンプレート templates/develop/${OVERVIEW_FILE} 参照）`);
		return null;
	}
	const fmt = FORMATS.overview;
	const { data, body } = readFm(file);
	checkRequiredFm(file, data, fmt.required);
	if (data.id && data.id !== OVERVIEW_ID) err(file, `id は ${OVERVIEW_ID}。実際: "${data.id}"`);
	const status = checkStatus(file, data.status, OVERVIEW_STATUS);
	checkSections(file, body, fmt.sections, status);
	checkSentinels(file, body, status);
	checkHygiene(file, body, "singleton");
	const ov = readOverview(readFileSync(file, "utf8"));
	for (const p of ov.problems) err(`${file}:${p.line}`, p.msg);
	for (const a of ov.actors)
		if (!ACTOR_KINDS.some((k) => a.kind.startsWith(k))) err(`${file}:${a.line}`, `${a.id}: 種別は ${ACTOR_KINDS.join(" / ")} のどちらかで始める。実際: "${a.kind}"`);
	const goals = new Map();
	for (const g of ov.goals) {
		const at = `${file}:${g.line}`;
		goals.set(g.id, g);
		if (!GOAL_ROW_STATUS.includes(g.status)) err(at, `${g.id}: status は ${GOAL_ROW_STATUS.join("|")} のいずれか。実際: "${g.status}"`);
		if (g.status !== "withdrawn" && !g.sentence.trim()) err(at, `${g.id}: 目指す状態の 1 文が空（R-301）`);
		if (g.status === "withdrawn" && !g.note.trim()) warn(at, `${g.id}: withdrawn なのに備考が空（撤回の理由を書く / R-201）`);
	}
	//  方針の小節は任意（未記入の間は、UC の並行性・外部依存の行を省けない）。見出しが欠けていれば、ひな形に合わせるよう伝える
	for (const h of overviewFormat().policies) if (!(h in ov.policies)) warn(file, `全体の方針に「### ${h}」の小節が無い（未記入なら、ひな形の「（未記入: …）」の 1 行を置く）`);
	return { status, goals, policiesInForce: policiesInForce(ov), policyHeadings: overviewFormat().policies };
}

function validateUC(file, dirId, ov = null) {
	const fmt = FORMATS.uc;
	const { data, body } = readFm(file);
	checkRequiredFm(file, data, fmt.required);
	const status = checkStatus(file, data.status, NODE_STATUS);
	if (data.phase && !PHASES.includes(data.phase)) err(file, `phase は ${PHASES.join("|")} のいずれか。実際: "${data.phase}"`);
	if (data.id && dirId && data.id !== dirId) err(file, `id "${data.id}" がディレクトリ名の ID "${dirId}" と不一致`);
	checkSections(file, body, fmt.sections, status);
	checkSentinels(file, body, status);
	checkHygiene(file, body, "uc", { selfId: data.id || "" });

	//  状態 × イベント表: 全セルを埋める（R-501。空セル＝仕様の穴）
	const stateSec = findSection(body, (t) => t.startsWith("状態"));
	const stateRows = stateSec ? tableRows(stateSec.lines) : [];
	if (isSettled(status) && !isWithdrawn(status) && stateSec) {
		if (stateRows.length < 2) err(file, `${status} なのに状態 × イベント表にデータ行が無い（R-501）`);
		stateRows.slice(1).forEach((cells, i) => {
			const empty = cells.slice(1).some((c) => c === "");
			if (empty) err(file, `状態 × イベント表の ${i + 1} 行目（${cells[0]}）に空セルがある — 不可なら「不可: 理由」を書く（R-501: 空セル＝仕様の穴）`);
		});
	}
	//  例外系の走査: 4 分類の行が揃っているか（R-502）。並行性と外部依存は、概要の全体の方針が効いている（3 つの小節が埋まり、
	//  概要が living）ときだけ省ける（省いた行は方針どおり。ADR-0076）
	const excSec = findSection(body, (t) => t.startsWith("例外系"));
	const excRows = excSec ? tableRows(excSec.lines).slice(1) : [];
	if (isSettled(status) && !isWithdrawn(status) && excSec) {
		for (const axis of ["権限", "不変条件違反", "並行性", "外部依存"]) {
			if (excRows.some((r) => r[0] === axis)) continue;
			if ((axis === "並行性" || axis === "外部依存") && ov?.policiesInForce) continue;
			err(file, `例外系の走査に「${axis}」の行が無い（R-502: 4 分類を全て走査する${axis === "並行性" || axis === "外部依存" ? "。概要の全体の方針の 3 つの小節が埋まっていて、概要が living のときだけ省ける" : ""}）`);
		}
		//  方針の例外: 「方針の例外（<見出し>）: <代わりに許すこと>。理由: <理由>」と REQ-nnn（代わりの振る舞いも観測できるので要件とテストが要る）
		for (const r of excRows) {
			const cell = r.slice(1).find((c) => c.includes("方針の例外"));
			if (!cell) continue;
			const m = /方針の例外（([^）]*)）\s*[:：]/.exec(cell);
			const headings = ov?.policyHeadings ?? overviewFormat().policies;
			if (!m || !headings.includes(m[1])) err(file, `例外系の走査の「${r[0]}」: 方針の例外は「方針の例外（${headings.join(" | ")}）: <代わりに許すこと>。理由: <理由>」と書く（実際: ${cell}）`);
			if (!/理由[:：]\s*\S/.test(cell)) err(file, `例外系の走査の「${r[0]}」: 方針の例外に「理由: 」の後の理由が無い`);
			if (!r.slice(1).some((c) => /\bREQ-\d+\b/.test(c))) err(file, `例外系の走査の「${r[0]}」: 方針の例外に REQ-nnn が無い（代わりの振る舞いを要件とテストで確かめる / R-502）`);
		}
	}
	//  「なし（対象外）」「なし: ADR-0033」のように理由付きの「なし」も導出なしと読む（先頭一致）。方針の例外のセルは導出あり
	const hasExceptionDerivation = excRows.some((r) => r.slice(1).some((c) => c && !/^(なし|—|-)/.test(c)));
	return { id: data.id || dirId, status, phase: data.phase || null, goal: data.goal || null, hasExceptionDerivation };
}

function validateReq(file, ucDirId) {
	const fmt = FORMATS.req;
	const { data, body } = readFm(file);
	const stem = file.slice(file.lastIndexOf("#") + 1);
	checkRequiredFm(file, data, fmt.required);
	const status = checkStatus(file, data.status, NODE_STATUS);
	if (data.pattern && !EARS_PATTERNS.includes(data.pattern)) err(file, `pattern は ${EARS_PATTERNS.join(" | ")} のいずれか。実際: "${data.pattern}"（R-402）`);
	if (data.br && !/^BR-\d+(\s*,\s*BR-\d+)*$/.test(data.br)) err(file, `br は BR-nnn（複数はカンマ区切り）。実際: "${data.br}"`);

	//  EARS 文: 検証方針の前に blockquote 段落がちょうど 1 つ（R-401: 1 要件 1 文）
	const policyIdx = body.indexOf(`## ${POLICY}`);
	const head = policyIdx >= 0 ? body.slice(0, policyIdx) : body;
	const paras = blockquoteParagraphs(stripComments(head));
	if (paras.length === 0) err(file, `要件文（> で始まる EARS 1 文）が無い（R-401）`);
	else if (paras.length > 1) err(file, `要件文の blockquote が ${paras.length} 段落ある — 1 要件 1 文。別の要件は別の REQ へ（R-401）`);
	else if (paras[0].length > MAX_EARS_CHARS) warn(file, `要件文が ${paras[0].length} 文字（${MAX_EARS_CHARS} 文字超）— 複数の要件の圧縮ではないか（R-401）`);

	//  撤回した理由は note に書く（R-201）。経緯を git と ADR から引けるように、決定の記録の番号を添える
	if (isWithdrawn(status) && !data.note) warn(file, `withdrawn なのに撤回の理由（- note:）が無い（R-201）`);

	//  検証方針の中身は test-author が後から埋める（lint refs C2 / C10 が判定）。ここでは見出しの存在だけ
	checkSections(file, body, fmt.sections, status, { skipEmpty: [POLICY] });
	checkSentinels(file, head, status);
	checkHygiene(file, body, "req");
	return { id: data.id || stem, status, uc: data.uc || null };
}

function validateBR(file) {
	const fmt = FORMATS.br;
	const { data, body } = readFm(file);
	const stem = basename(file, ".md");
	checkRequiredFm(file, data, fmt.required);
	const status = checkStatus(file, data.status, NODE_STATUS);
	if (data.id && data.id !== stem) err(file, `id "${data.id}" がファイル名 "${stem}" と不一致（R-1001）`);
	checkSections(file, body, fmt.sections, status);
	checkSentinels(file, body, status);
	checkHygiene(file, body, "br");
	if (isSettled(status) && !isWithdrawn(status) && !/\*\*意図\*\*/.test(body)) warn(file, `「**意図**」が無い — 規則は存在と意図を書く（KPI / GOAL との接続）`);
	return { id: data.id || stem, status };
}

function validateNFR(file) {
	const fmt = FORMATS.nfr;
	const { data, body } = readFm(file);
	const stem = basename(file, ".md");
	checkRequiredFm(file, data, fmt.required);
	const status = checkStatus(file, data.status, NODE_STATUS);
	if (data.id && data.id !== stem) err(file, `id "${data.id}" がファイル名 "${stem}" と不一致（R-1001）`);
	checkSections(file, body, fmt.sections, status);
	checkSentinels(file, body, status);
	if (isSettled(status) && blockquoteParagraphs(stripComments(body)).length === 0) err(file, `${status} なのに要件文（> で始まる 1 文）が無い`);
	if (isSettled(status) && !isWithdrawn(status) && !/測定/.test(stripComments(body))) warn(file, `測定方法の記述が見当たらない — 測定できない NFR は書かない（R-104）`);
	return { id: data.id || stem, status };
}

function validateADR(file) {
	const fmt = FORMATS.adr;
	const { data, body } = readFm(file);
	const name = basename(file);
	checkRequiredFm(file, data, fmt.required);
	const status = checkStatus(file, data.status, ADR_STATUS);
	if (!ADR_FILE_RE.test(name)) err(file, `ファイル名は ADR-nnnn-<slug>.md（slug は小文字ケバブ）`);
	const prefix = (name.match(/^ADR-\d+/) || [null])[0];
	if (data.id && prefix && data.id !== prefix) err(file, `id "${data.id}" がファイル名の ID "${prefix}" と不一致`);
	if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) err(file, `date は YYYY-MM-DD。実際: "${data.date}"`);
	if (data.supersedes && !/^ADR-\d+$/.test(data.supersedes)) err(file, `supersedes は ADR-nnnn。実際: "${data.supersedes}"`);
	checkSections(file, body, fmt.sections, status);
	checkSentinels(file, body, status);
	return { id: data.id || prefix, status, supersedes: data.supersedes || null };
}

//  --- 契約 contract.yaml の検証（UC ディレクトリ直下。x-uc がディレクトリの ID と一致すること）---

//  internal ＝ 同じプロセス内の境界を、ホストが ADR で「契約に書く」と決めたときの語（既定は R-1204 で operation にしない）
//  stream ＝ 持続する接続（WebSocket / SSE など）の上を流れるメッセージ。接続の確立そのものは http の操作として書く（ADR-0061）
//  transport の語彙と、entry が要る transport は tools/_shared/contract-vocab.mjs（lint entries の入口の種類と同じもの）
const INBOUND_ONLY_TRANSPORTS = ["deeplink", "push"]; //  stream は双方向（outbound = 送るメッセージ / inbound = 届くイベント）
const SELF_OBSERVER = "self"; //  例の主体の接続。予約語なので observers に宣言しない
const EVENT_ITEM_KEYS = ["entry", "payload"]; //  examples.<case>.events.<観測者>[] の各項目も閉集合
const PERMISSION_CODE = "PERMISSION_DENIED";
//  operation 直下のキーは閉集合（x-* も不可）。規則は UC / REQ / BR、判定順序は errors の並び（R-1207）。
//  templates/develop/contract.yaml が使う 13 キーと一致させる（テンプレートに無いキーは受けない）
const OP_KEYS = ["transport", "direction", "owned", "source", "auth", "summary", "wire", "entry", "requires", "request", "response", "errors", "examples"];
const ERROR_ITEM_KEYS = ["code", "when", "wire"]; //  errors[] の各項目も閉集合

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function validateContract(file, text, dirId, xKeys, shared, entryScope = true) {
	const at = (line) => (line ? `${file}:${line}` : file);
	const { root, problems } = parseStrictYaml(text);
	for (const p of problems) err(at(p.line), p.msg);

	//  旧 OpenAPI 契約の検出（ハードカット。docs/adr/0001）
	if ("openapi" in root || "paths" in root) {
		err(
			file,
			`旧フォーマット（OpenAPI）の契約を検出。/docs-migrate で harness 形式（docs/adr/ADR-0001）へ移行する`,
		);
		return { id: root["x-uc"] || dirId, status: null, errorCount: 0, legacy: true, text };
	}

	for (const k of xKeys) {
		const v = root[k];
		if (v === undefined || v === null || String(v).length === 0)
			err(at(lineOf(root, k)), `必須キー "${k}" が空/欠落`);
	}
	//  欠落は上の必須キー検査が既に出しているので、ここでは値の妥当性だけを見る
	const status = root["x-status"]
		? checkStatus(at(lineOf(root, "x-status")), root["x-status"], CONTRACT_STATUS, "x-status")
		: null;
	const id = root["x-uc"] || null;
	if (id && dirId && id !== dirId)
		err(at(lineOf(root, "x-uc")), `x-uc "${id}" がディレクトリ名の ID "${dirId}" と不一致`);

	if (root["x-spec"]) {
		const target = join(dirname(file), String(root["x-spec"]));
		if (!existsSync(target)) err(at(lineOf(root, "x-spec")), `x-spec が解決しない: ${root["x-spec"]}`);
	}

	const ops = root["operations"];
	if (ops === undefined) {
		err(file, `トップレベル "operations:" が無い（境界が無い UC は operations: {} と x-no-boundary で宣言する）`);
		return { id, status, errorCount: 0, text };
	}
	if (!isMap(ops)) {
		err(at(lineOf(root, "operations")), `"operations" はマップで書く`);
		return { id, status, errorCount: 0, text };
	}

	const names = Object.keys(ops);
	if (names.length === 0) {
		//  境界ゼロは「免除」ではなく「宣言」。理由の無い空は通さない
		const reason = root["x-no-boundary"];
		if (!reason || String(reason).trim().length === 0)
			err(
				file,
				`operations が空なのに x-no-boundary が無い（境界を持たない理由を 1 行で書く。書けないなら境界がある）`,
			);
	}

	//  観測者: stream の例で「誰に届くか」を名指すための宣言（名前 → 1 行の説明）。self は予約語
	const observers = root["observers"];
	const observerNames = [SELF_OBSERVER];
	if (observers !== undefined) {
		if (!isMap(observers)) err(at(lineOf(root, "observers")), `"observers" はマップ（名前: 1 行の説明）で書く`);
		else
			for (const [o, desc] of Object.entries(observers)) {
				const oAt = at(lineOf(observers, o) || lineOf(root, "observers"));
				if (o === SELF_OBSERVER) err(oAt, `observers.${o}: "${SELF_OBSERVER}" は予約語（例の主体の接続）。宣言しない`);
				else if (!OP_NAME_RE.test(o)) err(oAt, `observers.${o}: 観測者名は lowerCamelCase で書く`);
				else observerNames.push(o);
				if (typeof desc !== "string" || desc.trim().length === 0) err(oAt, `observers.${o}: 説明（誰なのかを 1 行）が無い`);
			}
	}
	//  届くイベント（inbound の stream 操作）を entry で引けるようにする。例の events が指す先
	const eventOps = new Map();
	for (const name of names) {
		const op = ops[name];
		if (!isMap(op) || op["transport"] !== "stream" || op["direction"] !== "inbound") continue;
		const entry = op["entry"];
		if (typeof entry !== "string" || entry.trim().length === 0) continue;
		if (eventOps.has(entry))
			err(at(lineOf(op, "entry") || lineOf(ops, name)), `operations.${name}: entry "${entry}" が operations.${eventOps.get(entry).name} と重複（届くイベントの entry は契約内で一意）`);
		else eventOps.set(entry, { name, op, seen: false });
	}

	let errorCount = 0;
	for (const name of names) {
		const op = ops[name];
		const opAt = at(lineOf(ops, name));
		const label = `operations.${name}`;
		if (!isMap(op)) {
			err(opAt, `${label} はマップで書く`);
			continue;
		}
		if (!OP_NAME_RE.test(name))
			err(opAt, `${label}: 操作名は lowerCamelCase で書く`);
		for (const k of Object.keys(op))
			if (!OP_KEYS.includes(k))
				err(
					at(lineOf(op, k) || lineOf(ops, name)),
					`${label}: 未知のキー "${k}"（operation のキーは ${OP_KEYS.join(" / ")} に閉じる。x-* も不可 — 規則は UC / REQ / BR に、判定順序は errors の並びに書く: R-1207）`,
				);

		const fieldAt = (k) => at(lineOf(op, k) || lineOf(ops, name));
		const transport = op["transport"];
		const direction = op["direction"];
		const owned = op["owned"];

		if (!TRANSPORTS.includes(transport))
			err(fieldAt("transport"), `${label}: transport は ${TRANSPORTS.join(" | ")} のいずれか。実際: ${JSON.stringify(transport)}`);
		if (!DIRECTIONS.includes(direction))
			err(fieldAt("direction"), `${label}: direction は ${DIRECTIONS.join(" | ")} のいずれか。実際: ${JSON.stringify(direction)}`);
		if (typeof owned !== "boolean")
			err(fieldAt("owned"), `${label}: owned は true|false で明示する（形を我々が決めるのか写し取るのか）`);

		//  auth は省略を許さない。「書き忘れ」と「不要と判断した」を区別できなくなるため
		const auth = op["auth"];
		if (auth === undefined || auth === null || String(auth).length === 0)
			err(fieldAt("auth"), `${label}: auth が無い（不要なら none と明示する）`);
		else if (auth !== "none" && !(shared.authSchemes && auth in shared.authSchemes))
			err(
				fieldAt("auth"),
				`${label}: auth "${auth}" が _shared/components.yaml の authSchemes に無い`,
			);

		if (!op["summary"] || String(op["summary"]).trim().length === 0)
			err(fieldAt("summary"), `${label}: summary が無い（何をするかを 1 行）`);

		//  wire は http 専用。他の transport に HTTP 固有の語彙が漏れるのを止める
		const wire = op["wire"];
		if (transport === "http") {
			if (!isMap(wire)) err(fieldAt("wire"), `${label}: transport が http なら wire（method / path / success）が要る`);
			else {
				for (const k of ["method", "path", "success"])
					if (wire[k] === undefined || wire[k] === null)
						err(fieldAt("wire"), `${label}: wire.${k} が無い`);
			}
		} else if (wire !== undefined) {
			err(fieldAt("wire"), `${label}: transport が ${transport} なのに wire がある（wire は http 専用）`);
		}

		//  呼ばれる側の http の操作は、wire.method と wire.path を、アプリが出す入口の一覧と文字どおり比べる（lint entries）。
		//  比べられるよう、空でない文字列であることだけを求める（パスの形は解釈しない）。撤回済みの UC の契約は、突き合わせの対象でないので求めない
		if (entryScope && transport === "http" && direction === "inbound" && isMap(wire))
			for (const k of ["method", "path"])
				if (wire[k] !== undefined && wire[k] !== null && !isFilledText(wire[k]))
					err(at(lineOf(wire, k) || lineOf(op, "wire")), `${label}: wire.${k} は、空でない文字列で書く（実際: ${JSON.stringify(wire[k])}。入口の一覧の ${k} と、文字どおり比べる）`);

		//  写し取りの契約は出所が要る
		if (owned === false && (!op["source"] || String(op["source"]).trim().length === 0))
			err(fieldAt("source"), `${label}: owned が false なら source（写し取り元の URL / SDK バージョン）が要る`);
		if (owned === true && op["source"] !== undefined)
			err(fieldAt("source"), `${label}: owned が true なのに source がある（自前の境界に写し取り元は無い）`);

		//  呼ばれる側は入口の識別子が要る
		if (ENTRY_TRANSPORTS.includes(transport)) {
			//  入口の一覧の name と文字どおり比べるので、空でない文字列で書く（判定は lint entries と同じ。数や真偽値は文字列でない）。
			//  撤回済みの UC の契約は、wire.method・wire.path と同じく対象にしない（入口の突き合わせの対象でない）。
			//  向きは問わない（deeplink / push は inbound だけ。stream は、送る側のメッセージの名前も entry に書く）
			if (entryScope && !isFilledText(op["entry"]))
				err(fieldAt("entry"), `${label}: transport が ${transport} なら entry（URL パターン / ペイロード識別子 / メッセージ種別）を、空でない文字列で書く（実際: ${JSON.stringify(op["entry"] ?? null)}）`);
			if (INBOUND_ONLY_TRANSPORTS.includes(transport) && direction !== "inbound")
				err(fieldAt("direction"), `${label}: transport が ${transport} なら direction は inbound`);
		} else if (op["entry"] !== undefined) {
			err(fieldAt("entry"), `${label}: entry は ${ENTRY_TRANSPORTS.join(" / ")} 専用`);
		}

		//  届くイベントは応答も失敗経路も持たない（形は request に書く。push と同じ流儀）
		const isStream = transport === "stream";
		const isEvent = isStream && direction === "inbound";
		if (isEvent) {
			if (op["response"] !== undefined)
				err(fieldAt("response"), `${label}: 届くイベント（stream / inbound）に response は書かない（ペイロードの形は request に書く）`);
			if (Array.isArray(op["errors"]) && op["errors"].length > 0)
				err(fieldAt("errors"), `${label}: 届くイベント（stream / inbound）に errors は書かない`);
		}

		//  エラー。errors: [] は「失敗経路を持たない」の宣言（省略とは区別する。auth の none と同じ流儀）
		const errs = op["errors"];
		const codes = [];
		const noFailures = isEvent || (Array.isArray(errs) && errs.length === 0);
		if (errs !== undefined) {
			if (!Array.isArray(errs)) err(fieldAt("errors"), `${label}: errors はシーケンスで書く`);
			else
				for (const e of errs) {
					if (!isMap(e)) {
						err(fieldAt("errors"), `${label}: errors の各項目はマップで書く`);
						continue;
					}
					errorCount++;
					const code = e["code"];
					for (const k of Object.keys(e))
						if (!ERROR_ITEM_KEYS.includes(k))
							err(at(lineOf(e, k) || lineOf(op, "errors")), `${label}: errors["${code}"] に未知のキー "${k}"（code / when / wire のみ）`);
					if (!code) err(fieldAt("errors"), `${label}: errors に code が無い`);
					else {
						codes.push(code);
						if (shared.errorCodes && !(code in shared.errorCodes))
							err(
								fieldAt("errors"),
								`${label}: エラーコード "${code}" が _shared/components.yaml の errorCodes に無い`,
							);
					}
					if (!e["when"] || String(e["when"]).trim().length === 0)
						err(fieldAt("errors"), `${label}: errors["${code}"] に when（発生条件 1 行）が無い`);
					if (transport !== "http" && e["wire"] !== undefined)
						err(fieldAt("errors"), `${label}: errors["${code}"] に wire があるが transport が http でない`);
				}
		}

		//  権限を要求するなら、拒否されたときの経路が契約に無ければならない
		const requires = op["requires"];
		if (requires !== undefined) {
			if (!Array.isArray(requires) || requires.some((r) => typeof r !== "string"))
				err(fieldAt("requires"), `${label}: requires は文字列のシーケンスで書く`);
			else if (!codes.includes(PERMISSION_CODE))
				err(
					fieldAt("requires"),
					`${label}: requires を宣言しているのに errors に ${PERMISSION_CODE} が無い（拒否されたときの経路が契約に無い）`,
				);
		}

		//  例の events（誰に・どのイベントが・どの順で届くか）。書式は status によらず検査する
		const ex = op["examples"];
		if (isMap(ex))
			for (const [caseName, c] of Object.entries(ex)) {
				if (!isMap(c)) continue;
				const exLabel = `${label}: examples.${caseName}`;
				const exAt = at(lineOf(ex, caseName) || lineOf(op, "examples"));
				const events = c["events"];
				if (events === undefined) {
					//  省略は「届かない」の宣言ではない。届かないなら観測者ごとに [] と書く
					if (isStream && status === "fixed")
						err(exAt, `${exLabel} に events が無い（stream の例は観測者ごとに届くイベントを列挙する。届かないなら <観測者>: []）`);
					continue;
				}
				if (!isStream) {
					err(exAt, `${exLabel} に events があるが transport が stream でない`);
					continue;
				}
				if (!isMap(events) || Object.keys(events).length === 0) {
					err(exAt, `${exLabel}.events は「観測者: [イベント...]」のマップで、観測者を 1 つ以上書く`);
					continue;
				}
				if (isEvent && (c["request"] !== undefined || c["response"] !== undefined || c["error"] !== undefined))
					err(exAt, `${exLabel}: 届くイベントの例は events だけを書く（request / response / error は持たない）`);
				let selfSeen = false;
				for (const [who, list] of Object.entries(events)) {
					if (!observerNames.includes(who))
						err(exAt, `${exLabel}.events の観測者 "${who}" が observers に無い（${SELF_OBSERVER} か、契約の最上位 observers に宣言した名前）`);
					if (!Array.isArray(list)) {
						err(exAt, `${exLabel}.events.${who} はシーケンスで書く（届かないなら []）`);
						continue;
					}
					list.forEach((item, i) => {
						const itLabel = `${exLabel}.events.${who}[${i}]`;
						if (!isMap(item)) return err(exAt, `${itLabel} はマップ（entry / payload）で書く`);
						for (const k of Object.keys(item))
							if (!EVENT_ITEM_KEYS.includes(k)) err(exAt, `${itLabel} に未知のキー "${k}"（${EVENT_ITEM_KEYS.join(" / ")} のみ）`);
						const target = eventOps.get(item["entry"]);
						if (!target)
							return err(exAt, `${itLabel} の entry ${JSON.stringify(item["entry"])} を持つ届くイベント（stream / inbound の操作）がこの契約に無い`);
						target.seen = true;
						if (target.op === op) selfSeen = true;
						const schema = target.op["request"];
						const props = isMap(schema) && isMap(schema["properties"]) ? schema["properties"] : null;
						const required = isMap(schema) && Array.isArray(schema["required"]) ? schema["required"] : [];
						const payload = item["payload"];
						if (payload !== undefined && !isMap(payload)) return err(exAt, `${itLabel}.payload はマップで書く`);
						if (props) {
							for (const k of Object.keys(payload ?? {}))
								if (!(k in props)) err(exAt, `${itLabel}.payload の "${k}" が operations.${target.name} の request.properties に無い`);
							for (const k of required)
								if (!(k in (payload ?? {}))) err(exAt, `${itLabel}.payload に必須の "${k}" が無い`);
						}
					});
				}
				if (isEvent && !selfSeen)
					err(exAt, `${exLabel}.events にこのイベント自身（entry "${op["entry"]}"）が無い（届くイベントの例は、その状況で自身が届くことを示す）`);
			}

		//  具体例（fixed のみ）。実装とテストがコピペできる粒度を要求する。
		//  届くイベントは自身の例を必須にしない（操作の例に現れれば足りる。どの例にも現れないものは下でまとめて落とす）
		if (status === "fixed" && !(isEvent && ex === undefined)) {
			if (!isMap(ex) || Object.keys(ex).length === 0) {
				err(fieldAt("examples"), `${label}: fixed なのに examples が無い（正常 1 件${noFailures ? "" : "＋異常 1 件以上"}の実値）`);
			} else {
				const cases = Object.entries(ex);
				const ok = cases.filter(([, c]) => isMap(c) && c["error"] === undefined);
				const ng = cases.filter(([, c]) => isMap(c) && c["error"] !== undefined);
				if (ok.length === 0) err(fieldAt("examples"), `${label}: examples に正常系が無い`);
				if (ng.length === 0 && !noFailures) err(fieldAt("examples"), `${label}: examples に異常系（error: <code>）が無い（失敗経路が本当に無いなら errors: [] と宣言する）`);
				for (const [caseName, c] of ng)
					if (!codes.includes(c["error"]))
						err(
							fieldAt("examples"),
							`${label}: examples.${caseName} の error "${c["error"]}" がこの操作の errors に無い`,
						);
				//  逆向き: errors ⊆ examples。宣言した失敗経路には必ず実値の例を付ける（例の無い経路はテストにできない）
				if (!noFailures)
					for (const code of codes)
						if (!ng.some(([, c]) => c["error"] === code))
							err(fieldAt("examples"), `${label}: errors["${code}"] を返す examples が無い（失敗経路は例で実行可能にする）`);
				//  例のキーが request の properties と噛み合っているか。
				//  異常系（error: を持つ例）は「望まれない入力」なので、禁じたキーを含む反例を許す（未知キー・必須欠落とも検査しない）
				const props = isMap(op["request"]) && isMap(op["request"]["properties"]) ? op["request"]["properties"] : null;
				const required = isMap(op["request"]) && Array.isArray(op["request"]["required"]) ? op["request"]["required"] : [];
				if (props)
					for (const [caseName, c] of cases) {
						if (!isMap(c) || !isMap(c["request"]) || c["error"] !== undefined) continue;
						for (const k of Object.keys(c["request"]))
							if (!(k in props))
								err(fieldAt("examples"), `${label}: examples.${caseName}.request の "${k}" が request.properties に無い`);
						for (const k of required)
							if (!(k in c["request"]))
								err(fieldAt("examples"), `${label}: examples.${caseName}.request に必須の "${k}" が無い`);
					}
			}
		}
	}

	//  例の無い形は実行できない。fixed では、届くイベントがどれかの例の events に現れること
	if (status === "fixed")
		for (const [entry, t] of eventOps)
			if (!t.seen)
				err(
					at(lineOf(ops, t.name)),
					`operations.${t.name}: 届くイベント "${entry}" がどの例の events にも現れない（きっかけの操作の例か、このイベント自身の例に書く）`,
				);

	checkRefs(file, text, at);
	checkSentinels(file, text, status);
	checkHygiene(file, text, "contract");
	return { id, status, errorCount, text };
}

//  $ref の解決（相対ファイルの存在＋アンカー末尾キーの存在）
function checkRefs(file, text, at) {
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/\$ref:\s*["']?([^"'\s]+)["']?/);
		if (!m) continue;
		const [path, anchor] = m[1].split("#");
		let targetText = text;
		if (path) {
			const target = join(dirname(file), path);
			if (!existsSync(target)) {
				err(at(i + 1), `$ref のファイルが無い: ${path}`);
				continue;
			}
			targetText = readFileSync(target, "utf8");
		}
		const leaf = (anchor || "").split("/").filter(Boolean).pop();
		if (leaf && !new RegExp(`^\\s+${leaf}:`, "m").test(targetText))
			err(at(i + 1), `$ref のアンカーが見つからない: ${m[1]}`);
	}
}

//  --- 共有語彙 docs/_shared/components.yaml ---
function loadShared(docsDir) {
	const file = join(docsDir, "_shared", "components.yaml");
	if (!existsSync(file)) {
		warn(file, `共有語彙 components.yaml が無い（テンプレート templates/develop/components.yaml 参照）`);
		return { file, authSchemes: {}, errorCodes: {} };
	}
	const text = readFileSync(file, "utf8");
	const { root, problems } = parseStrictYaml(text);
	for (const p of problems) err(`${file}:${p.line}`, p.msg);
	if ("components" in root && !("errorCodes" in root))
		err(file, `旧フォーマット（OpenAPI components）の共有語彙を検出。/docs-migrate で authSchemes / errorCodes へ移行する`);
	const authSchemes = isMap(root["authSchemes"]) ? root["authSchemes"] : root["authSchemes"] === null ? {} : null;
	const errorCodes = isMap(root["errorCodes"]) ? root["errorCodes"] : null;
	if (authSchemes === null) err(file, `"authSchemes" が無い（使わないなら authSchemes: {} と書く）`);
	if (errorCodes === null) err(file, `"errorCodes" が無い（契約の errors[].code はここに閉じる）`);
	return { file, authSchemes: authSchemes || {}, errorCodes: errorCodes || {} };
}

//  --- design.md（任意ファイル・warn 中心）---
function validateDesign(file) {
	if (!existsSync(file)) return;
	const { data, body } = readFm(file);
	if (!data["ステータス"] || !data["更新日"]) warn(file, `フロントマター（ステータス/更新日）が無い`);
	if (/Given|When|Then|受け入れ条件/.test(body)) warn(file, `GWT/受け入れ条件らしき記述がある — 振る舞いは UC.md の「要件」の節の REQ へ`);
}

//  --- 保留台帳 docs/verification/DEFERRED.md（任意ファイル）---
//  凍結済みの一覧（ADR-0068）。新しい行は足さない: frontmatter の frozen_at より後の起票日の行は err。
//  1 行 1 件の表だけを持つ。書式（7 列・ID・日付・語彙）は err。残っている件数と、対象が消えた行は warn。
//  フロントマターと見出しは validateSingleton が先に見ている（status は living のみ）
function validateDeferred(file) {
	const { data, body } = readFm(file);
	//  一覧は凍結済み（ADR-0068）。frozen_at より後の起票日の行は書けない（保留を新しく足さない）
	const frozenAt = data.frozen_at ?? "";
	//  実在する日付だけを通す（Date.parse は 2026-02-31 を通すので、往復させて確かめる）
	const realDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
	const frozenOk = realDate(frozenAt);
	//  欠落は、ひな形から導いた必須キーの検査とは別に、ここでも失敗にする（ひな形を置かない配置でも見逃さない）
	if (!frozenAt) err(file, `frozen_at が無い — 保留の一覧は凍結済み。frontmatter に、凍結した日を frozen_at: YYYY-MM-DD で書く（ADR-0068）`);
	else if (!frozenOk) err(file, `frozen_at は YYYY-MM-DD（一覧を凍結した日）。実際: "${frozenAt}"`);
	//  1 日の余裕は、UTC より進んだ時刻帯で凍結した当日に書いた日付を通すため
	else if (frozenAt > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) err(file, `frozen_at ${frozenAt} が未来（一覧を凍結した日を書く）`);
	const sec = findSection(stripComments(body), (t) => t.startsWith("保留中"));
	if (!sec) return; //  見出しの欠落は checkSections が既に出している
	const rows = tableRows(sec.lines).slice(1); //  先頭はヘッダ行（区切り行は tableRows が除く）
	const today = new Date().toISOString().slice(0, 10);
	const seen = new Set();
	for (const cells of rows) {
		const idLabel = cells[0] || "(ID なし)";
		if (cells.length !== 7) {
			err(file, `${idLabel}: 列数が ${cells.length}（ID / 起票日 / 出所 / 対象 / 指摘 / 理由 / 昇格先 の 7 列）`);
			continue;
		}
		const [id, date, origin, target, finding, reason, promote] = cells;
		if (!DEFERRED_ID_RE.test(id)) err(file, `ID は DEF-nnn。実際: "${id}"`);
		else if (seen.has(id)) err(file, `${id}: ID が重複している`);
		seen.add(id);
		if (!realDate(date)) err(file, `${id}: 起票日は YYYY-MM-DD。実際: "${date}"`);
		else if (date > today) err(file, `${id}: 起票日 ${date} が未来`);
		else if (frozenOk && date > frozenAt)
			err(file, `${id}: 起票日 ${date} が frozen_at（${frozenAt}）より後 — 保留は新しく足さない。機械検査にするか、人間に聞いて仕様に書く（ADR-0068）`);
		for (const [label, v] of [["出所", origin], ["対象", target], ["指摘", finding], ["理由", reason]])
			if (v.length === 0) err(file, `${id}: ${label} が空`);
		if (!DEFERRED_TARGETS.includes(promote)) err(file, `${id}: 昇格先は ${DEFERRED_TARGETS.join(" | ")} のいずれか。実際: "${promote}"`);
		if (target.length > 0) {
			//  対象はホスト直下からの相対パス（validate は ホストのルートで走らせる前提）
			//  REQ を指す対象は「<UC.md のパス>#REQ-nnn」と書く（REQ は UC.md の「要件」の節の小節。ADR-0067）
			const [targetFile, anchor] = target.split("#");
			const abs = join(process.cwd(), targetFile);
			const missing =
				!existsSync(abs) ||
				(anchor !== undefined && !(/^REQ-\d+$/.test(anchor) && reqDocsOf(abs, readFileSync(abs, "utf8"), null).docs.some((d) => d.id === anchor)));
			if (missing) warn(file, `${id}: 対象 "${target}" が存在しない — 解消済みなら行を消す`);
		}
	}
	//  残っている行の数を毎回 1 行で示す（減っているかが毎回分かるように）。行ごとの古さ・積もり方の警告は出さない
	//  （凍結した一覧は、すべての行が古くなる）
	if (rows.length > 0) warn(file, `凍結済みの保留が ${rows.length} 件残っている（解消したら行を消す。新しい行は足さない / ADR-0068）`);
}

//  --- validate コマンド ---
const listDirs = (dir) =>
	existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
const listFiles = (dir, re) =>
	existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile() && re.test(d.name)).map((d) => join(dir, d.name)).sort() : [];

function loadModel(docsDir) {
	const goalsRoot = join(docsDir, "goals");
	const xKeys = deriveContractKeys();
	const shared = loadShared(docsDir);
	//  GOAL の定義は概要の GOAL の表の行（ADR-0076）。フォルダは planned でない行の GOAL だけに置ける
	const overviewFile = join(docsDir, OVERVIEW_FILE);
	const ov = validateOverview(overviewFile);
	const goals = ov?.goals ?? new Map(); //  id -> 行
	const goalDirs = new Map(); //  id -> フォルダ
	const ucs = new Map(); //  id -> { file, dir, status, phase, goal, hasExceptionDerivation, reqs: [] }
	const contracts = new Map(); //  id -> { file, status, errorCount, text }

	//  フォルダの数え方は tools/_shared/spec-tree.mjs（ほかの検査ツールと同じ。_ で始まるフォルダは lint refs が配置の違反にする）
	for (const gdir of specDirs(goalsRoot).dirs) {
		const gname = basename(gdir);
		const gid = (gname.match(/^GOAL-\d+/) || [null])[0];
		if (!GOAL_DIR_RE.test(gname)) err(gdir, `ディレクトリ名が GOAL-nn-<slug>（slug は小文字ケバブ）でない`);
		if (gid) {
			if (goalDirs.has(gid)) err(gdir, `GOAL "${gid}" のフォルダが 2 つある（${goalDirs.get(gid)} と）`);
			else goalDirs.set(gid, gdir);
			const row = goals.get(gid);
			if (!ov) err(gdir, `GOAL のフォルダがあるのに ${OVERVIEW_FILE} が無い（GOAL は概要の GOAL の表の行で定義する）`);
			else if (!row) err(gdir, `${gid} の行が概要（${OVERVIEW_FILE}）の GOAL の表に無い`);
			else if (row.status === "planned") err(gdir, `${gid} は概要で planned（未着手）なのにフォルダがある（着手したら行の status を draft にする / R-1008）`);
		}
		for (const f of listFiles(gdir, /^(UC|REQ)-\d+.*\.md$/)) err(f, `UC / REQ はゴール直下ではなく UC ディレクトリ配下に置く（R-1006）`);

		for (const udir of specDirs(gdir).dirs) {
			const uname = basename(udir);
			const uid = (uname.match(/^UC-\d+/) || [null])[0];
			if (!UC_DIR_RE.test(uname)) err(udir, `ディレクトリ名が UC-nnn-<slug>（slug は小文字ケバブ）でない`);
			const ufile = join(udir, "UC.md");
			if (!existsSync(ufile)) {
				err(udir, `UC.md が無い（UC ディレクトリには必須 / R-1006）`);
				continue;
			}
			//  REQ は UC.md の「要件」の節にある。UC 自身の検査は、その節を除いた部分に対して行う
			const reqParts = reqDocsOf(ufile, readFileSync(ufile, "utf8"), uid);
			for (const p of reqParts.problems) err(`${ufile}:${p.line}`, p.msg);
			VIRTUAL.set(ufile, reqParts.ucText);
			const u = validateUC(ufile, uid, ov);
			if (u.goal && gid && u.goal !== gid) err(ufile, `goal "${u.goal}" が配置ディレクトリの GOAL "${gid}" と不一致（R-1007）`);
			const id = u.id || uid;
			const entry = { file: ufile, dir: udir, ...u, reqs: [] };
			if (id) {
				if (ucs.has(id)) err(ufile, `UC "${id}" が重複（${ucs.get(id).file} と）`);
				else ucs.set(id, entry);
			}
			for (const d of reqParts.docs) {
				VIRTUAL.set(d.label, d.text);
				entry.reqs.push(validateReq(d.label, id));
			}
			for (const f of listFiles(udir, /^REQ-\d+\.md$/))
				err(f, `REQ は UC.md の「要件」の節に小節として書く（ADR-0067）。REQ-nnn.md は harness migrate reqs --write で移す`);
			//  UC.md 以外の md は lint refs の対象に入らず、紐づきの検査をすり抜ける（ADR-0056）
			for (const f of listFiles(udir, /\.md$/)) if (!/^(UC|REQ-\d+)\.md$/.test(basename(f))) err(f, `UC ディレクトリに UC.md 以外の md がある（1 ID 1 ファイル / R-1001。資料は docs/attic へ）`);
			//  UC ディレクトリの下位ディレクトリ（_drafts/ など）の md も、どの検査にも数えられない
			const nested = (dir) => listDirs(dir).flatMap((d) => [...listFiles(join(dir, d), /\.md$/), ...nested(join(dir, d))]);
			for (const f of nested(udir)) err(f, `UC ディレクトリの下位ディレクトリに md がある（検査の対象にならない。UC ディレクトリ直下に置くか docs/attic へ）`);

			const contractFile = join(udir, "contract.yaml");
			if (existsSync(contractFile)) {
				const c = validateContract(contractFile, readFileSync(contractFile, "utf8"), uid, xKeys, shared, u.status !== "withdrawn");
				if (c.id) contracts.set(c.id, { file: contractFile, ...c });
			}
			if (existsSync(join(udir, "api-contract.yaml"))) err(join(udir, "api-contract.yaml"), `旧フォーマットの契約が残っている（/docs-migrate）`);
		}
	}

	//  横の ID 空間（中央）
	for (const f of listFiles(join(docsDir, "rules"), /\.md$/)) validateBR(f);
	for (const f of listFiles(join(docsDir, "nfr"), /\.md$/)) validateNFR(f);
	const adrs = listFiles(join(docsDir, "adr"), /\.md$/).map(validateADR);
	const adrIds = new Set(adrs.map((a) => a.id));
	const adrById = new Map(adrs.map((a) => [a.id, a]));
	for (const a of adrs) {
		if (!a.supersedes) continue;
		const old = adrById.get(a.supersedes);
		if (!old) err(join(docsDir, "adr"), `${a.id} の supersedes "${a.supersedes}" が存在しない`);
		//  置き換えた側が承認されたら（accepted。後でさらに置き換えられて superseded になっていても同じ）、置き換えられた側は superseded にする
		//  （現行の判断が 2 つ並ばないようにする）。置き換える側が proposed の間は、まだ置き換わっていない
		else if (a.status !== "proposed" && old.status !== "superseded")
			err(join(docsDir, "adr"), `${a.id}（${a.status}）が ${old.id} を置き換えているのに、${old.id} の status が ${old.status}（superseded にする）`);
	}

	//  単票
	validateSingleton(join(docsDir, "01-glossary.md"), "glossary", "GLOSSARY", true);
	//  概要へ移した文書（ADR-0076）
	//  名前を変えて残したものも、frontmatter の id で見つける
	for (const r of retiredDocsIn(docsDir)) err(r.file, `${r.why} の文書は置かない（ビジョン・アクター表・バックログ・GOAL.md は 1 枚の概要 ${OVERVIEW_FILE} にまとめた）。${MIGRATE_HINT}`);
	validateSingleton(join(docsDir, "verification", "GLOBAL.md"), "global", "VERIFICATION_GLOBAL", false);
	const deferredFile = join(docsDir, "verification", "DEFERRED.md");
	const deferred = validateSingleton(deferredFile, "deferred", "VERIFICATION_DEFERRED", false, DEFERRED_STATUS);
	if (deferred) validateDeferred(deferredFile);
	validateDesign(join(docsDir, "design.md"));

	return { goals, ucs, contracts, shared };
}

function crossChecks(model) {
	const { ucs, contracts } = model;
	//  契約カバレッジ: UC が active（＝実装に進んでよい）なのに契約が無い
	for (const [id, uc] of ucs) {
		if (uc.status === "active" && !contracts.has(id)) err(uc.file, `${id}: UC が active だが contract.yaml が無い（境界ゼロなら operations: {} + x-no-boundary で宣言する）`);
		if (uc.status === "draft" && uc.phase && uc.phase !== "定義") err(uc.file, `${id}: UC が draft なのに phase が ${uc.phase}（承認前に工程を進めない）`);
	}
	//  契約 ↔ UC（親 draft に fixed 契約は不可・異常系の相互整合）
	for (const [id, c] of contracts) {
		const uc = ucs.get(id);
		if (!uc) {
			err(c.file, `契約 "${id}" に対応する UC.md が無い`);
			continue;
		}
		if (c.status === "fixed" && uc.status === "draft") err(c.file, `親 UC が draft なのに契約が fixed（先に UC を active にする）: ${id}`);
		if (c.status === "fixed" && uc.reqs.some((r) => r.status === "draft"))
			err(c.file, `契約が fixed だが draft の REQ がある（${uc.reqs.filter((r) => r.status === "draft").map((r) => r.id).join(", ")}）— 要件が settle する前に契約を凍結しない（移行中は契約を draft に戻す。ADR-0056）`);
		if (uc.hasExceptionDerivation && c.errorCount === 0 && !c.legacy)
			warn(c.file, `${id}: UC の例外系の走査に導出があるが契約に errors が 1 件も無い`);
	}
}

//  --- 利用プロジェクトの作業指針（docs と同じ階層の CLAUDE.md / AGENTS.md。R-1010）---
//  地図だけを持つので行数で上限を掛ける
const HOST_GUIDE_MAX_LINES = 150;
function validateHostGuides(docsDir) {
	for (const name of ["CLAUDE.md", "AGENTS.md"]) {
		const file = join(dirname(docsDir), name);
		if (!existsSync(file)) continue;
		const text = readFileSync(file, "utf8").replace(/\r?\n$/, "");
		if (text.split(/\r?\n/).length > HOST_GUIDE_MAX_LINES)
			err(file, `作業指針が ${HOST_GUIDE_MAX_LINES} 行を超える — 構成・層の向き・命名規則・正本へのリンクだけを残し、写しと運用手順を正本へ移す（R-1010）`);
	}
}

function cmdValidate(docsDir, opts) {
	if (existsSync(join(docsDir, "specs"))) {
		if (!opts.ignoreLegacy) {
			console.error(
				`${COMMAND}: 旧レイアウト（${docsDir}/specs/F-xxx-<slug>/）を検出。` +
					`現行レイアウト（${docsDir}/goals/GOAL-nn/UC-nnn/）へ /docs-migrate で移行するか、移行までは旧タグ（v0.x）の harness を使う。` +
					`移行中に新レイアウト側だけを検査するなら --ignore-legacy-layout`,
			);
			return 1;
		}
		warn(join(docsDir, "specs"), `旧レイアウトが残っている（--ignore-legacy-layout で続行中）— 移行完了時に attic へ移す`);
	}
	if (existsSync(join(docsDir, "PRD.md"))) warn(join(docsDir, "PRD.md"), `旧レイアウトの PRD.md がある — 00-overview.md へ移す（/docs-migrate）`);
	//  仕様の木の根は、ほかの検査ツールと同じ決め方で決める（tools/_shared/spec-tree.mjs）。docs の隣の設定が docs.goals_dir を
	//  別の場所に宣言していれば、lint refs・lint entries と別の木を読むことになるので、設定の誤りにする
	const hostRoot = dirname(resolve(docsDir));
	const tree = goalsRootOf({ docsDir: resolve(docsDir), hostRoot, cfg: readHostConfig(hostRoot) });
	if (tree.error) {
		console.error(`${COMMAND}: ${tree.error}`);
		return 2;
	}
	//  概要の置き場も 1 つに固定する（設定の docs.overview は <docs>/00-overview.md か none だけ）
	const ovPath = overviewPathOf({ docsDir: resolve(docsDir), hostRoot, cfg: readHostConfig(hostRoot) });
	if (ovPath.error) {
		console.error(`${COMMAND}: ${ovPath.error}`);
		return 2;
	}
	//  docs の場所の書き損じで検証が黙って空回りしないよう、goals が無ければ設定エラー（ADR-0056）
	if (!existsSync(join(docsDir, "goals"))) {
		console.error(`${COMMAND}: ${docsDir}/goals が無い。--docs の指定を確かめるか、${docsDir}/goals/ を作る（空なら .gitkeep を置く）`);
		return 2;
	}
	const model = loadModel(docsDir);
	crossChecks(model);
	validateHostGuides(docsDir);
	return report(COMMAND);
}

const opts = parseArgs(COMMAND, process.argv.slice(2));
process.exit(cmdValidate(opts.docs, opts));
