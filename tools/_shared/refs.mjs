//  紐づきの読み方（lint refs・next-id・index が共有する。単独では実行しない）
//
//  設定（harness.config.json）の宣言の読み方と検査、仕様の木（GOAL / UC / REQ）と横の文書（BR / NFR / ADR）の読み方、
//  ID の定義の集め方、テストの注釈（@covers / @scenario）の数え方を持つ。3 つのコマンドが同じ読み方を使うので、
//  検査が数えた ID と、採番が使用済みとみなす ID と、索引に出る ID が食い違わない。
//
//  前提の構成（rules/develop/docs.md §10–11）:
//    docs/goals/<GOAL-nn-slug>/GOAL.md
//                             └ <UC-nnn-slug>/UC.md（REQ は「要件」の節の小節）+ contract.yaml（縦は互いに素）
//    docs/rules/BR-*.md  docs/nfr/NFR-*.md  docs/adr/ADR-*.md（横は中央）
//    所属の SSOT は frontmatter。パスは配置であり、両者の整合を C9 が検査する。
//
//  注釈（@covers / @scenario）はコメントの中にあるものだけを数え（comment_pattern）、
//  単位への帰属は窓で決める: before ＝ 単位の印の行と、直上に連続するコメント行 / after ＝ 単位の印の行と、次の行がコメントならその行。
//  検査の番号の表と義務表は tools/lint-refs/README.md が正本。

import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { inScope, isGlob } from "./glob.mjs";
import { isMap, parseStrictYaml } from "./strict-yaml.mjs";
import { reqDocsOf, splitUc } from "./reqs.mjs";
import { goalsRootOf, specDirs } from "./spec-tree.mjs";
import { CONFIG_FILE, renamedConfigHint, retiredKeysIn } from "./config.mjs";

//  出力の頭に付けるコマンドの名前（"lint refs" など）。コマンドのファイルが、最初に useCommandName で決める
let command = "";
export const useCommandName = (name) => {
	command = name;
};

export const CLASS_DECL_RE = /^\s*-\s*`#([\w-]+)`/gm;
export const GOAL_DIR_RE = /^(GOAL-\d+)/;
export const UC_DIR_RE = /^(UC-\d+)/;
export const ID_KIND_RE = /^(GOAL|UC|REQ|BR|NFR|ADR)-\d+$/;
export const POLICY_HEADING = "## 検証方針";
//  実装の注釈（@implements / @operation）を読んでいた検査は廃止した（ADR-0070）。番号は詰めない（過去の記録の番号と食い違わせない）
export const RETIRED_CHECKS = ["C5", "C14", "C19", "C21", "C23", "C27"];
export const CHECK_IDS = Array.from({ length: 27 }, (_, i) => `C${i + 1}`).filter((id) => !RETIRED_CHECKS.includes(id));

//  設定の誤りは違反ではなく使い方の誤り（exit 2）。検査の途中で見つかったものもここへ投げる
export class ConfigError extends Error {}
export const configError = (msg) => {
	throw new ConfigError(msg);
};

//  ---- ファイル入出力 -----------------------------------------------------------

export const read = (p) => readFileSync(p, "utf8");

//  frontmatter は tools/_shared/frontmatter.mjs が唯一の読み方（lint spec / guard と同じ。曖昧な書き方は lint spec が違反にする）
export const frontmatter = (path) => parseFrontmatter(read(path)).data;
//  UC・REQ の文面。UC は「要件」の節を除いた UC 自身の部分、REQ は自分の小節だけ（同じ UC.md に書かれた別の REQ の文面を混ぜない）
export const textOf = (doc) => doc.text ?? read(doc.file);

export function listFiles(dir, pred) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((d) => d.isFile() && pred(d.name))
		.map((d) => join(dir, d.name))
		.sort();
}

//  exts が null なら拡張子で絞らない。node_modules と .git の中は見ない（ドットで始まるディレクトリは見る。
//  隠した置き場の単位が走査から漏れて紐づき無しのまま通らないように）。壊れたシンボリックリンクと、
//  ディレクトリを指すシンボリックリンク（循環しうる）は辿らない
export function walk(dir, exts, top = true) {
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
export function scopeFiles(cfg, patterns, exts) {
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

export function loadConfig(root, configPath) {
	if (!existsSync(configPath)) {
		console.error(`${command}: 設定が無い: ${configPath}（テンプレート templates/develop/harness.config.json を host 直下に置く）${renamedConfigHint(configPath)}`);
		process.exit(2);
	}
	let cfg;
	try {
		cfg = JSON.parse(read(configPath));
	} catch (e) {
		console.error(`${command}: ${configPath} が JSON として読めない: ${e.message}`);
		process.exit(2);
	}
	if (!isMap(cfg)) {
		console.error(`${command}: ${configPath} の最上位はオブジェクトにする`);
		process.exit(2);
	}
	cfg._root = root;
	return cfg;
}

export const p = (cfg, keyPath) => join(cfg._root, lookup(cfg, keyPath));
export const rel = (cfg, path) => relative(cfg._root, path).split("\\").join("/");

//  紐づきの検査に要る宣言（ADR-0056）。省略は設定エラーで、対象が無いなら { "none": "<理由>" } と宣言する。
//  省略と不在を区別するのは、契約の auth: none / operations: {} と同じ（黙って検査を省かない）
export const isNone = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && "none" in v;
export const declared = (v) => (v === undefined || isNone(v) ? null : v);
export const lookup = (cfg, keyPath) => keyPath.split(".").reduce((n, k) => (n === undefined || n === null || isNone(n) ? undefined : n[k]), cfg);
export const DOC_PATHS = ["docs.goals_dir", "docs.rules_dir", "docs.nfr_dir", "docs.adr_dir"];
export const PLACEMENTS = ["before", "after"];

//  正規表現はすべて u フラグでコンパイルする（日本語の名前は [\p{L}\p{N}_] で書ける）。失敗はキー名付きの設定エラー
export const DEFAULT_COMMENT_PATTERN = "^\\s*(?:\\/\\/|\\/\\*|\\*|#|--|@|<!--)";
export const DEFAULTS = {
	scenario_pattern: "@scenario\\s+(UC-\\d{3})(?!\\d)",
	nfr_pattern: "@covers\\s+(NFR-\\d{3})(?!\\d)",
	br_pattern: "@covers\\s+(BR-\\d{3})(?!\\d)",
};
export function compile(key, src, flags = "") {
	if (typeof src !== "string" || !src) configError(`${key} は正規表現の文字列にする（実際: ${JSON.stringify(src)}）`);
	try {
		return new RegExp(src, flags + "u");
	} catch (e) {
		configError(`${key} の正規表現をコンパイルできない（u フラグ）: ${e.message}`);
	}
}
export const groupCount = (re) => new RegExp(`${re.source}|`, re.flags.replace(/[gy]/g, "")).exec("").length - 1;

//  宣言を検査して { errors, absent: [[キー, 理由]] } を返す。親が none なら子は問わない。
//  型も検査する（文字列のはずのキーにオブジェクトを書くと "[object Object]" のパスを黙って探すことになる）
export function checkDeclarations(cfg) {
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
export const statusOf = (s, asActive) => {
	const v = s || "active";
	return asActive && v === "draft" ? "active" : v;
};

//  ---- 1 ID 1 ファイルの定義（横の ID 空間） ---------------------------------------

export function loadDocs(dir, asActive) {
	const result = {}; //  id -> { status, fm, file }
	for (const f of walk(dir, [".md"])) {
		const fm = frontmatter(f);
		if (fm.id) result[fm.id] = { status: statusOf(fm.status, asActive), fm, file: f };
	}
	return result;
}

//  ---- ゴール集約ディレクトリの走査（縦の木） ---------------------------------------

export class Corpus {
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

export function collectDefinitions(cfg) {
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

//  ---- 注釈の判定と単位の走査 ---------------------------------------------------
//
//  注釈はコメントの中にあるものだけを数える（文字列リテラルの中の "@covers REQ-001#x" で紐づいて見えないように）:
//    comment_pattern に一致する行にある注釈か、同じ行で注釈より前にコメント開始記号（// /* # -- <!--）がある注釈（行末コメント）。
//  comment_pattern はセクション > 最上位 > 既定の順に決まる。既定は多言語の和集合なので、# / @ で始まる行は
//  窓をつなぐ（デコレーター、属性）が、その行の注釈は注釈より前に // /* -- <!-- があるときだけ数える
//  （TS の #private = "…" やデコレーターの文字列引数の中を数えない）。# を行コメントにする言語は comment_pattern を上書きする。
export const HASH_HINT = "（既定の comment_pattern では # / @ で始まる行の注釈を数えない。ブロックコメントの中なら行頭に * を付け、# を行コメントにする言語なら comment_pattern を上書きする）";

//  文字列リテラル（" ' `）の外にある最初のコメント開始記号の位置（無ければ -1）。# と -- は行頭か空白の直後だけ
//  （this.#x や i-- をコメントと読まない）
export function commentStart(line, openers, from = 0) {
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

export function commentJudge(cfg, sec, label) {
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
export const JOIN_MAX = 6;
export function headOf(lines, i) {
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

export function unitsOf(lines, unitRe, placement, judge) {
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
export const annotationsIn = (line, re, judge) => [...line.matchAll(re)].map((m) => ({ m, ...judge.counts(line, m.index) }));

//  テスト（tests / tests.system）の走査: 単位ごとの注釈と保留、どのテストにも属さない注釈。
//  保留（pending_pattern）は、単位の印の行か窓に一致すればその単位、それ以外の行（describe.skip、本体の XCTSkip、
//  Maestro のヘッダーの tag など）に一致すればファイルの全テストとみなす（保守的）。保留のテストは被覆に数えない
export function scanTests(cfg, sec, label, files, placementKey, kinds) {
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
export const pendingHint = (units) => {
	const filePending = [...new Set(units.map((u) => u.filePending).filter(Boolean))];
	return (
		`保留のテスト（pending_pattern に一致: ${units.map((u) => u.pending).join(", ")}）しか無い。skip を外す` +
		(filePending.length ? `か、テスト単位の外の保留（${filePending.join(", ")}）でファイル全体が保留になっているのでファイルを分ける` : "")
	);
};

export function iterFiles(cfg, section) {
	const sec = declared(lookup(cfg, section));
	if (!sec) return [];
	return scopeFiles(cfg, sec.dirs, sec.extensions);
}

//  スキーマ源（migration / schema.prisma / モデル定義）。R-102 で DB 設計の SSOT は native 形式にあり、docs には無い。
//  読むのは用語集のコード識別子を探すとき（C25）だけで、制約と規則の対応は読まない（DB で守る規則はテストで確かめる。C13）
export function schemaFiles(cfg) {
	const s = declared(cfg.schema);
	if (!s) return null;
	return scopeFiles(cfg, [...(s.files || []), ...(s.dirs || [])], s.extensions || [".sql", ".prisma"]);
}

//  ---- docs の表 -----------------------------------------------------------------

//  docs.actors の表から ACT-nn -> 種別 を読む。人間でないと数えるのは 種別 が「システム」で始まるものだけ
//  （語彙は 02-actors.md のテンプレートで閉じ、lint spec が検査する）。表に無い actor は人間とみなす（要求を外す根拠が無い）
export function actorKinds(cfg) {
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
export const isHumanActor = (kinds, actor) => !(actor in kinds) || !kinds[actor].startsWith("システム");

//  docs.vision の「成功の定義」表から KPI-nn を読む（先頭セルが KPI-nn で始まる行）
export function visionKpis(cfg) {
	const file = join(cfg._root, cfg.docs.vision);
	const kpis = new Set();
	if (existsSync(file)) for (const m of read(file).matchAll(/^\|\s*(KPI-\d+)\b/gm)) kpis.add(m[1]);
	return kpis;
}

//  文書の本文が参照する ID。HTML コメントは案内文なので除く。番号が 0 だけの ID はテンプレートのプレースホルダーで、
//  残っていれば lint spec が報告するのでここでは数えない
export const isPlaceholder = (id) => /-0+$/.test(id);
export const stripHtmlComments = (text) => text.replace(/<!--[\s\S]*?-->/g, "");
export const idsIn = (text, re) => [...new Set([...stripHtmlComments(text).matchAll(re)].map((m) => m[0]))].filter((id) => !isPlaceholder(id)).sort();
export const referencedIds = (doc, re) => idsIn(textOf(doc), re);

//  UC の表の節（状態 × イベント表、例外系の走査）だけを返す。他の節（主シナリオなど）の REQ ID は表のセルではない
//  節の見つけ方は lint spec と同じ（見出しが「状態」「例外系」で始まる ## 節）
export function tableSections(text) {
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
export const DB_ENFORCED_RE = /\b(?:database|db)\b|データベース|ＤＢ|ｄｂ/i;

//  layer_pattern（既定 "{layer}" ＝ root 直下の第 1 階層）で、パスのどの階層が層名かを決める。
//  "*/{layer}" なら Features/<機能>/Domain のような第 2 階層の層を読む（* は任意の 1 階層）
export function layerOf(parts, pattern) {
	const segs = pattern.split("/").filter(Boolean);
	if (parts.length <= segs.length) return null;
	let layer = null;
	for (let i = 0; i < segs.length; i++) {
		if (segs[i] === "{layer}") layer = parts[i];
		else if (segs[i] !== "*" && segs[i] !== parts[i]) return null;
	}
	return layer;
}

export function checkLayering(cfg) {
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

//  契約語彙（docs.shared の errorCodes のキー）。読み方は tools/_shared/strict-yaml.mjs（lint spec / run cases と同じ）。
//  docs.shared が none か、ファイルが無ければ空の語彙（ファイルの不在は C26 が扱う）
export function sharedErrorCodes(cfg) {
	if (!declared(cfg.docs.shared)) return new Set();
	const file = p(cfg, "docs.shared");
	if (!existsSync(file)) return null;
	const { root } = parseStrictYaml(read(file));
	return new Set(isMap(root.errorCodes) ? Object.keys(root.errorCodes) : []);
}

//  UC ごとの契約（contract.yaml）。読み方は tools/_shared/strict-yaml.mjs。構文の誤りは lint spec が報告し、ここは読めた分だけ使う
export function readContracts(corpus) {
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
export function glossaryEntries(cfg) {
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

export function checkContractConformance(cfg, shared) {
	const con = declared(cfg.contract);
	if (!con || shared === null) return [];
	const src = join(cfg._root, con.error_source);
	if (!existsSync(src)) return []; //  不在は C26
	if (!statSync(src).isFile()) configError(`contract.error_source はファイルにする（実際: ${con.error_source} はディレクトリ）`);
	const impl = new Set([...read(src).matchAll(compile("contract.error_code_pattern", con.error_code_pattern, "g"))].map((m) => m[1]));
	const vocab = declared(cfg.docs.shared) ? cfg.docs.shared : "docs.shared（none）";
	return [...impl].filter((c) => !shared.has(c)).sort().map((c) => `エラーコード ${c} が実装（${con.error_source}）にあるが契約語彙（${vocab} の errorCodes）に無い`);
}

//  ---- 3 つのコマンドに共通の始め方 -----------------------------------------------

export function usage(msg) {
	console.error(`${command}: ${msg}`);
	process.exit(2);
}

//  設定を読み、宣言を検査する。戻り: { root, cfg, decl, declError }。declError() は宣言の誤りを表示して 2 を返す。
//  廃止した baseline_file が残っていれば、表示して 2 で終わる
export function openProject(opts) {
	const root = resolve(opts.root);
	const cfg = loadConfig(root, opts.config ? resolve(opts.config) : join(root, CONFIG_FILE));
	if ("baseline_file" in cfg) {
		console.error(`${command}: baseline_file は廃止した（ADR-0056）。harness.config.json からキーを削除し、台帳ファイルも削除する`);
		process.exit(2);
	}
	const decl = checkDeclarations(cfg);
	const declError = () => {
		console.error(`${command}: harness.config.json の宣言が足りないか誤っている（ADR-0056。紐づきの検査は黙って省かない）`);
		for (const e of decl.errors) console.error(`  - ${e}`);
		return 2;
	};
	return { root, cfg, decl, declError };
}
