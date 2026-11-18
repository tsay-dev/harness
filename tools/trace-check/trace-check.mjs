#!/usr/bin/env node
//
//  trace-check — トレーサビリティ検査（harness 同梱ツール。依存ゼロの Node）
//
//  目標状態: 「テストと本検査がすべて緑 ＝ docs と実装の辻褄が機械検査の範囲で合っている」。
//  被覆マトリクスは手書きせず、ここで生成する（--index で全体地図も生成。どちらもコミットしない）。
//
//  前提の構成（rules/develop/docs.md §10–11）:
//    docs/goals/<GOAL-nn-slug>/GOAL.md
//                             └ <UC-nnn-slug>/UC.md（REQ は「要件」の節の小節）+ contract.yaml（縦は互いに素）
//    docs/rules/BR-*.md  docs/nfr/NFR-*.md  docs/adr/ADR-*.md（横は中央）
//    所属の SSOT は frontmatter。パスは配置であり、両者の整合を C9 が検査する。
//    各 REQ の「## 検証方針」は分割クラス `#name` を宣言する（下限 C10 / 上限 C11）。
//
//  手で書く紐づきはテストの側だけ（ADR-0070）:
//    - 読む注釈は、テストの @covers（REQ#クラス、NFR、BR）とシナリオテストの @scenario だけ。
//      実装とスキーマのコードの注釈（@implements / @operation）は読まない。実装との対応は、実行の記録（exec-check coverage）と
//      入口の一覧の突き合わせ（exec-check entries）で確かめる。
//
//  紐づきに例外を作らない（ADR-0056）:
//    - baseline（既知の違反を通す台帳）とコードに書く例外の印は持たない。違反はすべて失敗にする。
//    - 紐づきの検査に要るキーは harness.config.json で省略できない。対象が無いなら { "none": "<理由>" } と宣言する。
//      none と、範囲・印の一致 0 件が通るのは、それを求める active な文書・fixed な契約が無い間だけ（義務表 C26）。
//    - 注釈（@covers / @scenario）はコメントの中にあるものだけを数え（comment_pattern）、
//      単位への帰属は窓で決める: before ＝ 単位の印の行と、直上に連続するコメント行 / after ＝ 単位の印の行と、次の行がコメントならその行。
//    - 撤回済み（withdrawn）の仕様を指す注釈・参照は「実在しない」と同じく違反。
//
//  検査項目（C5・C14・C19・C21・C23・C27 は欠番。実装の注釈を読む検査だったので廃止した。番号は詰めない）:
//    C1   active な REQ が、保留でないテストに被覆されているか
//    C2   すべての active な REQ に「## 検証方針」セクションがあるか
//    C3   テストの @covers が実在し撤回されていない REQ / BR を指しているか
//    C4   すべての BR がいずれかの UC / REQ から参照されているか（死んだ規則）
//    C6   レイヤの依存方向が内向きに保たれているか（harness.config.json の layering。紐づきではないので省略できる）
//    C7   実装のエラーコード ⊆ 契約語彙（docs.shared の errorCodes）か
//    C8   すべての active な GOAL が 1 件以上の UC から参照されているか
//    C9   パス整合: GOAL / UC ディレクトリ名と frontmatter id・goal の一致、ノード定義ファイルの存在、REQ のファイル名 = id、
//         REQ が自身の uc の直下にあること、goals 配下で検査の対象にならない文書（_shared 以外の _ ディレクトリ、id を持つ配置外の md）
//    C10  active な REQ の宣言された全分割クラスに、保留でないテストが 1 件以上あるか
//    C11  tests の全テスト（test_pattern）が窓に @covers を持ち（REQ の @covers は 1 つだけ）、宣言済みクラスを指しているか。どのテストにも属さない @covers も違反
//    C12  同一 ID が複数箇所で定義されていないか（採番衝突）
//    C13  enforced_at に database を含む active な BR に、保留でないテストの @covers BR-nnn があるか（制約が効くことをテストで確かめる）
//    C15  人間がアクターの active な UC に、保留でない @scenario UC-nnn のシナリオテスト（tests.system）があるか。
//         tests.system の全テストが窓に @scenario を持ち、未定義・撤回済みの UC を指さないか（ADR-0035）
//    C16  active な UC / REQ が参照する BR が定義されていて active か（C4 の逆方向）
//    C17  active な UC の「状態 × イベント表」「例外系の走査」に現れる REQ と、その UC に属する REQ が 1 対 1 に対応し、1 件以上あるか（R-404）
//    C18  active な GOAL の actor / origin と active な UC の actor が、docs.actors と docs.vision の表に定義されているか（ADR-0052）
//    C20  active な NFR が、保留でないテストの @covers NFR-nnn か measured_by（docs.* で宣言した文書の外のファイルで、中に ID が現れる）を持つか（ADR-0054）
//    C22  active な BR が、active な REQ の br: から参照されているか、保留でないテストから @covers BR-nnn されているか（規則を確かめるテストに辿れること）
//    C24  撤回されていない契約があるとき、共有語彙（docs.shared）の全エラーコードがどれかの契約の errors で使われているか（C7 の逆方向）
//    C25  active な UC / REQ の本文が使う用語集（docs.glossary）の用語のコード識別子が、ソース（とスキーマ）のコメント以外に存在するか
//    C26  宣言と義務の矛盾: 義務がある範囲の none、範囲・印の一致 0 件、active な UC があるときの固定パスの不在
//
//  使い方:
//    node trace-check.mjs [--root .] [--config harness.config.json] [--as-active]   検査（違反が 1 件でもあれば FAIL）
//                                                                      --as-active は draft の文書を active とみなす（spec-author の自己検査）
//    node trace-check.mjs --index                                      1 行 1 ID の索引を出力（生成物）
//    node trace-check.mjs --next <goal|uc|req|br|nfr|adr> [--reserve N]  次の空き ID を N 件（既定 1）出力し、同時に予約する（R-204）。
//                                                                      予約は .trace-reservations.json に mkdir ロックで原子的に記録するので
//                                                                      並行 Task が同時に呼んでも同じ番号は返らない。req は UC.md の表の ID も使用済み
//    node trace-check.mjs --only C9,C12                                指定の検査項目だけ判定（producer の自己検査用。部分検査と出力する）
//
//  終了コード: 0 = 違反なし / 1 = 違反あり / 2 = 使い方・設定エラー
//

import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { parseFrontmatter } from "../_shared/frontmatter.mjs";
import { inScope, isGlob } from "../_shared/glob.mjs";
import { isMap, parseStrictYaml } from "../_shared/strict-yaml.mjs";
import { reqDocsOf, splitUc } from "../_shared/reqs.mjs";
import { goalsRootOf, specDirs } from "../_shared/spec-tree.mjs";
import { CONFIG_FILE, renamedConfigHint, retiredKeysIn } from "../_shared/config.mjs";

const CLASS_DECL_RE = /^\s*-\s*`#([\w-]+)`/gm;
const GOAL_DIR_RE = /^(GOAL-\d+)/;
const UC_DIR_RE = /^(UC-\d+)/;
const ID_KIND_RE = /^(GOAL|UC|REQ|BR|NFR|ADR)-\d+$/;
const POLICY_HEADING = "## 検証方針";
//  実装の注釈（@implements / @operation）を読んでいた検査は廃止した（ADR-0070）。番号は詰めない（過去の記録の番号と食い違わせない）
const RETIRED_CHECKS = ["C5", "C14", "C19", "C21", "C23", "C27"];
const CHECK_IDS = Array.from({ length: 27 }, (_, i) => `C${i + 1}`).filter((id) => !RETIRED_CHECKS.includes(id));

//  設定の誤りは違反ではなく使い方の誤り（exit 2）。検査の途中で見つかったものもここへ投げる
class ConfigError extends Error {}
const configError = (msg) => {
	throw new ConfigError(msg);
};

//  ---- ファイル入出力 -----------------------------------------------------------

const read = (p) => readFileSync(p, "utf8");

//  frontmatter は tools/_shared/frontmatter.mjs が唯一の読み方（spec-lint / gate-hook と同じ。曖昧な書き方は spec-lint が違反にする）
const frontmatter = (path) => parseFrontmatter(read(path)).data;
//  UC・REQ の文面。UC は「要件」の節を除いた UC 自身の部分、REQ は自分の小節だけ（同じ UC.md に書かれた別の REQ の文面を混ぜない）
const textOf = (doc) => doc.text ?? read(doc.file);

function listFiles(dir, pred) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((d) => d.isFile() && pred(d.name))
		.map((d) => join(dir, d.name))
		.sort();
}

//  exts が null なら拡張子で絞らない。node_modules と .git の中は見ない（ドットで始まるディレクトリは見る。
//  隠した置き場の単位が走査から漏れて紐づき無しのまま通らないように）。壊れたシンボリックリンクと、
//  ディレクトリを指すシンボリックリンク（循環しうる）は辿らない
function walk(dir, exts, top = true) {
	const out = [];
	let st;
	try {
		st = top ? statSync(dir) : lstatSync(dir);
		if (st.isSymbolicLink()) st = statSync(dir);
		if (!top && st.isDirectory() && lstatSync(dir).isSymbolicLink()) return out;
	} catch {
		return out;
	}
	if (!st.isDirectory()) return !exts || exts.some((e) => dir.endsWith(e)) ? [dir] : [];
	for (const d of readdirSync(dir)) {
		if (d === "node_modules" || d === ".git") continue;
		out.push(...walk(join(dir, d), exts, false));
	}
	return out.sort();
}

//  パスか glob の配列（`!` で除外。ファイルも可）が指すファイル。走査は各パターンの glob より前の固定部分から始める
function scopeFiles(cfg, patterns, exts) {
	const bases = new Set();
	for (const pat of patterns || []) {
		if (pat.startsWith("!")) continue;
		const fixed = [];
		for (const seg of pat.replace(/\/+$/, "").split("/")) {
			if (isGlob(seg)) break;
			fixed.push(seg);
		}
		bases.add(fixed.join("/") || ".");
	}
	const out = new Set();
	for (const b of bases) for (const f of walk(join(cfg._root, b), exts)) if (inScope(rel(cfg, f), patterns)) out.add(f);
	return [...out].sort();
}

//  ---- 設定 -------------------------------------------------------------------

function loadConfig(root, configPath) {
	if (!existsSync(configPath)) {
		console.error(`trace-check: 設定が無い: ${configPath}（テンプレート templates/develop/harness.config.json を host 直下に置く）${renamedConfigHint(configPath)}`);
		process.exit(2);
	}
	let cfg;
	try {
		cfg = JSON.parse(read(configPath));
	} catch (e) {
		console.error(`trace-check: ${configPath} が JSON として読めない: ${e.message}`);
		process.exit(2);
	}
	if (!isMap(cfg)) {
		console.error(`trace-check: ${configPath} の最上位はオブジェクトにする`);
		process.exit(2);
	}
	cfg._root = root;
	return cfg;
}

const p = (cfg, keyPath) => join(cfg._root, lookup(cfg, keyPath));
const rel = (cfg, path) => relative(cfg._root, path).split("\\").join("/");

//  紐づきの検査に要る宣言（ADR-0056）。省略は設定エラーで、対象が無いなら { "none": "<理由>" } と宣言する。
//  省略と不在を区別するのは、契約の auth: none / operations: {} と同じ（黙って検査を省かない）
const isNone = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && "none" in v;
const declared = (v) => (v === undefined || isNone(v) ? null : v);
const lookup = (cfg, keyPath) => keyPath.split(".").reduce((n, k) => (n === undefined || n === null || isNone(n) ? undefined : n[k]), cfg);
const DOC_PATHS = ["docs.goals_dir", "docs.rules_dir", "docs.nfr_dir", "docs.adr_dir"];
const PLACEMENTS = ["before", "after"];

//  正規表現はすべて u フラグでコンパイルする（日本語の名前は [\p{L}\p{N}_] で書ける）。失敗はキー名付きの設定エラー
const DEFAULT_COMMENT_PATTERN = "^\\s*(?:\\/\\/|\\/\\*|\\*|#|--|@|<!--)";
const DEFAULTS = {
	scenario_pattern: "@scenario\\s+(UC-\\d{3})(?!\\d)",
	nfr_pattern: "@covers\\s+(NFR-\\d{3})(?!\\d)",
	br_pattern: "@covers\\s+(BR-\\d{3})(?!\\d)",
};
function compile(key, src, flags = "") {
	if (typeof src !== "string" || !src) configError(`${key} は正規表現の文字列にする（実際: ${JSON.stringify(src)}）`);
	try {
		return new RegExp(src, flags + "u");
	} catch (e) {
		configError(`${key} の正規表現をコンパイルできない（u フラグ）: ${e.message}`);
	}
}
const groupCount = (re) => new RegExp(`${re.source}|`, re.flags.replace(/[gy]/g, "")).exec("").length - 1;

//  宣言を検査して { errors, absent: [[キー, 理由]] } を返す。親が none なら子は問わない。
//  型も検査する（文字列のはずのキーにオブジェクトを書くと "[object Object]" のパスを黙って探すことになる）
function checkDeclarations(cfg) {
	const errors = [];
	const absent = [];
	const kindOk = {
		path: (v) => typeof v === "string" && v.trim() !== "",
		paths: (v) => Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim() !== ""),
		regex: (v) => typeof v === "string" && v !== "",
		section: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
	};
	const kindName = { path: "パスの文字列", paths: "パスか glob の文字列の配列", regex: "正規表現の文字列", section: "オブジェクト" };
	const need = (keyPath, kind, { allowNone = true, optional = false, flags = "" } = {}) => {
		const v = lookup(cfg, keyPath);
		if (v === undefined) {
			if (!optional) errors.push(`${keyPath} が宣言されていない（対象が無いなら { "none": "<理由>" } と書く）`);
			return null;
		}
		if (isNone(v)) {
			if (!allowNone) errors.push(`${keyPath} は none にできない`);
			else if (typeof v.none !== "string" || !v.none.trim() || Object.keys(v).length !== 1)
				errors.push(`${keyPath}: none は理由の文字列だけを持つ（{ "none": "<理由>" }）`);
			else absent.push([keyPath, v.none.trim()]);
			return null;
		}
		if (!kindOk[kind](v)) {
			errors.push(`${keyPath} は${kindName[kind]}にする（実際: ${JSON.stringify(v)}）`);
			return null;
		}
		if (kind === "regex")
			try {
				compile(keyPath, v, flags);
			} catch (e) {
				errors.push(e.message);
				return null;
			}
		return v;
	};
	const capture = (keyPath, n = 1) => {
		const v = lookup(cfg, keyPath);
		if (typeof v === "string" && !isNone(v)) {
			try {
				if (groupCount(compile(keyPath, v)) < n) errors.push(`${keyPath} には捕捉グループ ( ) が ${n} つ要る（指す ID や単位の名前を捕捉で取り出す）`);
			} catch {}
		}
	};
	const placement = (keyPath) => {
		const v = lookup(cfg, keyPath);
		if (v !== undefined && !PLACEMENTS.includes(v)) errors.push(`${keyPath} は ${PLACEMENTS.join(" | ")}（実際: ${JSON.stringify(v)}）`);
	};

	for (const k of DOC_PATHS) need(k, "path", { allowNone: false });
	for (const k of ["docs.actors", "docs.vision", "docs.glossary", "docs.shared"]) need(k, "path");
	need("covers_pattern", "regex", { allowNone: false });
	need("id_patterns.br", "regex", { allowNone: false });
	need("id_patterns.req", "regex", { allowNone: false });
	for (const k of Object.keys(DEFAULTS)) need(k, "regex", { allowNone: false, optional: true });
	need("comment_pattern", "regex", { allowNone: false, optional: true });
	capture("covers_pattern");
	capture("scenario_pattern");
	capture("nfr_pattern");
	capture("br_pattern");

	if (need("contract", "section")) {
		need("contract.error_source", "path", { allowNone: false });
		need("contract.error_code_pattern", "regex", { allowNone: false });
		capture("contract.error_code_pattern");
	}
	if (need("source", "section")) {
		need("source.dirs", "paths", { allowNone: false });
		need("source.extensions", "paths", { allowNone: false });
		need("source.comment_pattern", "regex", { allowNone: false, optional: true });
	}
	if (need("tests", "section")) {
		need("tests.dirs", "paths", { allowNone: false });
		need("tests.extensions", "paths", { allowNone: false });
		need("tests.test_pattern", "regex", { allowNone: false });
		need("tests.pending_pattern", "regex");
		need("tests.comment_pattern", "regex", { allowNone: false, optional: true });
		capture("tests.test_pattern");
		placement("tests.covers_placement");
		if (need("tests.system", "section")) {
			need("tests.system.dirs", "paths", { allowNone: false });
			need("tests.system.extensions", "paths", { allowNone: false });
			need("tests.system.test_pattern", "regex", { allowNone: false });
			need("tests.system.pending_pattern", "regex");
			need("tests.system.comment_pattern", "regex", { allowNone: false, optional: true });
			capture("tests.system.test_pattern");
			placement("tests.system.scenario_placement");
		}
	}
	if (need("schema", "section")) {
		const files = need("schema.files", "paths", { allowNone: false, optional: true });
		const dirs = need("schema.dirs", "paths", { allowNone: false, optional: true });
		if (!files && !dirs && lookup(cfg, "schema.files") === undefined && lookup(cfg, "schema.dirs") === undefined)
			errors.push("schema には files か dirs が要る（スキーマ源の場所）");
		need("schema.extensions", "paths", { allowNone: false, optional: true });
		need("schema.comment_pattern", "regex", { allowNone: false, optional: true });
	}
	//  layering は紐づきではないので省略できるが、書くなら型を揃える（文字列を配列として回すと黙って通る）
	if (cfg.layering !== undefined) {
		const lay = cfg.layering;
		if (!isMap(lay) || !kindOk.path(lay.root) || !isMap(lay.forbidden) || !Object.values(lay.forbidden).every(kindOk.paths) || !kindOk.paths(lay.import_patterns))
			errors.push("layering は { root: 文字列, forbidden: { 層: [層, …] }, import_patterns: [正規表現, …] } にする");
		else if (lay.layer_pattern !== undefined && !kindOk.path(lay.layer_pattern)) errors.push("layering.layer_pattern は文字列にする");
	}
	//  廃止した例外の経路（ADR-0055 / ADR-0056）。残っていれば移行を促して止める
	for (const [keyPath, hint] of [
		["tests.exempt_pattern", "仕様を持たないテストは tests.dirs の外に置く（ADR-0055）"],
		["tests.system.exempt_pattern", "仕様を持たないテストは tests.system.dirs の外に置く（ADR-0055）"],
		["source.exempt_pattern", "実装のコードには例外の印も紐づきの注釈も書かない（ADR-0056 / ADR-0070）"],
		["contract.exclude_codes", "契約に無いエラーコードは contract.error_code_pattern に一致させない（ADR-0056）"],
		["source.entry_files", "入口は commands.list_entries の一覧と契約の突き合わせ（lint entries）で確かめる（ADR-0070）"],
	])
		if (lookup(cfg, keyPath) !== undefined) errors.push(`${keyPath} は廃止した。${hint}。キーを削除する`);
	//  実装の注釈を読むためのキー（ADR-0070）。残っていれば、まだ検査されていると誤解させるので止める
	for (const [keyPath, hint] of retiredKeysIn(cfg)) errors.push(`${keyPath} は廃止した（ADR-0070）。${hint}。キーを削除する`);
	//  monorepo のルートは紐づきを宣言しない（unit ごとに docs と harness.config.json を持つ）
	if (errors.length && isMap(cfg.git?.units) && Object.keys(cfg.git.units).length)
		errors.unshift(`git.units がある monorepo のルートでは、unit ごとに --root <unit のディレクトリ> で実行する（${Object.values(cfg.git.units).join(", ")}）`);
	return { errors, absent };
}

//  --as-active は draft を active とみなす（spec-author が承認前に、active になったときの違反を先に見る）
const statusOf = (s, asActive) => {
	const v = s || "active";
	return asActive && v === "draft" ? "active" : v;
};

//  ---- 1 ID 1 ファイルの定義（横の ID 空間） ---------------------------------------

function loadDocs(dir, asActive) {
	const result = {}; //  id -> { status, fm, file }
	for (const f of walk(dir, [".md"])) {
		const fm = frontmatter(f);
		if (fm.id) result[fm.id] = { status: statusOf(fm.status, asActive), fm, file: f };
	}
	return result;
}

//  ---- ゴール集約ディレクトリの走査（縦の木） ---------------------------------------

class Corpus {
	constructor(cfg, asActive = false) {
		this.goals = {}; //  id -> { status, actor, origin, dir }
		this.ucs = {}; //  id -> { goal, actor, status, phase, dir, goalDir, file }
		this.reqs = {}; //  id -> { uc, status, dir, goalDir, file, hasPolicy, classes, br }
		this.pathViolations = [];
		//  根の決め方は tools/_shared/spec-tree.mjs（ほかの検査ツールと同じ）
		const goalsDir = goalsRootOf({ hostRoot: cfg._root, cfg }).root;
		const r = (x) => rel(cfg, x);
		const known = new Set();

		//  フォルダの数え方は tools/_shared/spec-tree.mjs（. で始まるフォルダと _shared は木の外。ほかの検査ツールと同じ）
		const stray = (dir) => this.pathViolations.push(`${r(dir)}: _shared 以外の _ ディレクトリは検査の対象にならない（GOAL-nn-<slug>・UC-nnn-<slug> にするか、goals の外へ移す）`);
		const tree = specDirs(goalsDir);
		tree.stray.forEach(stray);
		for (const gdir of tree.dirs) {
			const name = basename(gdir);
			const m = name.match(GOAL_DIR_RE);
			const dirGoal = m ? m[1] : null;
			const gfile = join(gdir, "GOAL.md");
			if (!m || !existsSync(gfile)) {
				this.pathViolations.push(`${r(gdir)}: GOAL-nn で始まる名前と直下の GOAL.md が必要`);
				continue;
			}
			known.add(gfile);
			const gfm = frontmatter(gfile);
			if (gfm.id !== dirGoal)
				this.pathViolations.push(`${r(gfile)}: frontmatter id (${gfm.id}) がディレクトリ名 (${dirGoal}) と一致しない`);
			this.goals[gfm.id || dirGoal] = { status: statusOf(gfm.status, asActive), actor: gfm.actor || "", origin: gfm.origin || "", dir: gdir };

			//  旧形式（ゴール直下の UC-*.md / REQ-*.md）は配置違反
			for (const f of listFiles(gdir, (n) => /^(UC|REQ)-\d+.*\.md$/.test(n))) {
				known.add(f);
				this.pathViolations.push(`${r(f)}: UC / REQ はゴール直下ではなく UC ディレクトリ配下に置く`);
			}

			const ucTree = specDirs(gdir);
			ucTree.stray.forEach(stray);
			for (const udir of ucTree.dirs) {
				const um = basename(udir).match(UC_DIR_RE);
				const dirUc = um ? um[1] : null;
				const ufile = join(udir, "UC.md");
				if (!um || !existsSync(ufile)) {
					this.pathViolations.push(`${r(udir)}: UC-nnn で始まる名前と直下の UC.md が必要`);
					continue;
				}
				known.add(ufile);
				const ufm = frontmatter(ufile);
				if (ufm.id !== dirUc)
					this.pathViolations.push(`${r(ufile)}: frontmatter id (${ufm.id}) がディレクトリ名 (${dirUc}) と一致しない`);
				if (ufm.goal !== dirGoal)
					this.pathViolations.push(`${r(ufile)}: goal (${ufm.goal}) が配置ディレクトリ (${dirGoal}) と一致しない`);
				const uid = ufm.id || dirUc;
				this.ucs[uid] = { goal: ufm.goal, actor: ufm.actor || "", status: statusOf(ufm.status, asActive), phase: ufm.phase || "", dir: udir, goalDir: gdir, file: ufile };

				//  REQ は UC.md の「要件」の節の小節（ADR-0067。読み方は tools/_shared/reqs.mjs）
				const parts = reqDocsOf(ufile, read(ufile), uid);
				this.ucs[uid].text = parts.ucText;
				for (const p of parts.problems) this.pathViolations.push(`${r(ufile)}:${p.line}: ${p.msg}`);
				for (const d of parts.docs) {
					const fm = parseFrontmatter(d.text).data;
					const text = d.text;
					const idx = text.indexOf(POLICY_HEADING);
					const classes = idx >= 0 ? [...text.slice(idx).matchAll(CLASS_DECL_RE)].map((x) => x[1]) : [];
					if (this.reqs[d.id]) this.pathViolations.push(`${r(ufile)}: ${d.id} が ${r(this.reqs[d.id].file)} にもある（REQ の ID はプロジェクトで 1 つ）`);
					this.reqs[d.id] = { uc: fm.uc, status: statusOf(fm.status, asActive), dir: udir, goalDir: gdir, file: ufile, text, hasPolicy: idx >= 0, classes, br: fm.br || "" };
				}
				for (const f of listFiles(udir, (n) => /^REQ-\d+\.md$/.test(n))) {
					known.add(f);
					this.pathViolations.push(`${r(f)}: REQ は UC.md の「要件」の節に小節として書く（ADR-0067）。harness migrate reqs --write で移す`);
				}
			}
		}
		//  REQ の uc が、自身の配置ディレクトリの UC を指しているか
		for (const [rid, rq] of Object.entries(this.reqs)) {
			const uc = this.ucs[rq.uc || ""];
			if (!uc) this.pathViolations.push(`${rid}: uc (${rq.uc}) が未定義`);
			else if (uc.dir !== rq.dir)
				this.pathViolations.push(`${rid}: uc (${rq.uc}) は ${basename(uc.dir)}/ 配下だが、REQ は ${basename(rq.dir)}/ に配置されている`);
		}
		//  id を持つのに上の配置に当てはまらない文書（REQ-002-extra.md、_drafts/ や _shared/ の下の文書など）は、どの検査にも数えられない
		for (const f of walk(goalsDir, [".md"])) {
			if (known.has(f)) continue;
			const id = frontmatter(f).id;
			if (id)
				this.pathViolations.push(`${r(f)}: id (${id}) を持つが GOAL.md / UC.md の配置に無いので検査の対象にならない（ファイル名か置き場を直す）`);
		}
	}
}

//  ---- 定義レジストリ（重複検出と採番） ---------------------------------------------

function collectDefinitions(cfg) {
	const registry = {}; //  id -> [file]
	for (const key of ["docs.goals_dir", "docs.rules_dir", "docs.nfr_dir", "docs.adr_dir"]) {
		const base = p(cfg, key);
		for (const f of walk(base, [".md"])) {
			const fm = frontmatter(f);
			if (fm.id && ID_KIND_RE.test(fm.id)) (registry[fm.id] ||= []).push(f);
			//  REQ は UC.md の「要件」の節の小節（ADR-0067）。同じ ID の小節が、別の UC.md や同じ UC.md に 2 つあれば重複
			if (key === "docs.goals_dir" && basename(f) === "UC.md") for (const r of splitUc(read(f)).reqs) (registry[r.id] ||= []).push(f);
		}
	}
	return registry;
}

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
				console.error(`trace-check: 採番ロックが取れない（${lock} が残っている。他の trace-check が動いていなければ削除する）`);
				process.exit(2);
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
	//  backlog の ### 見出し定義も採番対象（R-203 の例外）
	const backlog = typeof lookup(cfg, "docs.goals_backlog") === "string" ? p(cfg, "docs.goals_backlog") : null;
	if (kind === "goal" && backlog && existsSync(backlog))
		for (const x of read(backlog).matchAll(/^###\s+GOAL-(\d+)/gm)) nums.add(Number(x[1]));
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

//  ---- 注釈の判定と単位の走査 ---------------------------------------------------
//
//  注釈はコメントの中にあるものだけを数える（文字列リテラルの中の "@covers REQ-001#x" で紐づいて見えないように）:
//    comment_pattern に一致する行にある注釈か、同じ行で注釈より前にコメント開始記号（// /* # -- <!--）がある注釈（行末コメント）。
//  comment_pattern はセクション > 最上位 > 既定の順に決まる。既定は多言語の和集合なので、# / @ で始まる行は
//  窓をつなぐ（デコレーター、属性）が、その行の注釈は注釈より前に // /* -- <!-- があるときだけ数える
//  （TS の #private = "…" やデコレーターの文字列引数の中を数えない）。# を行コメントにする言語は comment_pattern を上書きする。
const HASH_HINT = "（既定の comment_pattern では # / @ で始まる行の注釈を数えない。ブロックコメントの中なら行頭に * を付け、# を行コメントにする言語なら comment_pattern を上書きする）";

//  文字列リテラル（" ' `）の外にある最初のコメント開始記号の位置（無ければ -1）。# と -- は行頭か空白の直後だけ
//  （this.#x や i-- をコメントと読まない）
function commentStart(line, openers, from = 0) {
	let q = null;
	for (let i = from; i < line.length; i++) {
		const c = line[i];
		if (q) {
			if (c === "\\") i++;
			else if (c === q) q = null;
			continue;
		}
		if (c === '"' || c === "'" || c === "`") {
			q = c;
			continue;
		}
		for (const o of openers)
			if (line.startsWith(o, i) && (!(o === "#" || o === "--") || i === 0 || /\s/.test(line[i - 1]))) return i;
	}
	return -1;
}

function commentJudge(cfg, sec, label) {
	const explicit = sec?.comment_pattern ?? cfg.comment_pattern;
	const re = compile(sec?.comment_pattern !== undefined ? `${label}.comment_pattern` : "comment_pattern", explicit ?? DEFAULT_COMMENT_PATTERN);
	const strict = explicit === undefined;
	const opened = (line, idx, openers, from) => {
		const at = commentStart(line, openers, from);
		return at >= 0 && at < idx;
	};
	return {
		isCommentLine: (line) => re.test(line),
		//  コメント以外の行（C25 の語）。既定では # / @ で始まる行はコードとして残す
		isCodeLine: (line) => !re.test(line) || (strict && /^\s*[#@]/.test(line)),
		//  idx の位置の注釈を数えるか。hash は既定の規則で数えなかったこと（メッセージで上書きを案内する）
		counts(line, idx) {
			const lead = line.match(/^\s*[#@]/);
			if (strict && lead) {
				const ok = opened(line, idx, ["//", "/*", "--", "<!--"], lead[0].length);
				return { ok, hash: !ok };
			}
			return { ok: re.test(line) || opened(line, idx, ["//", "/*", "#", "--", "<!--"], 0), hash: false };
		},
	};
}

//  単位（テスト、シナリオテスト）と窓。単位の印の最初の捕捉が名前。
//    before ＝ 単位の印の行と、直上に連続するコメント行（空行・コード行・別の単位の印で切れる）→ doc コメントの流儀
//    after  ＝ 単位の印の行と、次の行がコメント行ならその行 → 本体 1 行目の流儀
//  窓を広く取ると、別の単位の本体に書いた注釈がこの単位の紐づきに数えられ、紐づかない単位が紐づいて見える
//  改行した呼び出しの頭（行末が "("）は、続く行を関数の本体が始まる行（=> / function / 行末の {）まで、最大 JOIN_MAX 行つなげてから印を当てる
//  （Prettier がオプションの引数で折り返したテスト。つなげないと黙って単位から漏れる）
const JOIN_MAX = 6;
function headOf(lines, i) {
	if (!/\(\s*$/.test(lines[i])) return null;
	let text = lines[i].replace(/\s+$/, "");
	let end = i;
	for (let j = i + 1; j < lines.length && j <= i + JOIN_MAX; j++) {
		text += " " + lines[j].trim();
		end = j;
		if (/=>|\bfunction\b|\{\s*$/.test(lines[j])) break;
	}
	return { text, end };
}

function unitsOf(lines, unitRe, placement, judge) {
	const units = [];
	lines.forEach((line, i) => {
		const head = headOf(lines, i);
		const joined = head ? unitRe.exec(head.text) : null;
		const t = joined || unitRe.exec(line);
		if (t) {
			const name = t.slice(1).find((x) => x);
			units.push({ line: i, end: joined ? head.end : i, joined: joined ? head.text : null, name: name ?? `line ${i + 1}`, capture: name ?? "", window: [i] });
		}
	});
	const unitLines = new Set(units.map((u) => u.line));
	const owner = new Map(); //  行 -> 単位の添字
	units.forEach((u, idx) => {
		owner.set(u.line, idx);
		const take = (j) => {
			owner.set(j, idx);
			u.window.push(j);
		};
		for (let j = u.line + 1; j <= u.end && !unitLines.has(j); j++) take(j); //  つなげた行は単位の一部
		if (placement === "before") for (let j = u.line - 1; j >= 0 && !unitLines.has(j) && lines[j].trim() && judge.isCommentLine(lines[j]); j--) take(j);
		else if (u.end + 1 < lines.length && !unitLines.has(u.end + 1) && judge.isCommentLine(lines[u.end + 1])) take(u.end + 1);
	});
	return { units, owner };
}

//  1 行の注釈（re は g フラグ）: [{ m, ok, hash }]
const annotationsIn = (line, re, judge) => [...line.matchAll(re)].map((m) => ({ m, ...judge.counts(line, m.index) }));

//  テスト（tests / tests.system）の走査: 単位ごとの注釈と保留、どのテストにも属さない注釈。
//  保留（pending_pattern）は、単位の印の行か窓に一致すればその単位、それ以外の行（describe.skip、本体の XCTSkip、
//  Maestro のヘッダーの tag など）に一致すればファイルの全テストとみなす（保守的）。保留のテストは被覆に数えない
function scanTests(cfg, sec, label, files, placementKey, kinds) {
	const judge = commentJudge(cfg, sec, label);
	const unitRe = compile(`${label}.test_pattern`, sec.test_pattern);
	const pendingRe = declared(sec.pending_pattern) ? compile(`${label}.pending_pattern`, sec.pending_pattern) : null;
	const placement = sec[placementKey] || "before";
	const out = { units: [], orphans: Object.fromEntries(Object.keys(kinds).map((k) => [k, []])), placement, files: files.length };
	for (const path of files) {
		const lines = read(path).split(/\r?\n/);
		const where = (i) => `${rel(cfg, path)}:${i + 1}`;
		const { units, owner } = unitsOf(lines, unitRe, placement, judge);
		let filePending = null;
		if (pendingRe)
			lines.forEach((line, i) => {
				if (!pendingRe.test(line)) return;
				if (owner.has(i)) units[owner.get(i)].pending ??= where(i);
				else filePending ??= where(i);
			});
		for (const u of units) {
			if (pendingRe && u.joined && pendingRe.test(u.joined)) u.pending ??= where(u.line);
			u.where = where(u.line);
			u.ann = Object.fromEntries(Object.keys(kinds).map((k) => [k, []]));
			if (filePending) {
				u.pending ??= filePending;
				u.filePending = filePending;
			}
		}
		lines.forEach((line, i) => {
			for (const [k, re] of Object.entries(kinds))
				for (const a of annotationsIn(line, re, judge)) {
					if (!a.ok) {
						if (a.hash && owner.has(i)) units[owner.get(i)].hash = true;
						continue;
					}
					if (owner.has(i)) units[owner.get(i)].ann[k].push({ m: a.m, where: where(i) });
					else out.orphans[k].push(`${where(i)} "${a.m[0]}"`);
				}
		});
		out.units.push(...units);
	}
	return out;
}

//  保留の説明（被覆が保留のテストにしか無いとき、直し方を添える）
const pendingHint = (units) => {
	const filePending = [...new Set(units.map((u) => u.filePending).filter(Boolean))];
	return (
		`保留のテスト（pending_pattern に一致: ${units.map((u) => u.pending).join(", ")}）しか無い。skip を外す` +
		(filePending.length ? `か、テスト単位の外の保留（${filePending.join(", ")}）でファイル全体が保留になっているのでファイルを分ける` : "")
	);
};

function iterFiles(cfg, section) {
	const sec = declared(lookup(cfg, section));
	if (!sec) return [];
	return scopeFiles(cfg, sec.dirs, sec.extensions);
}

//  スキーマ源（migration / schema.prisma / モデル定義）。R-102 で DB 設計の SSOT は native 形式にあり、docs には無い。
//  読むのは用語集のコード識別子を探すとき（C25）だけで、制約と規則の対応は読まない（DB で守る規則はテストで確かめる。C13）
function schemaFiles(cfg) {
	const s = declared(cfg.schema);
	if (!s) return null;
	return scopeFiles(cfg, [...(s.files || []), ...(s.dirs || [])], s.extensions || [".sql", ".prisma"]);
}

//  ---- docs の表 -----------------------------------------------------------------

//  docs.actors の表から ACT-nn -> 種別 を読む。人間でないと数えるのは 種別 が「システム」で始まるものだけ
//  （語彙は 02-actors.md のテンプレートで閉じ、spec-lint が検査する）。表に無い actor は人間とみなす（要求を外す根拠が無い）
function actorKinds(cfg) {
	const kinds = {};
	const file = declared(cfg.docs?.actors) ? join(cfg._root, cfg.docs.actors) : null;
	if (!file || !existsSync(file)) return kinds;
	for (const line of read(file).split(/\r?\n/)) {
		const cells = line.split("|").map((c) => c.trim());
		if (cells.length < 4 || !/^ACT-\d+$/.test(cells[1])) continue;
		kinds[cells[1]] = cells[3];
	}
	return kinds;
}
const isHumanActor = (kinds, actor) => !(actor in kinds) || !kinds[actor].startsWith("システム");

//  docs.vision の「成功の定義」表から KPI-nn を読む（先頭セルが KPI-nn で始まる行）
function visionKpis(cfg) {
	const file = join(cfg._root, cfg.docs.vision);
	const kpis = new Set();
	if (existsSync(file)) for (const m of read(file).matchAll(/^\|\s*(KPI-\d+)\b/gm)) kpis.add(m[1]);
	return kpis;
}

//  文書の本文が参照する ID。HTML コメントは案内文なので除く。番号が 0 だけの ID はテンプレートのプレースホルダーで、
//  残っていれば spec-lint が報告するのでここでは数えない
const isPlaceholder = (id) => /-0+$/.test(id);
const stripHtmlComments = (text) => text.replace(/<!--[\s\S]*?-->/g, "");
const idsIn = (text, re) => [...new Set([...stripHtmlComments(text).matchAll(re)].map((m) => m[0]))].filter((id) => !isPlaceholder(id)).sort();
const referencedIds = (doc, re) => idsIn(textOf(doc), re);

//  UC の表の節（状態 × イベント表、例外系の走査）だけを返す。他の節（主シナリオなど）の REQ ID は表のセルではない
//  節の見つけ方は spec-lint と同じ（見出しが「状態」「例外系」で始まる ## 節）
function tableSections(text) {
	const out = [];
	let on = false;
	for (const line of text.split(/\r?\n/)) {
		const h = line.match(/^##\s+(.*)$/);
		if (h) on = h[1].startsWith("状態") || h[1].startsWith("例外系");
		else if (on) out.push(line);
	}
	return out.join("\n");
}

//  enforced_at が DB を指す書き方。英字は語として（"dbms" や "adb" は数えない）、日本語と全角は含まれていれば数える
const DB_ENFORCED_RE = /\b(?:database|db)\b|データベース|ＤＢ|ｄｂ/i;

//  layer_pattern（既定 "{layer}" ＝ root 直下の第 1 階層）で、パスのどの階層が層名かを決める。
//  "*/{layer}" なら Features/<機能>/Domain のような第 2 階層の層を読む（* は任意の 1 階層）
function layerOf(parts, pattern) {
	const segs = pattern.split("/").filter(Boolean);
	if (parts.length <= segs.length) return null;
	let layer = null;
	for (let i = 0; i < segs.length; i++) {
		if (segs[i] === "{layer}") layer = parts[i];
		else if (segs[i] !== "*" && segs[i] !== parts[i]) return null;
	}
	return layer;
}

function checkLayering(cfg) {
	const lay = cfg.layering;
	if (!lay || !declared(cfg.source)) return [];
	const root = join(cfg._root, lay.root);
	const violations = [];
	for (const path of walk(root, cfg.source.extensions)) {
		const parts = relative(root, path).split(/[\\/]/);
		const layer = layerOf(parts, lay.layer_pattern || "{layer}");
		if (!layer || !(layer in lay.forbidden)) continue;
		const text = read(path);
		for (const forbidden of lay.forbidden[layer]) {
			const pats = lay.import_patterns.map((t) => compile("layering.import_patterns", t.split("{layer}").join(forbidden), "m"));
			if (pats.some((re) => re.test(text))) violations.push(`${rel(cfg, path)}: ${layer} 層が ${forbidden} 層へ依存`);
		}
	}
	return violations;
}

//  契約語彙（docs.shared の errorCodes のキー）。読み方は tools/_shared/strict-yaml.mjs（spec-lint / contract-run と同じ）。
//  docs.shared が none か、ファイルが無ければ空の語彙（ファイルの不在は C26 が扱う）
function sharedErrorCodes(cfg) {
	if (!declared(cfg.docs.shared)) return new Set();
	const file = p(cfg, "docs.shared");
	if (!existsSync(file)) return null;
	const { root } = parseStrictYaml(read(file));
	return new Set(isMap(root.errorCodes) ? Object.keys(root.errorCodes) : []);
}

//  UC ごとの契約（contract.yaml）。読み方は tools/_shared/strict-yaml.mjs。構文の誤りは spec-lint が報告し、ここは読めた分だけ使う
function readContracts(corpus) {
	const out = []; //  { uc, ucStatus, status, file, ops: [{ name, transport, direction, owned, path, codes }], codes }
	for (const [uc, u] of Object.entries(corpus.ucs).sort()) {
		const file = join(u.dir, "contract.yaml");
		if (!existsSync(file)) continue;
		const { root } = parseStrictYaml(read(file));
		const ops = isMap(root.operations)
			? Object.entries(root.operations).map(([name, op]) => ({
					name,
					transport: op?.transport,
					direction: op?.direction,
					owned: op?.owned === true,
					path: isMap(op?.wire) && typeof op.wire.path === "string" ? op.wire.path : null,
					codes: Array.isArray(op?.errors) ? op.errors.map((e) => (isMap(e) ? e.code : null)).filter((c) => typeof c === "string") : [],
				}))
			: [];
		out.push({ uc, ucStatus: u.status, status: root["x-status"] || "draft", file, ops, codes: ops.flatMap((o) => o.codes) });
	}
	return out;
}

//  docs.glossary の「コード識別子」列: [{ term, idents }]。装飾（** ` リンク）は剥がし、セル全体が <…> のプレースホルダーの行は数えない。
//  識別子のセルは , 、 / で区切り、A.B は A と B に分ける。識別子の形でない語は数えない。ファイルが無ければ null
function glossaryEntries(cfg) {
	const file = p(cfg, "docs.glossary");
	if (!existsSync(file) || !statSync(file).isFile()) return null;
	const clean = (s) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\*\*|__|`/g, "").trim();
	const placeholder = (s) => /^<[^>]*>$/.test(s);
	const out = [];
	let state = "out"; //  out | skip（用語集でない表）| rows
	let col = -1;
	for (const line of stripHtmlComments(read(file)).split(/\r?\n/)) {
		if (!line.trim().startsWith("|")) {
			state = "out";
			continue;
		}
		const cells = line.trim().replace(/^\||\|$/g, "").split("|").map(clean);
		if (state === "out") {
			col = cells.findIndex((c) => c.includes("コード識別子"));
			state = col >= 0 ? "rows" : "skip";
			if (col >= 0) out.hasTable = true;
			continue;
		}
		if (state === "skip" || /^:?-+:?$/.test(cells[0] || "")) continue;
		const [term, cell] = [cells[0], cells[col]];
		if (!term || placeholder(term) || !cell || placeholder(cell)) continue;
		const idents = [];
		for (const part of cell.split(/\s*[,、\/]\s*/)) for (const x of part.split(".")) if (/^[A-Za-z_]\w*$/.test(x.trim())) idents.push(x.trim());
		if (idents.length) out.push({ term, idents });
	}
	return out;
}

function checkContractConformance(cfg, shared) {
	const con = declared(cfg.contract);
	if (!con || shared === null) return [];
	const src = join(cfg._root, con.error_source);
	if (!existsSync(src)) return []; //  不在は C26
	if (!statSync(src).isFile()) configError(`contract.error_source はファイルにする（実際: ${con.error_source} はディレクトリ）`);
	const impl = new Set([...read(src).matchAll(compile("contract.error_code_pattern", con.error_code_pattern, "g"))].map((m) => m[1]));
	const vocab = declared(cfg.docs.shared) ? cfg.docs.shared : "docs.shared（none）";
	return [...impl].filter((c) => !shared.has(c)).sort().map((c) => `エラーコード ${c} が実装（${con.error_source}）にあるが契約語彙（${vocab} の errorCodes）に無い`);
}

//  ---- 検査本体 ---------------------------------------------------------------

function runChecks(cfg, { asActive = false } = {}) {
	const covRe = compile("covers_pattern", cfg.covers_pattern, "g");
	const scenRe = compile("scenario_pattern", cfg.scenario_pattern ?? DEFAULTS.scenario_pattern, "g");
	const nfrRe = compile("nfr_pattern", cfg.nfr_pattern ?? DEFAULTS.nfr_pattern, "g");
	const brCovRe = compile("br_pattern", cfg.br_pattern ?? DEFAULTS.br_pattern, "g");
	const brRe = compile("id_patterns.br", cfg.id_patterns.br, "g");
	const reqRe = compile("id_patterns.req", cfg.id_patterns.req, "g");

	const corpus = new Corpus(cfg, asActive);
	const brDocs = loadDocs(p(cfg, "docs.rules_dir"), asActive);
	const brs = Object.fromEntries(Object.entries(brDocs).map(([id, d]) => [id, d.status]));
	const nfrDocs = loadDocs(p(cfg, "docs.nfr_dir"), asActive);
	const contracts = readContracts(corpus);
	for (const k of ["docs.actors", "docs.vision", "docs.glossary", "docs.shared"]) {
		const v = lookup(cfg, k);
		if (typeof v === "string" && existsSync(join(cfg._root, v)) && !statSync(join(cfg._root, v)).isFile()) configError(`${k} はファイルにする（実際: ${v} はディレクトリ）`);
	}
	const kinds = actorKinds(cfg);
	const failures = [];
	const notYet = []; //  義務が無いので違反にしない、宣言した固定パスの不在
	const fail = (id, msg) => failures.push(`[${id}] ${msg}`);

	const srcSec = declared(cfg.source);
	const testSec = declared(cfg.tests);
	const sysSec = testSec ? declared(testSec.system) : null;
	const schemaSec = declared(cfg.schema);

	//  ---- 走査
	const schemaList = schemaFiles(cfg);
	const tests = testSec ? scanTests(cfg, testSec, "tests", iterFiles(cfg, "tests"), "covers_placement", { covers: covRe, nfr: nfrRe, br: brCovRe }) : null;
	const system = sysSec ? scanTests(cfg, sysSec, "tests.system", iterFiles(cfg, "tests.system"), "scenario_placement", { scenario: scenRe, nfr: nfrRe, br: brCovRe }) : null;

	//  被覆: 保留でないテスト（live）だけを数え、保留だけのときは直し方を添える
	const tally = (map, key, u, where) => {
		const t = (map[key] ||= { live: [], pending: [], where: [] });
		t.where.push(where);
		if (u.pending) t.pending.push(u);
		else t.live.push(where);
	};
	const coverage = {}; //  "REQ#class" -> tally
	const reqTests = {}; //  REQ -> tally
	const classOf = {}; //  "REQ#class" -> { req, klass }
	for (const u of tests?.units || [])
		for (const a of u.ann.covers) {
			const key = `${a.m[1]}#${a.m[2] ?? ""}`;
			classOf[key] = { req: a.m[1], klass: a.m[2] || null };
			tally(coverage, key, u, a.where);
			tally(reqTests, a.m[1], u, a.where);
		}
	const nfrTests = {};
	for (const u of [...(tests?.units || []), ...(system?.units || [])]) for (const a of u.ann.nfr) tally(nfrTests, a.m[1], u, a.where);
	//  規則（BR）を確かめるテスト。クラスは持たない（@covers BR-nnn）。数えるのは tests の範囲だけ
	const brTests = {};
	for (const u of tests?.units || []) for (const a of u.ann.br) tally(brTests, a.m[1], u, a.where);
	const scenarios = {};
	for (const u of system?.units || []) for (const a of u.ann.scenario) tally(scenarios, a.m[1], u, a.where);
	const uncovered = (t, head, none) => (t?.pending.length ? `${head}は${pendingHint(t.pending)}` : `${head}が存在しない${none}`);

	const referencedBrs = new Set();
	for (const d of [...Object.values(corpus.reqs), ...Object.values(corpus.ucs)]) for (const m of textOf(d).matchAll(brRe)) referencedBrs.add(m[0]);
	const referencedGoals = new Set(Object.values(corpus.ucs).filter((u) => u.status !== "withdrawn").map((u) => u.goal));
	const activeReqs = Object.keys(corpus.reqs).filter((r) => corpus.reqs[r].status === "active").sort();
	const activeUcs = Object.keys(corpus.ucs).filter((u) => corpus.ucs[u].status === "active").sort();
	const humanUcs = activeUcs.filter((u) => isHumanActor(kinds, corpus.ucs[u].actor));
	const activeBrs = Object.keys(brs).filter((b) => brs[b] === "active").sort();
	const dbBrs = activeBrs.filter((b) => DB_ENFORCED_RE.test(brDocs[b].fm.enforced_at || ""));
	const values = (v) => (v || "").split(/\s*,\s*/).filter((x) => x && !isPlaceholder(x));

	//  C1: active な REQ は、保留でないテストに被覆される
	for (const req of activeReqs) if (!reqTests[req]?.live.length) fail("C1", uncovered(reqTests[req], `${req} を被覆するテスト`, "（未検証の要件）"));
	for (const req of activeReqs) if (!corpus.reqs[req].hasPolicy) fail("C2", `${req} のファイルに「${POLICY_HEADING}」セクションがない`);
	//  撤回済み（withdrawn）の仕様を指す注釈・参照も違反（紐づき先が生きていない。ADR-0056）
	for (const req of Object.keys(reqTests).sort())
		if (!(req in corpus.reqs)) fail("C3", `テストが未定義の ${req} を @covers している（${reqTests[req].where.join(", ")}）`);
		else if (corpus.reqs[req].status === "withdrawn") fail("C3", `テストが撤回済みの ${req} を @covers している（${reqTests[req].where.join(", ")}）`);
	for (const br of Object.keys(brTests).sort())
		if (!(br in brs)) fail("C3", `テストが未定義の ${br} を @covers している（${brTests[br].where.join(", ")}）`);
		else if (brs[br] === "withdrawn") fail("C3", `テストが撤回済みの ${br} を @covers している（${brTests[br].where.join(", ")}）`);
	//  撤回済みの BR は、どこからも参照されていないのが正しい（active な文書から参照すれば C16 が落とす）
	for (const br of Object.keys(brs).sort()) if (brs[br] !== "withdrawn" && !referencedBrs.has(br)) fail("C4", `${br} がどの UC / REQ からも参照されていない（死んだ規則）`);
	for (const v of checkLayering(cfg)) fail("C6", v);
	const shared = sharedErrorCodes(cfg);
	for (const v of checkContractConformance(cfg, shared)) fail("C7", v);
	for (const [goal, g] of Object.entries(corpus.goals).sort())
		if (g.status === "active" && !referencedGoals.has(goal)) fail("C8", `${goal} (active) を実現する UC が存在しない`);
	for (const v of corpus.pathViolations) fail("C9", v);

	//  C10: 宣言クラスの下限被覆 / クラス未宣言
	for (const req of activeReqs) {
		const classes = corpus.reqs[req].classes;
		if (classes.length === 0) {
			fail("C10", `${req} に分割クラスが宣言されていない（検証方針に \`#name\` を列挙すること）`);
			continue;
		}
		for (const k of classes)
			if (!coverage[`${req}#${k}`]?.live.length) fail("C10", uncovered(coverage[`${req}#${k}`], `${req}#${k} を被覆するテスト`, "（未検証の分割クラス）"));
	}

	//  C11: 生成上限 — 全テストは窓に @covers を持ち、REQ の @covers は 1 つだけで、宣言済みクラスを指す
	//  （NFR を検証するテストは @covers NFR-nnn、規則を確かめるテストは @covers BR-nnn で足りる）
	for (const key of Object.keys(coverage).sort()) {
		const { req, klass } = classOf[key];
		if (!(req in corpus.reqs) || corpus.reqs[req].status === "withdrawn") continue; //  C3 で報告済み
		const w = coverage[key].where.join(", ");
		if (klass === null) fail("C11", `${w}: クラス指定がない（@covers ${req}#<class> 形式にすること）`);
		else if (!corpus.reqs[req].classes.includes(klass))
			fail("C11", `${w}: 未宣言のクラス ${req}#${klass} を指している。テストを増やす前に検証方針へクラスを宣言すること（生成上限）`);
	}
	if (tests) {
		for (const u of tests.units) {
			if (!u.ann.covers.length && !u.ann.nfr.length && !u.ann.br.length)
				fail("C11", `${u.where} "${u.name}": @covers の無いテスト（tests.test_pattern に一致）。技術部品の自己検査なら tests.dirs の外に置く${u.hash ? HASH_HINT : ""}`);
			if (u.ann.covers.length > 1)
				fail("C11", `${u.where} "${u.name}": 1 つのテストに REQ の @covers が ${u.ann.covers.length} 個ある（1 テストは 1 つの REQ#クラスを検証する。テストを分ける）`);
		}
		for (const w of [...tests.orphans.covers, ...tests.orphans.nfr, ...tests.orphans.br])
			fail("C11", `${w}: どのテストにも属さない @covers（tests.covers_placement: ${tests.placement} ＝ ${tests.placement === "before" ? "テスト印の行か、その直上に連続するコメント行" : "テスト印の行か、次のコメント行"}に置く）`);
	}

	//  規則の @covers を数えるのは tests の範囲だけ。シナリオテストに書かれたものを黙って読み飛ばさない
	if (system) {
		for (const u of system.units)
			for (const a of u.ann.br) fail("C11", `${a.where}: シナリオテストの @covers ${a.m[1]} は数えない（規則を確かめるテストは tests.dirs に置き、そこに @covers ${a.m[1]} を書く）`);
		for (const w of system.orphans.br) fail("C11", `${w}: シナリオテストの @covers は規則の被覆に数えない（規則を確かめるテストは tests.dirs に置く）`);
	}

	//  C12: 重複 ID（採番衝突）
	for (const [ident, files] of Object.entries(collectDefinitions(cfg)).sort())
		if (files.length > 1) fail("C12", `${ident} が複数箇所で定義されている（${files.map((f) => rel(cfg, f)).join(", ")}）`);

	//  C13: DB で守る active な規則は、制約が効くことを確かめるテストを持つ（規則に反する行を DB に直接入れて断られる）。
	//  アプリの入口を通すテストでは、手前の検証が断ったのか DB が断ったのかを区別できない（tests が none なら C26）
	if (tests)
		for (const id of dbBrs)
			if (!brTests[id]?.live.length)
				fail("C13", uncovered(brTests[id], `${id} は enforced_at に database を含むが、@covers ${id} のテスト`, `（規則に反する行を DB に直接入れて断られることを確かめるテストを tests.dirs に書き、@covers ${id} を付ける）`));

	//  C15: 人間アクターの active な UC は、保留でないシナリオテスト（tests.system の @scenario UC-nnn）を 1 件以上持つ。
	//  1 UC 1 本・正常系のみが規律（ADR-0035）だが、機械が見るのは存在と参照先の実在だけ（本数の上限は reviewer）
	if (system) {
		for (const uid of humanUcs)
			if (!scenarios[uid]?.live.length)
				fail("C15", uncovered(scenarios[uid], `${uid} (active、アクター ${corpus.ucs[uid].actor || "未記載"}) のシナリオテスト`, `（tests.system に @scenario ${uid} を持つテストを 1 本置く）`));
		for (const uid of Object.keys(scenarios).sort())
			if (!(uid in corpus.ucs)) fail("C15", `${scenarios[uid].where.join(", ")}: 未定義の ${uid} を @scenario している`);
			else if (corpus.ucs[uid].status === "withdrawn") fail("C15", `${scenarios[uid].where.join(", ")}: 撤回済みの ${uid} を @scenario している`);
		for (const u of system.units)
			if (!u.ann.scenario.length) fail("C15", `${u.where} "${u.name}": @scenario の無いシナリオテスト（tests.system.test_pattern に一致）${u.hash ? HASH_HINT : ""}`);
		for (const w of system.orphans.scenario) fail("C15", `${w}: どのシナリオテストにも属さない @scenario（tests.system.scenario_placement: ${system.placement}）`);
	}

	//  C16: active な UC / REQ が参照する BR は定義されていて active（C4 の逆方向）
	for (const [id, doc] of [...Object.entries(corpus.ucs), ...Object.entries(corpus.reqs)].sort(([a], [b]) => a.localeCompare(b))) {
		if (doc.status !== "active") continue;
		for (const br of referencedIds(doc, brRe))
			if (!(br in brs)) fail("C16", `${id} が未定義の ${br} を参照している`);
			else if (brs[br] === "withdrawn") fail("C16", `${id} が撤回済みの ${br} を参照している`);
			else if (brs[br] !== "active") fail("C16", `${id} (active) が ${brs[br]} の ${br} を参照している（BR を承認して active にするか、参照を外す）`);
	}

	//  C17: active な UC の表（状態 × イベント表と例外系の走査）とその UC の REQ が 1 対 1 に対応する（R-404）
	for (const uid of activeUcs) {
		const cells = idsIn(tableSections(textOf(corpus.ucs[uid])), reqRe);
		for (const rid of cells) {
			const rq = corpus.reqs[rid];
			if (!rq) fail("C17", `${uid} の表が未定義の ${rid} を指している（予約した REQ を作るか、セルを直す）`);
			else if (rq.uc !== uid) fail("C17", `${uid} の表が ${rq.uc} の ${rid} を指している`);
			else if (rq.status === "withdrawn") fail("C17", `${uid} の表が撤回済みの ${rid} を指している（セルを別の REQ か「不可: 理由」にする）`);
		}
		const own = Object.entries(corpus.reqs).filter(([, rq]) => rq.uc === uid && rq.status !== "withdrawn");
		for (const [rid] of own.sort()) if (!cells.includes(rid)) fail("C17", `${rid} が ${uid} の表のどのセルからも導出されていない`);
		if (!own.length) fail("C17", `${uid} (active) に REQ が 1 件も無い（表のセルから REQ を導出する）`);
	}

	//  C18: active な GOAL の actor / origin と UC の actor は、アクター表と vision の KPI 表に定義されている
	//  （docs.actors / docs.vision が none のときは参照の有無を C26 が見る）
	const actors = declared(cfg.docs.actors) ? new Set(Object.keys(kinds)) : null;
	const kpis = declared(cfg.docs.vision) ? visionKpis(cfg) : null;
	let actorRefs = 0;
	let kpiRefs = 0;
	for (const goal of Object.keys(corpus.goals).sort()) {
		const g = corpus.goals[goal];
		if (g.status !== "active") continue;
		actorRefs += values(g.actor).length;
		kpiRefs += values(g.origin).length;
		if (actors) for (const a of values(g.actor)) if (!actors.has(a)) fail("C18", `${goal} の actor ${a} が ${cfg.docs.actors} に無い`);
		if (kpis) for (const k of values(g.origin)) if (!kpis.has(k)) fail("C18", `${goal} の origin ${k} が ${cfg.docs.vision} に無い`);
	}
	for (const uid of activeUcs) {
		actorRefs += values(corpus.ucs[uid].actor).length;
		if (actors) for (const a of values(corpus.ucs[uid].actor)) if (!actors.has(a)) fail("C18", `${uid} の actor ${a} が ${cfg.docs.actors} に無い`);
	}

	//  C20: active な NFR は検証の所在（保留でないテストの @covers NFR-nnn か、measured_by）を持つ。
	//  measured_by は docs で宣言した文書（goals / rules / nfr / adr、verification_global / verification_deferred、shared、actors、vision、
	//  glossary など docs.* のすべて）の外のファイルで、中にその NFR の ID が現れること（計測の所在を ID で辿る）。
	//  GLOBAL.md は「検証しない範囲」の置き場で、NFR の ID を含んでも計測の所在にはならない
	const docPaths = Object.entries(isMap(cfg.docs) ? cfg.docs : {})
		.filter(([, v]) => typeof v === "string" && v.trim())
		.map(([k, v]) => [`docs.${k}`, resolve(cfg._root, v)]);
	const nfrMeasured = {};
	for (const id of Object.keys(nfrDocs).sort()) {
		const n = nfrDocs[id];
		if (n.status !== "active") continue;
		const valid = [];
		for (const m of values(n.fm.measured_by)) {
			const abs = resolve(cfg._root, m);
			const r = relative(cfg._root, abs);
			if (/^[a-z][a-z0-9+.-]*:\/\//i.test(m) || isAbsolute(m) || r.startsWith("..")) fail("C20", `${id} の measured_by ${m} はリポジトリ内のファイルにする（外部の計測は runbook に ID と計測先を書き、その runbook を指す）`);
			else if (!existsSync(abs)) fail("C20", `${id} の measured_by ${m} が無い`);
			else if (!statSync(abs).isFile()) fail("C20", `${id} の measured_by ${m} はファイルにする（ディレクトリは不可）`);
			else if (docPaths.some(([, d]) => abs === d || abs.startsWith(d + "/") || abs.startsWith(d + "\\"))) {
				const [key] = docPaths.find(([, d]) => abs === d || abs.startsWith(d + "/") || abs.startsWith(d + "\\"));
				fail("C20", `${id} の measured_by ${m} は ${key} の文書で、計測の所在にならない。docs の外（計測のスクリプト、CI の定義、ID と計測先を書いた runbook）を指す`);
			}
			else if (!read(abs).includes(id)) fail("C20", `${id} の measured_by ${m} の中に ${id} が現れない（計測の所在に ID を書く）`);
			else valid.push(m);
		}
		nfrMeasured[id] = valid;
		if (!nfrTests[id]?.live.length && !valid.length && !values(n.fm.measured_by).length)
			fail("C20", nfrTests[id]?.pending.length
				? `${id} (active) を検証するテストは${pendingHint(nfrTests[id].pending)}（measured_by も無い）`
				: `${id} (active) を検証するテストも measured_by も無い（テストに @covers ${id} を書くか、計測の所在を measured_by に書く）`);
	}
	for (const id of Object.keys(nfrTests).sort())
		if (!(id in nfrDocs)) fail("C20", `${nfrTests[id].where.join(", ")}: 未定義の ${id} を @covers している`);
		else if (nfrDocs[id].status === "withdrawn") fail("C20", `${nfrTests[id].where.join(", ")}: 撤回済みの ${id} を @covers している`);
	for (const w of system?.orphans.nfr || []) fail("C20", `${w}: どのシナリオテストにも属さない @covers（tests.system.scenario_placement: ${system.placement}）`);

	//  C22: active な BR は、規則を確かめるテストに辿れる: active な REQ の br: から参照されるか、保留でないテストが @covers BR-nnn している
	//  （UC の本文だけでは、規則を検証するテストに辿れない）
	const brFromReq = new Set();
	for (const rq of Object.values(corpus.reqs)) if (rq.status === "active") for (const b of values(rq.br)) brFromReq.add(b);
	for (const br of activeBrs)
		if (!brFromReq.has(br) && !brTests[br]?.live.length)
			fail("C22", brTests[br]?.pending.length
				? `${br} (active) を br: に持つ active な REQ が無く、@covers ${br} のテストは${pendingHint(brTests[br].pending)}`
				: `${br} (active) を br: に持つ active な REQ も、@covers ${br} のテストも無い（規則を確かめるテストに辿れない）`);

	//  C24: 撤回されていない契約があるとき、共有語彙のエラーコードはどれかの契約の errors で使われる（C7 は実装 ⊆ 共有語彙の向き）
	const liveContracts = contracts.filter((c) => c.ucStatus !== "withdrawn");
	if (shared && declared(cfg.docs.shared) && liveContracts.length) {
		const used = new Set(liveContracts.flatMap((c) => c.codes));
		for (const code of [...shared].sort()) if (!used.has(code)) fail("C24", `共有語彙のエラーコード ${code} がどの契約の errors でも使われていない（${cfg.docs.shared}）`);
	}

	//  C25: active な UC / REQ の本文が使う用語のコード識別子は、ソース（とスキーマ）のコメント以外に存在する（用語集の status によらない）。
	//  用語は長いものから照合し、長い用語に含まれる短い用語は、それ単独で現れたときだけ使われたと数える
	const glossary = declared(cfg.docs.glossary) ? glossaryEntries(cfg) : null;
	//  用語集に義務があるのに「コード識別子」の列を持つ表が無ければ、使用を計算できない（none と同じ）
	if (glossary && !glossary.hasTable && activeUcs.length)
		fail("C26", `docs.glossary（${cfg.docs.glossary}）に「コード識別子」の列を持つ表が無い（active な UC がある。用語集の表の列名をテンプレートに合わせる）`);
	if (srcSec && glossary?.length) {
		let text = [...activeUcs.map((u) => corpus.ucs[u]), ...activeReqs.map((r) => corpus.reqs[r])].map((d) => stripHtmlComments(textOf(d))).join("\n");
		const used = [];
		for (const e of [...glossary].sort((a, b) => b.term.length - a.term.length))
			if (text.includes(e.term)) {
				used.push(e);
				text = text.split(e.term).join("\u0000");
			}
		if (used.length) {
			const words = new Set();
			const addWords = (files, judge) => {
				for (const path of files) {
					//  行頭から始まるブロックコメントの本文（先頭が * でない行も）を除く。文字列の中の /* は消さない
					const text = read(path).replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, (m) => m.replace(/[^\n]/g, " "));
					for (const line of text.split(/\r?\n/)) if (judge.isCodeLine(line)) for (const w of line.match(/[A-Za-z_]\w*/g) || []) words.add(w);
				}
			};
			addWords(iterFiles(cfg, "source"), commentJudge(cfg, srcSec, "source"));
			if (schemaSec) addWords(schemaList, commentJudge(cfg, schemaSec, "schema"));
			for (const { term, idents } of used.sort((a, b) => a.term.localeCompare(b.term)))
				for (const ident of idents) if (!words.has(ident)) fail("C25", `用語集の「${term}」のコード識別子 ${ident} がソースに無い（${cfg.docs.glossary}）`);
		}
	}

	//  C26: 義務表。active な文書・fixed な契約が求める範囲は、none にも 0 件にもできない（ADR-0056）
	const fixedOwned = contracts.filter((c) => c.status === "fixed" && c.ucStatus !== "withdrawn").flatMap((c) => c.ops.filter((o) => o.owned));
	const obligations = new Map(); //  キー -> 理由
	const oblige = (cond, reason, keys) => {
		if (cond) for (const k of keys) if (!obligations.has(k)) obligations.set(k, reason);
	};
	oblige(activeReqs.length, "active な REQ がある", ["source", "tests", "tests.pending_pattern"]);
	//  実装との対応は、実行の記録でしか確かめていない（ADR-0070）。要件とソースがあるのに記録を宣言しなければ、その検査が 0 になる。
	//  coverage は exec-check が読むキーだが、「要件があるのに確かめていない」ことは義務としてここで止める（省略も none と同じに扱う）。
	//  記録のファイルを指していない宣言（null、文字列、{}、report の無いオブジェクト）も、確かめる記録が決まらないので同じに扱う。
	//  report より先の中身（not_run、scope、functions）は exec-check が読む
	if (activeReqs.length && srcSec) {
		const cov = cfg.coverage;
		const what =
			cov === undefined
				? "は省略できない"
				: isNone(cov)
					? "は none にできない"
					: !isMap(cov) || typeof cov.report !== "string" || cov.report.trim() === ""
						? `が、実行の記録のファイル（report）を指していない（実際: ${JSON.stringify(cov)}）`
						: null;
		if (what !== null)
			fail(
				"C26",
				`coverage ${what}（active な REQ があり、source を宣言している）。テストのコマンドが書き出す実行の記録を { "report": "<lcov のファイル>", "not_run": [] } で宣言する（tools/exec-check/README.md。実装と仕様の対応を、実行の記録で確かめる）` +
					(isNone(cov) ? `（none の理由: ${cov.none}）` : ""),
			);
	}
	oblige(humanUcs.length, "人間がアクターの active な UC がある", ["tests", "tests.system", "tests.system.pending_pattern"]);
	oblige(activeUcs.length, "active な UC がある", ["docs.glossary"]);
	oblige(fixedOwned.some((o) => o.direction === "inbound"), "fixed 契約に owned かつ inbound の操作がある", ["source"]);
	oblige(fixedOwned.some((o) => o.codes.length), "fixed 契約の owned の操作に errors がある", ["contract"]);
	oblige(liveContracts.some((c) => c.codes.length), "撤回されていない契約に errors がある", ["contract", "docs.shared"]);
	oblige(dbBrs.length, "enforced_at が database の active な BR がある", ["schema", "tests", "tests.pending_pattern"]);
	oblige(actorRefs, "active な GOAL / UC が ACT-nn を持つ", ["docs.actors"]);
	oblige(kpiRefs, "active な GOAL が KPI-nn を持つ", ["docs.vision"]);
	for (const [key, reason] of obligations) {
		const v = lookup(cfg, key);
		if (isNone(v)) fail("C26", `${key} は none にできない（${reason}）。宣言する（none の理由: ${v.none}）`);
	}
	const zero = (key, cond, what) => {
		if (obligations.has(key) && cond) fail("C26", `${what}が 1 件も無い（${obligations.get(key)}。範囲か印の正規表現を直す）`);
	};
	zero("tests", tests && !tests.units.length, "tests.dirs に tests.test_pattern に一致するテスト");
	zero("tests.system", system && !system.units.length, "tests.system.dirs に tests.system.test_pattern に一致するテスト");
	//  固定パス（glob でないパス）の不在: active な UC があるか、そのキーに義務があれば違反。それ以外は「未作成」と出すだけ
	const fixedPaths = [];
	const addPaths = (key, v) => {
		for (const x of [].concat(v ?? [])) if (typeof x === "string" && !x.startsWith("!") && !isGlob(x)) fixedPaths.push([key, x]);
	};
	for (const k of [...DOC_PATHS, "docs.actors", "docs.vision", "docs.glossary", "docs.shared"]) if (!isNone(lookup(cfg, k))) addPaths(k, lookup(cfg, k));
	if (srcSec) addPaths("source.dirs", srcSec.dirs);
	if (testSec) addPaths("tests.dirs", testSec.dirs);
	if (sysSec) addPaths("tests.system.dirs", sysSec.dirs);
	if (schemaSec) for (const k of ["files", "dirs"]) addPaths(`schema.${k}`, schemaSec[k]);
	if (declared(cfg.contract)) addPaths("contract.error_source", cfg.contract.error_source);
	for (const [key, x] of fixedPaths) {
		if (existsSync(join(cfg._root, x))) continue;
		const why = activeUcs.length ? "active な UC がある" : obligations.get(key) || obligations.get(key.split(".")[0]);
		if (why) fail("C26", `${key} の ${x} が無い（${why}）。作る（ディレクトリなら .gitkeep を置く）${DOC_PATHS.includes(key) ? "" : "か、none にする（理由付き）"}`);
		else notYet.push(`${key}: ${x}`);
	}

	//  ---- レポート（被覆マトリクス。本出力が SSOT / 手書き禁止） ----
	const lines = ["=".repeat(68), " トレーサビリティ検査（被覆マトリクスは本出力が SSOT / 手書き禁止）", "=".repeat(68)];
	const nActiveGoals = Object.values(corpus.goals).filter((g) => g.status === "active").length;
	const nTests = Object.values(coverage).reduce((n, c) => n + c.where.length, 0);
	const nClasses = Object.values(corpus.reqs).reduce((n, r) => n + r.classes.length, 0);
	const count = (units, pred) => units.filter(pred).length;
	lines.push(
		`  GOAL: ${Object.keys(corpus.goals).length} (active: ${nActiveGoals}) / UC: ${Object.keys(corpus.ucs).length}` +
			` / REQ: ${Object.keys(corpus.reqs).length} / 分割クラス: ${nClasses} / BR: ${Object.keys(brs).length} / テスト: ${nTests}` +
			(tests
				? ` / テスト関数: ${tests.units.length}（@covers なし ${count(tests.units, (u) => !u.ann.covers.length && !u.ann.nfr.length && !u.ann.br.length)} / 帰属なし注釈 ${tests.orphans.covers.length + tests.orphans.nfr.length + tests.orphans.br.length} / 保留 ${count(tests.units, (u) => u.pending)}）`
				: "") +
			(system ? ` / シナリオテスト: ${system.units.length}（保留 ${count(system.units, (u) => u.pending)}）` : ""),
	);
	if (asActive) lines.push("  --as-active: draft の文書を active とみなして判定した");
	for (const goal of Object.keys(corpus.goals).sort()) {
		const g = corpus.goals[goal];
		lines.push("-".repeat(68), ` ${goal} (${basename(g.dir)}/)`);
		for (const uid of Object.keys(corpus.ucs).sort().filter((u) => corpus.ucs[u].goalDir === g.dir)) {
			const u = corpus.ucs[uid];
			lines.push(`  ${uid} (${basename(u.dir)}/)${u.phase ? `  [${u.phase}]` : ""}${system ? `  scenario:${scenarios[uid]?.live.join(", ") || "-"}` : ""}`);
			for (const req of Object.keys(corpus.reqs).sort().filter((r) => corpus.reqs[r].dir === u.dir)) {
				const info = corpus.reqs[req];
				lines.push(`    ${req}  [${info.status}]`);
				for (const k of info.classes) {
					const hit = coverage[`${req}#${k}`]?.live || [];
					lines.push(`      ${hit.length ? "OK " : "NG "}#${k.padEnd(22)} ${hit.join(", ") || "(テストなし)"}`);
				}
			}
		}
	}
	lines.push("-".repeat(68), " BR -> 検証（生成。規則を確かめるテストと、br: に持つ active な REQ）");
	for (const br of Object.keys(brs).sort()) {
		const where = [...(brTests[br]?.live || []), ...activeReqs.filter((r) => values(corpus.reqs[r].br).includes(br)).map((r) => `br:${r}`)];
		lines.push(`  ${where.length ? "OK " : "NG "}${br}  [${brs[br]}]  ${where.join(", ") || "(検証の所在なし)"}`);
	}
	lines.push("-".repeat(68), " NFR -> 検証（生成）");
	for (const id of Object.keys(nfrDocs).sort()) {
		const where = [...(nfrTests[id]?.live || []), ...(nfrMeasured[id] || []).map((m) => `measured_by:${m}`)];
		lines.push(`  ${where.length ? "OK " : "NG "}${id}  [${nfrDocs[id].status}]  ${where.join(", ") || "(検証の所在なし)"}`);
	}
	lines.push("=".repeat(68));
	return { failures, report: lines.join("\n"), notYet };
}

//  ---- 索引（派生物: ファイルへコミットしない） ----------------------------------------

function printIndex(cfg) {
	const firstQuoteOf = (text) => {
		for (const line of text.split(/\r?\n/)) if (line.startsWith("> ")) return line.slice(2).trim();
		return "";
	};
	const firstQuote = (path) => firstQuoteOf(read(path));
	const corpus = new Corpus(cfg);
	//  ID ごとの、それを確かめるテストのファイル（保留のテストは「(保留)」を付ける）。tests が none なら引かない
	const testSec = declared(cfg.tests);
	const sysSec = testSec ? declared(testSec.system) : null;
	const testFiles = {}; //  ID -> Map<ファイル, 保留でないテストがあるか>
	const note = (id, u, where) => {
		const file = where.replace(/:\d+$/, "");
		const m = (testFiles[id] ||= new Map());
		m.set(file, m.get(file) || !u.pending);
	};
	const kinds = {
		covers: compile("covers_pattern", cfg.covers_pattern, "g"),
		nfr: compile("nfr_pattern", cfg.nfr_pattern ?? DEFAULTS.nfr_pattern, "g"),
		br: compile("br_pattern", cfg.br_pattern ?? DEFAULTS.br_pattern, "g"),
	};
	if (testSec) for (const u of scanTests(cfg, testSec, "tests", iterFiles(cfg, "tests"), "covers_placement", kinds).units) for (const k of Object.keys(kinds)) for (const a of u.ann[k]) note(a.m[1], u, a.where);
	if (sysSec) {
		const sysKinds = { scenario: compile("scenario_pattern", cfg.scenario_pattern ?? DEFAULTS.scenario_pattern, "g"), nfr: kinds.nfr };
		for (const u of scanTests(cfg, sysSec, "tests.system", iterFiles(cfg, "tests.system"), "scenario_placement", sysKinds).units) for (const k of Object.keys(sysKinds)) for (const a of u.ann[k]) note(a.m[1], u, a.where);
	}
	const testsOf = (id) => {
		if (!testSec) return "(tests は none)";
		return [...(testFiles[id] || [])].sort().map(([f, live]) => (live ? f : `${f} (保留)`)).join(", ") || "-";
	};
	const out = ["# 索引（生成物 / trace-check --index。コミット禁止）"];
	for (const goal of Object.keys(corpus.goals).sort()) {
		const g = corpus.goals[goal];
		out.push("", `## ${goal} [${g.status}] ${basename(g.dir)}/`, `   ${firstQuote(join(g.dir, "GOAL.md"))}`);
		for (const [uid, u] of Object.entries(corpus.ucs).sort()) {
			if (u.goalDir !== g.dir) continue;
			out.push(`   ${uid}/ [${u.status}${u.phase ? ` / ${u.phase}` : ""}]  ${frontmatter(u.file).title || ""}`);
			if (sysSec) out.push(`            scenario: ${testsOf(uid)}`);
			for (const [rid, r] of Object.entries(corpus.reqs).sort()) {
				if (r.dir !== u.dir) continue;
				let text = firstQuoteOf(textOf(r));
				if (text.length > 42) text = text.slice(0, 42) + "…";
				out.push(`     ${rid} [${parseFrontmatter(textOf(r)).data.pattern || "?"}] ${text}`, `            classes: ${r.classes.map((k) => `#${k}`).join(" ")}`, `            tests: ${testsOf(rid)}`);
			}
		}
	}
	out.push("", "## rules");
	for (const f of walk(p(cfg, "docs.rules_dir"), [".md"])) {
		const fm = frontmatter(f);
		if (fm.id) out.push(`   ${fm.id}  ${fm.title || ""}  (enforced_at: ${fm.enforced_at || "?"})`, `            tests: ${testsOf(fm.id)}`);
	}
	out.push("", "## nfr");
	for (const f of walk(p(cfg, "docs.nfr_dir"), [".md"])) {
		const fm = frontmatter(f);
		if (fm.id) out.push(`   ${fm.id}  [${fm.category || "?"}]  ${firstQuote(f).slice(0, 60)}`, `            tests: ${testsOf(fm.id)}`);
	}
	out.push("", "## adr");
	for (const f of walk(p(cfg, "docs.adr_dir"), [".md"])) {
		const fm = frontmatter(f);
		if (fm.id) out.push(`   ${fm.id}  [${fm.status || "?"}]  ${fm.title || ""}`);
	}
	console.log(out.join("\n"));
}

//  ---- 引数と main ---------------------------------------------------------------

function usage(msg) {
	console.error(`trace-check: ${msg}`);
	process.exit(2);
}

function parseArgs(argv) {
	const opts = { root: ".", config: null, index: false, next: null, reserve: 1, only: null, asActive: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const value = () => (i + 1 < argv.length ? argv[++i] : usage(`${a} には値が要る`));
		if (a === "--root") opts.root = value();
		else if (a === "--config") opts.config = value();
		else if (a === "--update-baseline" || a === "--strict") usage(`${a} は廃止した（baseline を持たず、常にすべての違反で失敗する。ADR-0056）`);
		else if (a === "--index") opts.index = true;
		else if (a === "--as-active") opts.asActive = true;
		else if (a === "--next") opts.next = value();
		else if (a === "--reserve") opts.reserve = Number(value());
		else if (a === "--only") {
			const ids = value()
				.split(",")
				.map((s) => s.trim().toUpperCase())
				.filter(Boolean);
			if (!ids.length) usage("--only に検査項目が無い（例: --only C9,C12）");
			const unknown = ids.filter((x) => !CHECK_IDS.includes(x));
			const retired = ids.filter((x) => RETIRED_CHECKS.includes(x));
				if (retired.length) usage(`--only の ${retired.join(", ")} は廃止した検査（実装の注釈 @implements / @operation を読む検査はやめた。ADR-0070）`);
				if (unknown.length) usage(`--only に未知の検査項目がある: ${unknown.join(", ")}（使える項目: ${CHECK_IDS.join(" ")}）`);
			opts.only = new Set(ids);
		} else usage(`不明な引数 ${a}`);
	}
	return opts;
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const root = resolve(opts.root);
	const cfg = loadConfig(root, opts.config ? resolve(opts.config) : join(root, CONFIG_FILE));
	if ("baseline_file" in cfg) {
		console.error("trace-check: baseline_file は廃止した（ADR-0056）。harness.config.json からキーを削除し、台帳ファイルも削除する");
		return 2;
	}
	const decl = checkDeclarations(cfg);
	const declError = () => {
		console.error("trace-check: harness.config.json の宣言が足りないか誤っている（ADR-0056。紐づきの検査は黙って省かない）");
		for (const e of decl.errors) console.error(`  - ${e}`);
		return 2;
	};

	if (opts.next) {
		if (!["goal", "uc", "req", "br", "nfr", "adr"].includes(opts.next.toLowerCase())) usage("--next: goal|uc|req|br|nfr|adr のいずれか");
		if (!Number.isInteger(opts.reserve) || opts.reserve < 1) usage("--reserve: 1 以上の整数");
		if (DOC_PATHS.some((k) => typeof lookup(cfg, k) !== "string")) return declError();
		console.log(nextIds(cfg, opts.next, opts.reserve).join("\n"));
		return 0;
	}
	if (decl.errors.length) return declError();
	if (opts.index) {
		printIndex(cfg);
		return 0;
	}

	let result;
	try {
		result = runChecks(cfg, { asActive: opts.asActive });
	} catch (e) {
		//  設定の誤り以外の例外も exit 2（「違反あり」の 1 と区別する）
		console.error(e instanceof ConfigError ? `trace-check: 設定エラー: ${e.message}` : `trace-check: 内部エラー: ${e.stack || e}`);
		return 2;
	}
	let { failures, report, notYet } = result;
	if (opts.only) failures = failures.filter((f) => opts.only.has((f.match(/^\[(C\d+)\]/) || [])[1]));
	if (!opts.only) console.log(report);
	else console.log(`部分検査（--only ${[...opts.only].join(",")}）: ほかの検査項目は判定していない`);
	if (decl.absent.length) {
		console.log("\n宣言された不在（none。義務が生じれば C26 が違反にする）:");
		for (const [k, why] of decl.absent) console.log(`  - ${k}: ${why}`);
	}
	if (notYet.length) {
		console.log("\n未作成（宣言したパスがまだ無い。active な UC ができれば C26 が違反にする）:");
		for (const x of notYet) console.log(`  - ${x}`);
	}

	if (existsSync(join(root, ".trace-baseline.json"))) console.log("\nWARN .trace-baseline.json: baseline は廃止した（ADR-0056）。読まないので削除する");
	if (failures.length) {
		console.log(`\nFAIL（違反 ${failures.length} 件）:`);
		for (const f of failures) console.log(`  x ${f}`);
		console.log("\n-> 上流 SSOT を更新してから再導出すること（逆流ルール R-801）");
		return 1;
	}
	console.log(opts.only ? "\n指定した検査項目に違反なし（部分検査）。" : "\n違反なし。欠落・孤児・未宣言テスト・重複した正はありません。");
	return 0;
}

process.exit(main());
