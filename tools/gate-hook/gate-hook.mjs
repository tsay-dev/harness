#!/usr/bin/env node
//  gate-hook — §2 実装着手ゲートの機械強制（PreToolUse フック）
//
//  develop skill §2 は「UC / REQ が active になり契約が fixed になる前に実装コードを書くな」
//  という停止線だが、それ自体は説得的制御（AI が読み飛ばせば止まらない）。spec-lint の
//  gate も commit 時にしか発火しない事後チェックである。本フックはその停止線を
//  Write / Edit の直前で発火する構造的強制に変える。
//
//  仕組み:
//    Claude Code の PreToolUse フックとして起動され、stdin の JSON から書き込み
//    対象パスを取り出す。対象が「実装コード」（--code glob にマッチ）なら、
//    docs/goals/**/UC-*/UC.md の frontmatter phase:（工程台帳）を読み、実装中
//    （phase=実装|検証）の全 UC について UC active / 全 REQ が draft でない / 契約 fixed を
//    検証する。欠けていれば exit 2 でツール実行そのものをブロックし、stderr の理由が
//    AI に差し戻される。
//
//  判定規則（fail-open / fail-closed の境界）:
//    - docs 配下・.claude 配下・--code 非マッチ・--exclude マッチ → 許可（exit 0）。
//      SSOT を書く行為はゲートの前提なので docs は常に通す。
//    - 実装コードへの書き込みで、
//        docs/goals が無い / phase=実装|検証 の UC が無い /
//        該当 UC が active でない / draft の REQ がある / 契約が無い・fixed でない
//      → ブロック（exit 2）。ここは fail-closed（ゲートの存在意義）。
//    - stdin が解釈できない等の内部エラー → 許可（exit 0）。フック自身の不具合で
//      セッションを壊さない（ゲートは spec-lint gate と §2 自己確認が二重に守る）。
//
//  却下ログ:
//    ゲート判定に達した書き込み（docs / provider dir / --exclude / --code 非マッチを除く）
//    は結果を問わず 1 行ずつ .harness-gate/log.jsonl に記録する（gate-log.mjs）。
//    母数＝ゲートされた書き込み、なので「ブロック率」がそのまま読める。
//    reason 語彙: misconfig | no-goals | no-active-phase | uc-not-active | req-draft |
//                 contract-missing | contract-not-fixed | ok
//
//  設定はフックコマンドの引数で渡す（設定ファイルを増やさない。submodule 配置でも
//  取り込み先の settings.local.json に閉じる）:
//    node tools/gate-hook/gate-hook.mjs --code 'src/**' [--code ...]
//         [--exclude 'skeleton/**' ...] [--docs docs] [--log .harness-gate/log.jsonl]
//
//  使い方・設置手順・制約は同梱 README.md を参照。

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { appendLog, defaultLogPath } from "./gate-log.mjs";

//  ---- 引数 ----------------------------------------------------------------

function parseArgs(argv) {
	//  log は root 確定後に既定値を解決する（null = 既定）
	const opts = { code: [], exclude: [], docs: "docs", log: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--code") opts.code.push(argv[++i]);
		else if (a === "--exclude") opts.exclude.push(argv[++i]);
		else if (a === "--docs") opts.docs = argv[++i];
		else if (a === "--log") opts.log = argv[++i];
	}
	return opts;
}

//  ---- glob（依存ゼロの最小実装: ** / * / ? のみ） --------------------------

function globToRegExp(glob) {
	let re = "";
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === "*") {
			if (glob[i + 1] === "*") {
				//  "**/" は 0 階層以上、行末の "**" は残り全部
				if (glob[i + 2] === "/") {
					re += "(?:.*/)?";
					i += 2;
				} else {
					re += ".*";
					i += 1;
				}
			} else re += "[^/]*";
		} else if (c === "?") re += "[^/]";
		else if ("\\^$.|+()[]{}".includes(c)) re += "\\" + c;
		else re += c;
	}
	return new RegExp("^" + re + "$");
}

function matchesAny(relPath, globs) {
	return globs.some((g) => globToRegExp(g).test(relPath));
}

//  ---- docs パーサ（spec-lint / trace-check と同じ規約: frontmatter が SSOT） -------

function parseFrontmatter(text) {
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const data = {};
	if (m)
		for (const line of m[1].split(/\r?\n/)) {
			const kv = line.match(/^([^:#]+):\s*(.*)$/);
			if (kv) data[kv[1].trim()] = kv[2].trim().split(/\s+#/)[0].trim();
		}
	return data;
}

const ACTIVE_PHASES = new Set(["実装", "検証"]);

const listDirs = (dir) =>
	existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(dir, d.name)).sort() : [];

//  docs/goals/**/UC-*/UC.md を全部読む（工程台帳は UC.md の phase: / R-1003 で台帳ファイルは持たない）
function collectUcs(goalsRoot) {
	const ucs = [];
	for (const gdir of listDirs(goalsRoot)) {
		if (basename(gdir).startsWith("_") || basename(gdir).startsWith(".")) continue;
		for (const udir of listDirs(gdir)) {
			const ufile = join(udir, "UC.md");
			if (!existsSync(ufile)) continue;
			const fm = parseFrontmatter(readFileSync(ufile, "utf8"));
			ucs.push({ id: fm.id || basename(udir).match(/^UC-\d+/)?.[0] || basename(udir), dir: udir, status: fm.status || null, phase: fm.phase || null });
		}
	}
	return ucs;
}

function draftReqs(dir) {
	return readdirSync(dir)
		.filter((n) => /^REQ-\d+\.md$/.test(n))
		.filter((n) => {
			const s = parseFrontmatter(readFileSync(join(dir, n), "utf8")).status;
			return !s || s === "draft";
		})
		.map((n) => n.replace(/\.md$/, ""));
}

//  契約（境界契約 yaml）の x-status をトップレベル行スキャンで読む
function contractStatus(dir) {
	const p = join(dir, "contract.yaml");
	if (!existsSync(p)) return null;
	const m = readFileSync(p, "utf8").match(/^x-status:\s*([\w-]+)/m);
	return { status: m ? m[1] : null };
}

//  ---- 本体 ----------------------------------------------------------------

//  判定 1 件をログへ（ctx: logPath / session / target / uc / startedAt）
function log(decision, reason, ctx) {
	appendLog(ctx.logPath, {
		ts: new Date().toISOString(),
		hook: "gate-hook",
		event: "PreToolUse",
		session: ctx.session ?? null,
		decision,
		reason,
		target: ctx.target ?? null,
		uc: ctx.uc ?? null,
		round: null,
		failures: null,
		ms: Date.now() - ctx.startedAt,
	});
}

function block(reason, lines, ctx) {
	//  exit 2: PreToolUse のブロック。stderr がそのまま AI に差し戻される。
	//  ログを先に書く（stderr / exit の後には何も実行されない）。
	log("block", reason, ctx);
	process.stderr.write(
		[
			"[gate-hook] 実装着手ゲート（develop skill §2）によりこの書き込みをブロックしました。",
			...lines,
			"コードでなく SSOT を先に整えること（§2 の分岐表に従い Phase 1 / Phase 3 へ）。",
		].join("\n") + "\n",
	);
	process.exit(2);
}

function main() {
	const startedAt = Date.now();
	const opts = parseArgs(process.argv.slice(2));

	//  stdin は先に読むが、解釈できなくても設置ミスの警告は出す（root / session を取るためだけに読む）
	let payload = null;
	try {
		payload = JSON.parse(readFileSync(0, "utf8"));
	} catch {
		payload = null;
	}

	const root = process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();
	const logPath = opts.log ? resolve(root, opts.log) : defaultLogPath(root);
	const ctx = { logPath, session: payload?.session_id ?? null, target: null, uc: null, startedAt };

	if (opts.code.length === 0) {
		//  有効化したのに対象 glob が無いのは設置ミス。ブロックはせず人間にだけ警告
		//  （exit 1: 非ブロッキングエラー。stderr はユーザー向け表示に載る）。設置ミスも記録する。
		log("skip", "misconfig", ctx);
		process.stderr.write(
			"[gate-hook] --code が未指定のため何もゲートしません（settings の hook コマンドに --code 'src/**' 等を追加してください）\n",
		);
		process.exit(1);
	}

	if (!payload || typeof payload !== "object") process.exit(0); //  入力が解釈できない → フック都合でセッションを壊さない

	const input = payload.tool_input || {};
	const target = input.file_path || input.notebook_path;
	if (!target) process.exit(0);

	const abs = isAbsolute(target) ? target : resolve(root, target);
	const rel = relative(root, abs).split(sep).join("/");
	if (rel.startsWith("..")) process.exit(0); //  プロジェクト外（scratchpad 等）

	//  SSOT・harness 自身・trace 設定・ゲートのログ置き場は常に通す（ゲートを通すための行為を塞がない）。
	//  ここまでの exit 0 はゲート判定に達していないので記録しない（母数＝ゲートされた書き込み）。
	const docsDir = opts.docs.replace(/\/+$/, "");
	if (rel === docsDir || rel.startsWith(docsDir + "/")) process.exit(0);
	if ([".claude/", ".agents/", ".codex/", ".cursor/", ".grok/", "apm_modules/", ".harness/", ".harness-gate/"].some(prefix => rel.startsWith(prefix))) process.exit(0);
	if (rel === "traceconfig.json" || rel === ".trace-baseline.json") process.exit(0);

	if (matchesAny(rel, opts.exclude)) process.exit(0);
	if (!matchesAny(rel, opts.code)) process.exit(0);

	//  ---- ここから実装コードへの書き込み: UC.md の工程で §2 を検証（fail-closed） ----
	ctx.target = rel;

	const goalsRoot = join(root, docsDir, "goals");
	if (!existsSync(goalsRoot))
		block("no-goals", [`対象: ${rel}`, `${docsDir}/goals（GOAL → UC → REQ の SSOT）が存在しない。§2 判定条件 1 を満たせません。`], ctx);

	const active = collectUcs(goalsRoot).filter((u) => u.phase && ACTIVE_PHASES.has(u.phase));
	ctx.uc = active.map((u) => u.id);
	if (active.length === 0)
		block(
			"no-active-phase",
			[
				`対象: ${rel}`,
				`phase=実装（または 検証）の UC が ${docsDir}/goals 配下にありません。`,
				"実装に入る UC の UC / REQ を active、契約を fixed にしたうえで、orchestrator が UC.md の phase: を「実装」へ更新してから書くこと。",
			],
			ctx,
		);

	//  複数の未充足があっても reason は最初に見つかった種類 1 つ（ログの語彙を閉じる）
	const problems = [];
	let reason = null;
	const found = (r) => (reason ??= r);
	for (const u of active) {
		if (u.status !== "active") {
			found("uc-not-active");
			problems.push(`${u.id}: UC が active でない（現在 ${u.status ?? "不明"}）→ Phase 1`);
		}
		const drafts = draftReqs(u.dir);
		if (drafts.length > 0) {
			found("req-draft");
			problems.push(`${u.id}: draft の REQ がある（${drafts.join(", ")}）→ Phase 1`);
		}
		const contract = contractStatus(u.dir);
		if (!contract) {
			found("contract-missing");
			problems.push(`${u.id}: 契約（${basename(u.dir)}/contract.yaml）が存在しない → Phase 3`);
		} else if (contract.status !== "fixed") {
			found("contract-not-fixed");
			problems.push(`${u.id}: 契約が fixed でない（現在 ${contract.status ?? "不明"}）→ 契約を先に fixed にする（spec-lint が緑で、reviewer を起動した場合は阻止ゼロの後に orchestrator が行う）`);
		}
	}
	if (problems.length > 0)
		block(reason, [`対象: ${rel}`, `実装中（phase=実装|検証）の UC に未充足があります:`, ...problems.map((p) => "  - " + p)], ctx);

	log("pass", "ok", ctx);
	process.exit(0);
}

main();
