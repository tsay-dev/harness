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
//  判定規則（上から順に最初に当たったもの。パスの比較は大文字小文字を無視する）:
//    - .harness-gate/ 配下 → ブロック（exit 2）。ログと stop-gate の状態はフック自身だけが書く。
//    - 検査の範囲・検査器・hook の設定 → 止めずに人間の承認を求める（permissionDecision: "ask"、ADR-0057）。
//        **/traceconfig.json（reason: traceconfig）、.harness/**（harness）、
//        .claude/settings*.json と .codex / .cursor / .grok / .agents 直下の設定（プロジェクト外のユーザー設定を含む。hook-settings）、
//        .github/workflows/**（workflow）。パスは大文字小文字を無視して比べる。
//      書き換えれば検査を外せるため。
//    - docs 配下 → 許可。ただし frontmatter の status: / 契約の x-status: が変わる書き込みは次のとおり:
//        降格（active → draft / withdrawn、fixed → draft、living / frozen → draft / withdrawn）→ ask（status-down）
//        UC.md の active と契約の fixed への昇格（新規作成を含む）→ ask（status-up-gate）。実装着手ゲートを agent が自力で開けない
//        アクター表で人間のアクターを削除する・種別をシステムに変える、active な UC の actor を変える → ask（actor-kind）。判定中の例外 → ask（status-down）
//        それ以外の昇格と新規作成 → 許可し pass / status-up と記録
//      status が変わらない書き込みは記録せずに許可。SSOT を書く行為はゲートの前提なので止めない。
//    - .claude 等のプロバイダー出力・--code 非マッチ・--exclude マッチ → 許可（exit 0）。
//    - 実装コードへの書き込みで、
//        docs/goals が無い / phase=実装|検証 の UC が無い /
//        該当 UC が active でない / draft の REQ がある / 契約が無い・fixed でない
//      → ブロック（exit 2）。ここは fail-closed（ゲートの存在意義）で、判定中の例外もブロックする。
//    - stdin が解釈できない等の入口の不具合、--code 一致より前の例外 → 許可（exit 0）。フック自身の不具合で
//      セッションを壊さない（ゲートは spec-lint gate と §2 自己確認が二重に守る）。
//
//  却下ログ:
//    ゲート判定に達した書き込み（docs の status の変更を除く docs / provider dir / --exclude / --code 非マッチを除く）
//    は結果を問わず 1 行ずつ .harness-gate/log.jsonl に記録する（gate-log.mjs）。
//    母数＝ゲートされた書き込み、なので「ブロック率」がそのまま読める。
//    reason 語彙: misconfig | no-goals | no-active-phase | uc-not-active | req-draft |
//                 contract-missing | contract-not-fixed | internal-error | ok（実装ゲート）、
//                 harness-gate（block）、traceconfig | harness | hook-settings | workflow |
//                 status-down | status-up-gate | actor-kind（ask）、status-up（pass）
//
//  設定はフックコマンドの引数で渡す（設定ファイルを増やさない。submodule 配置でも
//  取り込み先の settings.local.json に閉じる）:
//    node tools/gate-hook/gate-hook.mjs --code 'src/**' [--code ...]
//         [--exclude 'skeleton/**' ...] [--docs docs] [--log .harness-gate/log.jsonl]
//
//  使い方・設置手順・制約は同梱 README.md を参照。

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseFrontmatter } from "../_shared/frontmatter.mjs";
import { matchesAny } from "../_shared/glob.mjs";
import { isMap, parseStrictYaml } from "../_shared/strict-yaml.mjs";
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

//  ---- docs パーサ（spec-lint / trace-check と同じ規約: frontmatter が SSOT） -------

const fm = (text) => parseFrontmatter(text).data;

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
			const d = fm(readFileSync(ufile, "utf8"));
			ucs.push({ id: d.id || basename(udir).match(/^UC-\d+/)?.[0] || basename(udir), dir: udir, status: d.status || null, phase: d.phase || null });
		}
	}
	return ucs;
}

function draftReqs(dir) {
	return readdirSync(dir)
		.filter((n) => /^REQ-\d+\.md$/.test(n))
		.filter((n) => {
			const s = fm(readFileSync(join(dir, n), "utf8")).status;
			return !s || s === "draft";
		})
		.map((n) => n.replace(/\.md$/, ""));
}

//  契約（境界契約 yaml）の x-status。読み方は tools/_shared/strict-yaml.mjs（spec-lint / trace-check / contract-run と同じ）。
//  行スキャンで読むと `x-status : fixed` のような書き方を他のツールと別の値に読み、fixed への昇格が承認を通らない
const xStatus = (text) => {
	const root = parseStrictYaml(text).root;
	const v = isMap(root) ? root["x-status"] : undefined;
	return v === undefined || v === null ? null : String(v);
};

function contractStatus(dir) {
	const p = join(dir, "contract.yaml");
	if (!existsSync(p)) return null;
	return { status: xStatus(readFileSync(p, "utf8")) };
}

//  ---- docs の status の変更 --------------------------------------------------

//  義務を生む status（active な文書・fixed な契約・単一文書の living / frozen）
const HIGH = new Set(["active", "fixed", "living", "frozen"]);

//  書き込み後の内容。分からなければ undefined（NotebookEdit、Edit の old_string が無い等。ツール側が失敗する）
function afterContent(input, before) {
	if (typeof input.content === "string") return input.content; //  Write
	const edits = Array.isArray(input.edits) ? input.edits : typeof input.old_string === "string" ? [input] : null; //  MultiEdit / Edit
	if (!edits) return undefined;
	let text = before ?? "";
	for (const e of edits) {
		if (typeof e?.old_string !== "string" || typeof e?.new_string !== "string") return undefined;
		if (e.old_string === "") {
			if (before !== null) return undefined; //  既存ファイルへの空の old_string は Edit が受け付けない
			text = e.new_string;
			continue;
		}
		if (!text.includes(e.old_string)) return undefined;
		text = e.replace_all ? text.split(e.old_string).join(e.new_string) : text.replace(e.old_string, () => e.new_string);
	}
	return text;
}

//  文書の status。契約（yaml）は x-status、それ以外は frontmatter の status（引用符は外さない。trace-check と同じ値で比べ、
//  "active" のように引用符を付けた値は語彙の外 ＝ 義務の無い値として扱う）
const statusOf = (rel, text) => {
	if (text === null) return null;
	const v = /\.ya?ml$/i.test(rel) ? xStatus(text) : fm(text).status;
	return v || null;
};

//  アクター表の種別（ACT-nn -> 種別）。人間でないと数えるのは「システム」で始まる種別だけ（trace-check C15 / C26）
function actorKinds(text) {
	const kinds = {};
	for (const line of (text ?? "").split(/\r?\n/)) {
		const cells = line.split("|").map((c) => c.trim());
		if (cells.length >= 4 && /^ACT-\d+$/.test(cells[1])) kinds[cells[1]] = cells[3];
	}
	return kinds;
}

//  人間のアクターを消す・システムに変える書き込み（シナリオテストの義務を減らす）。戻り: 変わる ACT の一覧
function actorDowngrades(abs, input) {
	const before = existsSync(abs) && statSync(abs).isFile() ? readFileSync(abs, "utf8") : null;
	if (before === null) return [];
	const after = afterContent(input, before);
	if (after === undefined) return [];
	const a = actorKinds(before);
	const b = actorKinds(after);
	return Object.keys(a).filter((id) => !a[id].startsWith("システム") && (!(id in b) || b[id].startsWith("システム")));
}

//  active な UC の actor を書き換える（人間のアクターをシステムに替えれば C15 の義務が消える）。戻り: [旧, 新] | null
function ucActorChange(abs, rel, input) {
	if (basename(rel).toLowerCase() !== "uc.md" || !existsSync(abs)) return null;
	const before = readFileSync(abs, "utf8");
	const after = afterContent(input, before);
	if (after === undefined) return null;
	const a = fm(before);
	const b = fm(after);
	return a.status === "active" && (a.actor ?? "") !== (b.actor ?? "") ? [a.actor ?? "（なし）", b.actor ?? "（なし）"] : null;
}

//  アクター表のパス（traceconfig の docs.actors。無ければテンプレートの既定）
function actorsPath(root, docsDir) {
	try {
		const cfg = JSON.parse(readFileSync(join(root, "traceconfig.json"), "utf8"));
		if (typeof cfg?.docs?.actors === "string") return cfg.docs.actors.replace(/^\.\//, "");
	} catch {}
	return `${docsDir}/02-actors.md`;
}

//  docs への書き込みの status の変化を分類する。戻り: null（変化なし・判定不能）| { kind, from, to, field }
//    kind: "down"（ask）| "up-gate"（ask）| "up"（記録して許可）
function classifyStatusChange(abs, rel, input) {
	const exists = existsSync(abs) && statSync(abs).isFile();
	const before = exists ? readFileSync(abs, "utf8") : null;
	const after = afterContent(input, before);
	if (after === undefined) return null;
	const from = statusOf(rel, before);
	const to = statusOf(rel, after);
	const isContract = /\.ya?ml$/i.test(rel);
	const field = isContract ? "x-status" : "status";
	if (exists && from === to) return null;
	if (!exists && to === null) return null; //  status を持たない新規ファイル（メモ等）

	//  義務を生む値から、それ以外（draft / withdrawn、行の削除、語彙の外の値）への変更は降格
	if (HIGH.has(from) && !HIGH.has(to)) return { kind: "down", from, to, field, isNew: !exists };
	const gated = (isContract && to === "fixed") || (basename(rel).toLowerCase() === "uc.md" && to === "active");
	if (!HIGH.has(from) && HIGH.has(to)) return { kind: gated ? "up-gate" : "up", from, to, field, isNew: !exists };
	if (!exists) return { kind: "up", from, to, field, isNew: true }; //  新規作成（draft 等）
	return null; //  義務の増減を伴わない変更（draft ↔ withdrawn、living ↔ frozen、ADR の語彙など）
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

//  止めずに人間の承認を求める（exit 0 + permissionDecision: "ask"）
function ask(reason, message, ctx) {
	log("ask", reason, ctx);
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "ask",
				permissionDecisionReason: `[gate-hook] ${message}`,
			},
		}) + "\n",
	);
	process.exit(0);
}

//  検査の範囲・検査器・hook の設定（書き換えれば検査を外せる）。戻り: { reason, message } | null
//  ホストの hook 設定（Claude Code の settings*.json と、他プロバイダーのディレクトリ直下の設定）。プロジェクトの外（~/.claude 等）も含む
const HOOK_SETTINGS_RE = /(^|\/)\.claude\/settings[^/]*\.json$|(^|\/)\.(?:codex|cursor|grok|agents)\/[^/]*\.(?:json|toml)$/;

function guardedTarget(rel) {
	const p = rel.toLowerCase();
	if (p === "traceconfig.json" || p.endsWith("/traceconfig.json"))
		return {
			reason: "traceconfig",
			message: `${rel} は検査の範囲（none の宣言、注釈の正規表現、commands）を決めるため、人間の承認で変える（ADR-0057）。差分を確認してから許可する`,
		};
	if (p.startsWith(".harness/"))
		return { reason: "harness", message: `${rel} は検査器（harness）そのもの。書き換えれば検査を外せるため、人間の承認で変える（ADR-0057）` };
	if (HOOK_SETTINGS_RE.test(p))
		return { reason: "hook-settings", message: `${rel} は gate-hook / stop-gate を有効にする hook の設定。書き換えればゲートを外せるため、人間の承認で変える（ADR-0057）` };
	if (p.startsWith(".github/workflows/"))
		return { reason: "workflow", message: `${rel} は CI の検査（spec-gate）を呼ぶ workflow。書き換えれば CI の検査を外せるため、人間の承認で変える（ADR-0057）` };
	return null;
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

	//  --code に一致した後（実装コードへの書き込みの判定中）の例外は fail-closed。それより前は fail-open
	let gating = false;
	try {
		const input = payload.tool_input || {};
		const target = input.file_path || input.notebook_path;
		if (!target) process.exit(0);

		const abs = isAbsolute(target) ? target : resolve(root, target);
		const rel = relative(root, abs).split(sep).join("/");
		if (rel.startsWith("..")) {
			//  プロジェクト外（scratchpad 等）は対象外。ただしユーザー設定の hook（~/.claude/settings.json 等）はゲートを外せる
			const absPath = abs.split(sep).join("/");
			if (HOOK_SETTINGS_RE.test(absPath.toLowerCase())) {
				ctx.target = absPath;
				ask("hook-settings", `${absPath} は hook の設定。書き換えれば gate-hook / stop-gate を外せるため、人間の承認で変える（ADR-0057）`, ctx);
			}
			process.exit(0);
		}
		//  パスは大文字小文字を無視して比べる（大文字小文字を区別しないファイルシステムで Docs/ や Src/ から書けば素通りしないように）
		const lower = rel.toLowerCase();

		//  ログと stop-gate の状態はフック自身だけが書く。agent が書き換えれば合格の記録を偽れる
		if (lower === ".harness-gate" || lower.startsWith(".harness-gate/")) {
			ctx.target = rel;
			log("block", "harness-gate", ctx);
			process.stderr.write(
				`[gate-hook] ${rel}: .harness-gate/ はゲートのログと状態の置き場で、書くのはフック自身だけ。Write / Edit で書かない\n`,
			);
			process.exit(2);
		}

		//  検査の範囲・検査器・hook の設定は、人間の承認だけで変える（ADR-0057）
		const guarded = guardedTarget(rel);
		if (guarded) {
			ctx.target = rel;
			ask(guarded.reason, guarded.message, ctx);
		}

		//  SSOT は常に通す（ゲートを通すための行為を塞がない）。ただし status の変更は義務の増減なので扱いを分ける
		const docsDir = opts.docs.replace(/\/+$/, "");
		const docsLower = docsDir.toLowerCase();
		if (lower === docsLower || lower.startsWith(docsLower + "/")) {
			ctx.target = rel;
			let change;
			let downgraded = [];
			try {
				change = classifyStatusChange(abs, rel, input);
				if (lower === actorsPath(root, docsDir).toLowerCase()) downgraded = actorDowngrades(abs, input);
				const actor = ucActorChange(abs, rel, input);
				if (actor) downgraded = [`${rel} の actor ${actor[0]} → ${actor[1]}`];
			} catch (e) {
				//  判定できない docs の書き込みは承認に回す（黙って通すと降格の承認を外せる）
				ask("status-down", `${rel} の status の変化を判定できない（${e?.message ?? e}）。差分を確認してから許可する`, ctx);
			}
			if (downgraded.length)
				ask(
					"actor-kind",
					`${rel} で人間のアクター（${downgraded.join(", ")}）を削除するかシステムに変える。シナリオテスト（C15）の義務が減るため、人間の承認で行う（ADR-0057）`,
					ctx,
				);
			if (!change) process.exit(0); //  status が変わらない docs の書き込みは記録しない
			const what = `${rel} の ${change.field} を ${change.isNew ? "（新規）" : change.from ?? "（なし）"} → ${change.to ?? "（なし）"} に変える`;
			if (change.kind === "down")
				ask(
					"status-down",
					`${what}。降格は検査の義務（注釈・テスト・入口）を減らすため、人間の承認で行う（ADR-0057）。差分と理由を確認してから許可する`,
					ctx,
				);
			if (change.kind === "up-gate")
				ask(
					"status-up-gate",
					`${what}。UC の active と契約の fixed は実装着手ゲート（develop §2）を開ける人間ゲートで、agent が自力で開けない（ADR-0057）。内容を確認してから許可する`,
					ctx,
				);
			log("pass", "status-up", ctx);
			process.exit(0);
		}

		//  プロバイダー出力・APM の取り込み先（生成物。ゲートの対象外）。記録しない（母数＝ゲートされた書き込み）
		if ([".claude/", ".agents/", ".codex/", ".cursor/", ".grok/", "apm_modules/"].some((prefix) => lower.startsWith(prefix))) process.exit(0);

		const nocase = (globs) => globs.map((g) => g.toLowerCase());
		if (matchesAny(lower, nocase(opts.exclude))) process.exit(0);
		if (!matchesAny(lower, nocase(opts.code))) process.exit(0);

		//  ---- ここから実装コードへの書き込み: UC.md の工程で §2 を検証（fail-closed） ----
		gating = true;
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
	} catch (e) {
		if (!gating) process.exit(0); //  ゲート判定に入る前の不具合 → fail-open
		//  実装コードへの書き込みを判定できない → fail-closed（判定できないまま通すとゲートが無いのと同じ）
		log("block", "internal-error", ctx);
		process.stderr.write(`[gate-hook] 実装着手ゲートを判定できないため、この書き込みをブロックしました（内部エラー: ${e?.message ?? e}）。docs/goals の構造を確認すること\n`);
		process.exit(2);
	}
}

main();
