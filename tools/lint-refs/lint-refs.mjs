#!/usr/bin/env node
//
//  lint refs — トレーサビリティ検査（harness lint refs。依存ゼロの Node）
//
//  目標状態: 「テストと本検査がすべて緑 ＝ docs と実装の辻褄が機械検査の範囲で合っている」。
//  被覆マトリクスは手書きせず、ここで生成する（全体の地図は harness index が生成する。どちらもコミットしない）。
//  設定の宣言、仕様の木、注釈の読み方は tools/_shared/refs.mjs（next-id・index と同じ読み方）。
//
//  前提の構成（rules/develop/docs.md §10–11）:
//    docs/00-overview.md（GOAL の ID は GOAL の表の行。アクター表と KPI の表もここ。ADR-0076）
//    docs/goals/<GOAL-nn-slug>/<UC-nnn-slug>/UC.md（REQ は「要件」の節の小節）+ contract.yaml（縦は互いに素）
//    docs/rules/BR-*.md  docs/nfr/NFR-*.md  docs/adr/ADR-*.md（横は中央）
//    所属の SSOT は frontmatter。パスは配置であり、両者の整合を C9 が検査する。
//    各 REQ の「## 検証方針」は分割クラス `#name` を宣言する（下限 C10 / 上限 C11）。
//
//  手で書く紐づきはテストの側だけ（ADR-0070）:
//    - 読む注釈は、テストの @covers（REQ#クラス、NFR、BR）とシナリオテストの @scenario だけ。
//      実装とスキーマのコードの注釈（@implements / @operation）は読まない。実装との対応は、実行の記録（lint coverage）と
//      入口の一覧の突き合わせ（lint entries）で確かめる。
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
//    C9   パス整合: GOAL のフォルダと概要の GOAL の行の対応（行が無い・planned の行のフォルダ・同じ GOAL のフォルダが 2 つ）、
//         概要へ移した古い文書（00-vision.md・02-actors.md・goals-backlog.md・GOAL.md）の残り、UC ディレクトリ名と frontmatter id・goal の一致、ノード定義ファイルの存在、
//         REQ が自身の uc の直下にあること、goals 配下で検査の対象にならない文書（_shared 以外の _ ディレクトリ、id を持つ配置外の md）
//    C10  active な REQ の宣言された全分割クラスに、保留でないテストが 1 件以上あるか
//    C11  tests の全テスト（test_pattern）が窓に @covers を持ち（REQ の @covers は 1 つだけ）、宣言済みクラスを指しているか。どのテストにも属さない @covers も違反
//    C12  同一 ID が複数箇所で定義されていないか（採番衝突）
//    C13  enforced_at に database を含む active な BR に、保留でないテストの @covers BR-nnn があるか（制約が効くことをテストで確かめる）
//    C15  人間がアクターの active な UC に、保留でない @scenario UC-nnn のシナリオテスト（tests.system）があるか。
//         tests.system の全テストが窓に @scenario を持ち、未定義・撤回済みの UC を指さないか（ADR-0035）
//    C16  active な UC / REQ が参照する BR が定義されていて active か（C4 の逆方向）
//    C17  active な UC の「状態 × イベント表」「例外系の走査」に現れる REQ と、その UC に属する REQ が 1 対 1 に対応し、1 件以上あるか（R-404）
//    C18  active な GOAL の actor / origin と active な UC の actor が、docs.overview のアクター表と KPI の表に定義されているか（ADR-0052 / ADR-0076）
//    C20  active な NFR が、保留でないテストの @covers NFR-nnn か measured_by（docs.* で宣言した文書の外のファイルで、中に ID が現れる）を持つか（ADR-0054）
//    C22  active な BR が、active な REQ の br: から参照されているか、保留でないテストから @covers BR-nnn されているか（規則を確かめるテストに辿れること）
//    C24  撤回されていない契約があるとき、共有語彙（docs.shared）の全エラーコードがどれかの契約の errors で使われているか（C7 の逆方向）
//    C25  active な UC / REQ の本文が使う用語集（docs.glossary）の用語のコード識別子が、ソース（とスキーマ）のコメント以外に存在するか
//    C26  宣言と義務の矛盾: 義務がある範囲の none、範囲・印の一致 0 件、active な UC があるときの固定パスの不在
//
//  使い方:
//    harness lint refs [--root .] [--config harness.config.json] [--as-active]   検査（違反が 1 件でもあれば FAIL）
//                                                                  --as-active は draft の文書を active とみなす（spec-author の自己検査）
//    harness lint refs --only C9,C12                               指定の検査項目だけ判定（producer の自己検査用。部分検査と出力する）
//
//  終了コード: 0 = 違反なし / 1 = 違反あり / 2 = 使い方・設定エラー
//

import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { isGlob } from "../_shared/glob.mjs";
import { isMap } from "../_shared/strict-yaml.mjs";
import {
	CHECK_IDS,
	ConfigError,
	Corpus,
	DB_ENFORCED_RE,
	DEFAULTS,
	DOC_PATHS,
	HASH_HINT,
	POLICY_HEADING,
	RETIRED_CHECKS,
	actorKinds,
	checkContractConformance,
	checkLayering,
	collectDefinitions,
	commentJudge,
	compile,
	configError,
	declared,
	glossaryEntries,
	idsIn,
	isHumanActor,
	isNone,
	isPlaceholder,
	iterFiles,
	loadDocs,
	lookup,
	openProject,
	p,
	pendingHint,
	read,
	readContracts,
	referencedIds,
	rel,
	scanTests,
	schemaFiles,
	sharedErrorCodes,
	stripHtmlComments,
	tableSections,
	textOf,
	usage,
	useCommandName,
	overviewKpis,
} from "../_shared/refs.mjs";

const NAME = "lint refs";
useCommandName(NAME);

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
	for (const k of ["docs.overview", "docs.glossary", "docs.shared"]) {
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
	//  （docs.overview が none のときは参照の有無を C26 が見る）
	const ovRel = declared(cfg.docs.overview) ? cfg.docs.overview : null;
	const actors = ovRel ? new Set(Object.keys(kinds)) : null;
	const kpis = ovRel ? overviewKpis(cfg) : null;
	let actorRefs = 0;
	let kpiRefs = 0;
	for (const goal of Object.keys(corpus.goals).sort()) {
		const g = corpus.goals[goal];
		if (g.status !== "active") continue;
		actorRefs += values(g.actor).length;
		kpiRefs += values(g.origin).length;
		if (actors) for (const a of values(g.actor)) if (!actors.has(a)) fail("C18", `${goal} の actor ${a} が ${ovRel} のアクター表に無い`);
		if (kpis) for (const k of values(g.origin)) if (!kpis.has(k)) fail("C18", `${goal} の origin ${k} が ${ovRel} の KPI の表（成功の定義）に無い`);
	}
	for (const uid of activeUcs) {
		actorRefs += values(corpus.ucs[uid].actor).length;
		if (actors) for (const a of values(corpus.ucs[uid].actor)) if (!actors.has(a)) fail("C18", `${uid} の actor ${a} が ${ovRel} のアクター表に無い`);
	}

	//  C20: active な NFR は検証の所在（保留でないテストの @covers NFR-nnn か、measured_by）を持つ。
	//  measured_by は docs で宣言した文書（goals / rules / nfr / adr、verification_deferred、shared、overview、
	//  glossary など docs.* のすべて）の外のファイルで、中にその NFR の ID が現れること（計測の所在を ID で辿る）
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
	//  coverage は lint coverage が読むキーだが、「要件があるのに確かめていない」ことは義務としてここで止める（省略も none と同じに扱う）。
	//  記録のファイルを指していない宣言（null、文字列、{}、report の無いオブジェクト）も、確かめる記録が決まらないので同じに扱う。
	//  report より先の中身（not_run、scope、functions）は lint coverage が読む
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
				`coverage ${what}（active な REQ があり、source を宣言している）。テストのコマンドが書き出す実行の記録を { "report": "<lcov のファイル>", "not_run": [] } で宣言する（tools/lint-coverage/README.md。実装と仕様の対応を、実行の記録で確かめる）` +
					(isNone(cov) ? `（none の理由: ${cov.none}）` : ""),
			);
	}
	oblige(humanUcs.length, "人間がアクターの active な UC がある", ["tests", "tests.system", "tests.system.pending_pattern"]);
	oblige(activeUcs.length, "active な UC がある", ["docs.glossary"]);
	oblige(fixedOwned.some((o) => o.direction === "inbound"), "fixed 契約に owned かつ inbound の操作がある", ["source"]);
	oblige(fixedOwned.some((o) => o.codes.length), "fixed 契約の owned の操作に errors がある", ["contract"]);
	oblige(liveContracts.some((c) => c.codes.length), "撤回されていない契約に errors がある", ["contract", "docs.shared"]);
	oblige(dbBrs.length, "enforced_at が database の active な BR がある", ["schema", "tests", "tests.pending_pattern"]);
	oblige(actorRefs, "active な GOAL / UC が ACT-nn を持つ", ["docs.overview"]);
	oblige(kpiRefs, "active な GOAL が KPI-nn を持つ", ["docs.overview"]);
	//  GOAL のフォルダは概要の行が定義する。フォルダがあるのに none なら C9 が違反にするので、ここでは義務として名前を出す
	oblige(Object.keys(corpus.ucs).length, "GOAL のフォルダ（UC）がある", ["docs.overview"]);
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
	for (const k of [...DOC_PATHS, "docs.overview", "docs.glossary", "docs.shared"]) if (!isNone(lookup(cfg, k))) addPaths(k, lookup(cfg, k));
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
		lines.push("-".repeat(68), ` ${goal} [${g.status}] (${g.dir ? `${basename(g.dir)}/` : "フォルダなし"})`);
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

//  ---- 引数と main ---------------------------------------------------------------

function parseArgs(argv) {
	const opts = { root: ".", config: null, only: null, asActive: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const value = () => (i + 1 < argv.length ? argv[++i] : usage(`${a} には値が要る`));
		if (a === "--root") opts.root = value();
		else if (a === "--config") opts.config = value();
		else if (a === "--update-baseline" || a === "--strict") usage(`${a} は廃止した（baseline を持たず、常にすべての違反で失敗する。ADR-0056）`);
		else if (a === "--as-active") opts.asActive = true;
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
	const { root, cfg, decl, declError } = openProject(opts);
	if (decl.errors.length) return declError();

	let result;
	try {
		result = runChecks(cfg, { asActive: opts.asActive });
	} catch (e) {
		//  設定の誤り以外の例外も exit 2（「違反あり」の 1 と区別する）
		console.error(e instanceof ConfigError ? `${NAME}: 設定エラー: ${e.message}` : `${NAME}: 内部エラー: ${e.stack || e}`);
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
