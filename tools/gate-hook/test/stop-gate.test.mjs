//  stop-gate（Stop フック）の回帰検証。一時ディレクトリに git リポジトリを組み、Stop の stdin を模擬する。
//  spec-lint / trace-check / contract-run は、引数を記録して終わるだけのスタブ（STOP_GATE_TOOLS_DIR）に差し替え、
//  stop-gate 自身の振る舞い（順序・引数・指紋・commands の宣言・monorepo）を固定する。
//  実際のツールとの結合は最後のテストで確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, "..", "stop-gate.mjs");
const GATE_LOG = join(HERE, "..", "gate-log.mjs");
const TEMPLATE = join(HERE, "..", "..", "..", "templates", "develop", "harness.config.json");

const NONE = { none: "テストでは使わない" };
//  4 キーとも宣言した commands（上書きして使う）
const cmds = (over = {}) => ({ typecheck: NONE, lint: NONE, test: "exit 0", system: NONE, ...over });

//  ---- スタブのツール --------------------------------------------------------

const STUB = `import { appendFileSync } from "node:fs";
import { basename } from "node:path";
const name = basename(process.argv[1], ".mjs");
appendFileSync(process.env.STUB_LOG, JSON.stringify({ name, args: process.argv.slice(2) }) + "\\n");
if ((process.env.STUB_FAIL || "").split(",").includes(name)) { console.log(name + " red"); process.exit(1); }
`;

function makeTools(t) {
	const dir = mkdtempSync(join(tmpdir(), "harness stop-gate tools "));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	for (const n of ["config-lint", "spec-lint", "trace-check", "exec-check", "contract-run"]) {
		mkdirSync(join(dir, n), { recursive: true });
		writeFileSync(join(dir, n, `${n}.mjs`), STUB);
	}
	mkdirSync(join(dir, "_shared"), { recursive: true });
	writeFileSync(join(dir, "_shared", "glob.mjs"), "export const v = 1;\n");
	return dir;
}

//  ---- 利用プロジェクト --------------------------------------------------------

function git(root, ...args) {
	const r = spawnSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { encoding: "utf8" });
	assert.equal(r.status, 0, r.stderr);
	return r.stdout;
}

const writeConfig = (root, cfg) => writeFileSync(join(root, "harness.config.json"), typeof cfg === "string" ? cfg : JSON.stringify(cfg, null, 2) + "\n");

function makeRoot(t, cfg = { commands: cmds() }, { gitInit = true } = {}) {
	const root = mkdtempSync(join(tmpdir(), "harness stop-gate "));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, "docs", "goals"), { recursive: true });
	writeFileSync(join(root, "docs", "goals", ".gitkeep"), "");
	writeFileSync(join(root, "empty.txt"), "");
	if (cfg !== null) writeConfig(root, cfg);
	if (gitInit) {
		git(root, "init", "-q");
		git(root, "add", "-A");
		git(root, "commit", "-q", "-m", "init");
	}
	return root;
}

function runGate(root, payload, { args = [], tools = null, fail = "" } = {}) {
	const env = { ...process.env, CLAUDE_PROJECT_DIR: root, STUB_FAIL: fail };
	delete env.STOP_GATE_TOOLS_DIR;
	delete env.STUB_LOG;
	if (tools) Object.assign(env, { STOP_GATE_TOOLS_DIR: tools, STUB_LOG: join(tools, "calls.jsonl") });
	return spawnSync("node", [GATE, ...args], {
		input: typeof payload === "string" ? payload : JSON.stringify(payload),
		encoding: "utf8",
		env,
		timeout: 120000, //  検査が終わらなくなる壊れ方をしたとき、テストごと止まり続けないように
	});
}

//  スタブが記録した呼び出し（呼ぶたびに空にする）。記録はツールの置き場に置く（指紋の対象外）
function calls(tools) {
	const p = join(tools, "calls.jsonl");
	if (!existsSync(p)) return [];
	const out = readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
	rmSync(p);
	return out;
}

const readLog = (root) =>
	existsSync(join(root, ".harness-gate", "log.jsonl"))
		? readFileSync(join(root, ".harness-gate", "log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
		: [];
const last = (root) => readLog(root).at(-1);

const stop = (root, extra = {}) => ({ session_id: "s1", cwd: root, hook_event_name: "Stop", stop_hook_active: false, ...extra });

//  ---- テスト ----------------------------------------------------------------

test("stop-gate: 合格 → 変更なし skip → 不通過ブロック → ラウンド上限で release（systemMessage）→ 対象外イベント → 壊れた stdin", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t);
	const opt = { tools };

	//  (a) 全部通過。none は理由を表示して skip
	const a = runGate(root, stop(root), opt);
	assert.equal(a.status, 0, a.stderr + a.stdout);
	assert.match(a.stdout, /\[stop-gate\] 終端ゲート通過（7 検査、skip: typecheck, lint, system）/);
	assert.match(a.stdout, /skip: commands\.typecheck = none（テストでは使わない）/);
	assert.equal(last(root).decision, "pass");
	assert.equal(last(root).session, "s1");
	assert.equal(last(root).hook, "stop-gate");
	assert.equal(last(root).event, "Stop");
	const state = JSON.parse(readFileSync(join(root, ".harness-gate", "state.json"), "utf8"));
	assert.ok(state.last_pass.fingerprint);
	//  contract-run に --docs を渡す。spec-lint は docs、trace-check は root と config
	const c1 = calls(tools);
	//  exec-check は 2 回: 入口の検査（entry）と、test の後の実行の記録の検査（coverage）
	assert.deepEqual(c1.map((c) => c.name), ["config-lint", "spec-lint", "trace-check", "exec-check", "contract-run", "exec-check"]);
	assert.deepEqual(c1[3].args, ["entry", "--root", root, "--config", join(root, "harness.config.json")]);
	assert.deepEqual(c1[5].args.slice(0, 6), ["coverage", "--root", root, "--config", join(root, "harness.config.json"), "--since"]);
	assert.ok(Math.abs(Number(c1[5].args[6]) - Date.now()) < 60_000, "--since が test を始めた時刻になっていない");
	assert.deepEqual(c1[0].args, ["--config", join(root, "harness.config.json")]);
	assert.deepEqual(c1[1].args, ["validate", "--docs", join(root, "docs")]);
	assert.deepEqual(c1[2].args, ["--root", root, "--config", join(root, "harness.config.json")]);
	assert.deepEqual(c1[4].args, ["--root", root, "--config", join(root, "harness.config.json"), "--docs", join(root, "docs")]);

	//  (b) 同じ木で再度 Stop → 再検査しない（.harness-gate/ が増えても指紋は変わらない）
	const b = runGate(root, stop(root), opt);
	assert.equal(b.status, 0, b.stderr);
	assert.match(b.stdout, /\[stop-gate\] 変更なし/);
	assert.equal(last(root).decision, "skip");
	assert.equal(last(root).reason, "no-changes");
	assert.equal(calls(tools).length, 0);

	//  (b') --force は指紋を無視して検査する
	const bf = runGate(root, stop(root), { ...opt, args: ["--force"] });
	assert.equal(bf.status, 0, bf.stderr);
	assert.equal(last(root).decision, "pass");

	//  (c) test コマンドを失敗させる（tracked ファイルの変更 → 新しい指紋）
	writeConfig(root, { commands: cmds({ test: "echo boom; exit 1" }) });
	const c = runGate(root, stop(root), opt);
	assert.equal(c.status, 2, c.stdout);
	assert.match(c.stderr, /\[stop-gate\] 終端ゲート不通過（round 1\/2）: 失敗 = test/);
	assert.match(c.stderr, /  test: exit 1\n    boom/);
	//  直せない失敗は未達として報告して終える。harness.config.json を緩めて通さない
	assert.match(c.stderr, /直せる失敗は直し/);
	assert.match(c.stderr, /人間ゲート待ちや後続の担当の成果物でしか直せない失敗は、未達として報告して終える/);
	assert.match(c.stderr, /設定（harness\.config\.json）を緩めて（none にする、範囲を狭める）通さない/);
	assert.match(c.stderr, /保留にせず、人間に聞いて決める/);
	assert.doesNotMatch(c.stderr, /DEFERRED\.md/);
	assert.doesNotMatch(c.stderr, /失敗した検査だけを直し/);
	assert.equal(last(root).decision, "block");
	assert.equal(last(root).reason, "test");
	assert.deepEqual(last(root).failures, ["test"]);
	assert.equal(last(root).round, 1);

	//  (d) フック継続中（stop_hook_active）でラウンド上限 → ブロックせず人間へ。stdout は systemMessage の JSON だけ
	const d = runGate(root, stop(root, { stop_hook_active: true }), { ...opt, args: ["--max-rounds", "1"] });
	assert.equal(d.status, 0, d.stderr);
	const msg = JSON.parse(d.stdout);
	assert.deepEqual(Object.keys(msg), ["systemMessage"]);
	assert.match(msg.systemMessage, /終端ゲートが通らないまま解放した/);
	assert.match(msg.systemMessage, /失敗: test/);
	assert.equal(last(root).decision, "release");
	assert.equal(last(root).reason, "round-cap");
	assert.deepEqual(last(root).failures, ["test"]);

	//  (d') 別セッションならラウンドはリセットされ、通常どおりブロックする
	const d2 = runGate(root, stop(root, { session_id: "s2", stop_hook_active: true }), { ...opt, args: ["--max-rounds", "1"] });
	assert.equal(d2.status, 2, d2.stdout);
	assert.match(d2.stderr, /round 1\/1/);

	//  (e) Stop 以外のイベントは対象外
	const e = runGate(root, stop(root, { hook_event_name: "SubagentStop" }), opt);
	assert.equal(e.status, 0, e.stderr);
	assert.equal(last(root).decision, "skip");
	assert.equal(last(root).reason, "wrong-event");

	//  (f) 壊れた stdin → fail-open（入口の不具合）
	const f = runGate(root, "{not json", opt);
	assert.equal(f.status, 0, f.stderr);
	assert.equal(last(root).reason, "internal-error");

	//  (g) 不明な引数 → usage で exit 2
	const g = runGate(root, stop(root), { ...opt, args: ["--bogus"] });
	assert.equal(g.status, 2);
	assert.match(g.stderr, /usage:/);

	//  gate-log --summary のスモーク
	const s = spawnSync("node", [GATE_LOG, "--summary", "--log", join(root, ".harness-gate", "log.jsonl"), "--since", "1"], { encoding: "utf8" });
	assert.equal(s.status, 0, s.stderr);
	assert.match(s.stdout, /stop-gate: runs \d+ \/ block 2 \/ release 1 \/ skip/);
	assert.match(s.stdout, /gate-hook: gated 0 \/ block 0 \/ last block: なし \/ ask 0（config 0, harness 0, hook-settings 0, workflow 0, status-down 0, status-up-gate 0, actor-kind 0, deferred 0）\/ status-up 0/);
	assert.match(s.stdout, /降格候補/);
});

test("stop-gate: 指紋は未追跡ファイルの中身・harness.config.json・harness ツールの変更で変わる", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t);
	const opt = { tools };
	const pass = () => {
		const r = runGate(root, stop(root), opt);
		assert.equal(r.status, 0, r.stderr);
		assert.equal(last(root).decision, "pass", r.stdout);
	};
	const unchanged = () => {
		const r = runGate(root, stop(root), opt);
		assert.equal(r.status, 0, r.stderr);
		assert.equal(last(root).reason, "no-changes", r.stdout);
	};

	writeFileSync(join(root, "new.txt"), "a");
	pass();
	unchanged();
	//  未追跡ファイルの中身だけを変える（git status の行は同じ）→ 再検査
	writeFileSync(join(root, "new.txt"), "b");
	pass();
	unchanged();
	//  ignore された harness.config.json の中身を変える → 再検査
	writeFileSync(join(root, ".gitignore"), "harness.config.json\n");
	git(root, "rm", "-q", "--cached", "harness.config.json");
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "ignore");
	pass();
	unchanged();
	writeConfig(root, { commands: cmds({ test: "exit 0 # 変更" }) });
	pass();
	unchanged();
	//  harness ツール（_shared を含む）を変える → 再検査
	writeFileSync(join(tools, "_shared", "glob.mjs"), "export const v = 2;\n");
	pass();
	unchanged();
	writeFileSync(join(tools, "trace-check", "trace-check.mjs"), STUB + "// 変更\n");
	pass();
	unchanged();
});

test("stop-gate: commands の typecheck / lint / test / system は宣言か none が必須", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: { test: "exit 0" } }, { gitInit: false });
	const opt = { tools, args: ["--force"] };

	//  (a) 欠落はそれぞれ失敗の 1 項目。欠落より後の順序のコマンドは走らない
	const a = runGate(root, stop(root), opt);
	assert.equal(a.status, 2, a.stdout);
	assert.deepEqual(last(root).failures, ["commands.typecheck", "commands.lint", "commands.system"]);
	assert.match(a.stderr, /commands\.typecheck: 設定\n    commands\.typecheck が宣言されていない（無いなら none に理由を書く/);

	//  (b) commands ブロックが無い → 4 つとも失敗
	writeConfig(root, {});
	runGate(root, stop(root), opt);
	assert.deepEqual(last(root).failures, ["commands.typecheck", "commands.lint", "commands.test", "commands.system"]);

	//  (c) 文字列でない値・理由の無い none は失敗（例外にしない）
	writeConfig(root, { commands: cmds({ typecheck: 1, lint: { none: "" }, system: ["x"] }) });
	const c = runGate(root, stop(root), opt);
	assert.equal(c.status, 2, c.stdout);
	assert.deepEqual(last(root).failures, ["commands.typecheck", "commands.lint", "commands.system"]);
	assert.match(c.stderr, /commands\.typecheck は文字列のコマンドか \{ "none": "<理由>" \}（実際: 1）/);
	assert.match(c.stderr, /commands\.lint の none に理由が無い/);

	//  (d) tests を宣言しているなら commands.test は none にできない
	writeConfig(root, { tests: { dirs: ["tests"] }, commands: cmds({ test: NONE }) });
	const d = runGate(root, stop(root), opt);
	assert.equal(d.status, 2, d.stdout);
	assert.deepEqual(last(root).failures, ["commands.test"]);
	assert.match(d.stderr, /commands\.test は none にできない/);

	//  (e) tests が none なら commands.test も none でよい
	writeConfig(root, { tests: { none: "テストを持たない" }, commands: cmds({ test: NONE }) });
	const e = runGate(root, stop(root), opt);
	assert.equal(e.status, 0, e.stderr);
	assert.match(e.stdout, /終端ゲート通過（5 検査、skip: typecheck, lint, test, system）/);

	//  (f) harness.config.json の JSON 構文の誤りは例外でなく失敗の 1 項目
	writeConfig(root, "{ not json");
	const f = runGate(root, stop(root), opt);
	assert.equal(f.status, 2, f.stdout);
	assert.deepEqual(last(root).failures, ["config"]);
	assert.match(f.stderr, /JSON として読めない/);
	assert.equal(last(root).reason, "config");
});

test("stop-gate: commands.system は test の後に 1 回走り、test が赤なら走らない", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t);
	const opt = { tools };

	//  (a) test 緑 → system が走り、赤ならブロック（失敗は system）
	writeConfig(root, { commands: cmds({ test: "exit 0", system: "echo scenario-red; exit 1" }) });
	const a = runGate(root, stop(root), opt);
	assert.equal(a.status, 2, a.stdout);
	assert.match(a.stderr, /  system: exit 1\n    scenario-red/);
	assert.deepEqual(last(root).failures, ["system"]);

	//  (b) test 赤 → system は走らない（失敗は test だけ）
	writeConfig(root, { commands: cmds({ test: "exit 1", system: "echo never; exit 1" }) });
	const b = runGate(root, stop(root, { session_id: "s2" }), opt);
	assert.equal(b.status, 2, b.stdout);
	assert.deepEqual(last(root).failures, ["test"]);
	assert.doesNotMatch(b.stderr, /never/);

	//  (c) 両方緑 → 通過（system も検査数に数える）
	writeConfig(root, { commands: cmds({ test: "exit 0", system: "exit 0" }) });
	const c = runGate(root, stop(root, { session_id: "s3" }), opt);
	assert.equal(c.status, 0, c.stderr);
	assert.match(c.stdout, /終端ゲート通過（8 検査、skip: typecheck, lint）/);

	//  (d) 検査器の失敗は全部集める（spec-lint と contract-run の両方）
	const d = runGate(root, stop(root, { session_id: "s4" }), { ...opt, args: ["--force"], fail: "spec-lint,contract-run" });
	assert.equal(d.status, 2, d.stdout);
	assert.deepEqual(last(root).failures, ["spec-lint", "contract-run"]);
});

test("stop-gate: タイムアウトは timeout:<step> として失敗にする", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: cmds({ test: "sleep 5" }) });
	const r = runGate(root, stop(root), { tools, args: ["--timeout", "1"] });
	assert.equal(r.status, 2, r.stdout);
	assert.match(r.stderr, /失敗 = timeout:test/);
	assert.match(r.stderr, /timeout:test: timeout 1s/);
	assert.deepEqual(last(root).failures, ["timeout:test"]);
});

test("stop-gate: harness.config.json が無ければ trace-check の失敗としてブロックする（ADR-0056）", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, null, { gitInit: false }); //  git 無し → 指紋なし → 毎回検査する
	const r1 = runGate(root, stop(root), { tools });
	assert.equal(r1.status, 2, r1.stdout);
	assert.match(r1.stderr, /harness\.config\.json が無い。紐づきの検査は省略できない/);
	assert.deepEqual(last(root).failures, ["trace-check"]);
	assert.deepEqual(calls(tools).map((c) => c.name), ["spec-lint"]);
});

test("stop-gate: 古い名前の設定ファイルは読まず、改名の案内を添えてブロックする", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, null, { gitInit: false });
	writeFileSync(join(root, "traceconfig.json"), "{}");
	const r = runGate(root, stop(root), { tools });
	assert.equal(r.status, 2, r.stdout);
	assert.match(r.stderr, /harness\.config\.json が無い.*harness\.config\.json に改名した/s);
});

test("stop-gate: 例外は fail-closed（exit 2）。継続中でラウンド上限なら解放する", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t);
	//  state.json がディレクトリ → 状態を保存できず例外
	mkdirSync(join(root, ".harness-gate", "state.json"), { recursive: true });

	const a = runGate(root, stop(root), { tools });
	assert.equal(a.status, 2, a.stdout);
	assert.match(a.stderr, /内部エラーのため終端ゲートを判定できない/);
	assert.equal(last(root).decision, "block");
	assert.equal(last(root).reason, "internal-error");

	//  継続中（状態を保存できずラウンドを数えられない）→ 無限ループを避けて解放し、利用者に表示する
	const b = runGate(root, stop(root, { stop_hook_active: true }), { tools });
	assert.equal(b.status, 0, b.stderr);
	assert.match(JSON.parse(b.stdout).systemMessage, /終端ゲートが通らないまま解放した.*internal-error/);
	assert.equal(last(root).decision, "release");

	//  状態を保存できる場合: 例外のたびにラウンドを数え、上限で解放する
	rmSync(join(root, ".harness-gate", "state.json"), { recursive: true });
	rmSync(join(tools, "_shared"), { recursive: true });
	writeFileSync(join(tools, "_shared"), "ディレクトリでない"); //  readdirSync が ENOTDIR で失敗する
	const c = runGate(root, stop(root), { tools, args: ["--max-rounds", "1"] });
	assert.equal(c.status, 2, c.stdout);
	assert.match(c.stderr, /round 1\/1/);
	const d = runGate(root, stop(root, { stop_hook_active: true }), { tools, args: ["--max-rounds", "1"] });
	assert.equal(d.status, 0, d.stderr);
	assert.match(JSON.parse(d.stdout).systemMessage, /失敗: internal-error/);
	assert.equal(last(root).decision, "release");
	assert.equal(last(root).reason, "round-cap");
});

test("stop-gate: monorepo（git.units）は unit ごとに、検査と unit の commands を unit のディレクトリで実行する", (t) => {
	const tools = makeTools(t);
	//  ルートは commands を持たない（monorepo では無くてよい）
	const root = makeRoot(t, { git: { units: { web: "apps/web", api: "apps/api", ui: "packages/ui" } } }, { gitInit: false });
	const web = join(root, "apps", "web");
	mkdirSync(join(web, "docs", "goals"), { recursive: true });
	writeConfig(web, { commands: cmds({ test: "pwd > ran-test.txt" }) });
	mkdirSync(join(root, "packages", "ui", "src"), { recursive: true }); //  docs も harness.config.json も無い

	//  (a) web は検査、ui は「docs なし」、api（存在しない）も docs なし。設定の形はルートで 1 回、ほかは unit ごと
	const a = runGate(root, stop(root), { tools });
	assert.equal(a.status, 0, a.stderr + a.stdout);
	assert.match(a.stdout, /unit ui（packages\/ui）: docs なし/);
	assert.match(a.stdout, /unit api（apps\/api）: docs なし/);
	const c = calls(tools);
	assert.deepEqual(c.map((x) => x.name), ["config-lint", "spec-lint", "trace-check", "exec-check", "contract-run", "exec-check"]);
	assert.deepEqual(c[3].args, ["entry", "--root", web, "--config", join(web, "harness.config.json")]);
	assert.deepEqual(c[5].args.slice(0, 5), ["coverage", "--root", web, "--config", join(web, "harness.config.json")]);
	assert.deepEqual(c[0].args, ["--config", join(root, "harness.config.json")]);
	assert.deepEqual(c[1].args, ["validate", "--docs", join(web, "docs")]);
	assert.deepEqual(c[2].args, ["--root", web, "--config", join(web, "harness.config.json")]);
	assert.deepEqual(c[4].args, ["--root", web, "--config", join(web, "harness.config.json"), "--docs", join(web, "docs")]);
	//  unit の commands は unit のディレクトリで実行する
	assert.equal(realpathSync(readFileSync(join(web, "ran-test.txt"), "utf8").trim()), realpathSync(web));

	//  (b) docs を持つのに harness.config.json が無い unit は失敗。検査器の失敗は unit 名付き
	mkdirSync(join(root, "apps", "api", "docs"), { recursive: true });
	const b = runGate(root, stop(root), { tools, fail: "trace-check" });
	assert.equal(b.status, 2, b.stdout);
	assert.deepEqual(last(root).failures, ["trace-check:web", "trace-check:api"]);
	assert.match(b.stderr, /unit api（apps\/api）は docs を持つのに apps\/api\/harness\.config\.json が無い/);
	rmSync(join(root, "apps", "api"), { recursive: true });

	//  (c) unit の commands は 4 キーの宣言が必須。unit が tests を宣言していれば、その unit の commands.test は none にできない
	writeConfig(web, { commands: {} });
	runGate(root, stop(root), { tools });
	assert.deepEqual(last(root).failures, ["commands.typecheck:web", "commands.lint:web", "commands.test:web", "commands.system:web"]);
	writeConfig(web, { tests: { dirs: ["tests"] }, commands: cmds({ test: NONE }) });
	runGate(root, stop(root), { tools });
	assert.deepEqual(last(root).failures, ["commands.test:web"]);

	//  (d) unit のコマンドの失敗は unit 名付き。失敗しても、ほかの unit は検査する
	const ui = join(root, "packages", "ui");
	writeConfig(web, { commands: cmds({ test: "exit 1" }) });
	writeConfig(ui, { commands: cmds({ test: "pwd > ran-test.txt" }) });
	runGate(root, stop(root), { tools });
	assert.deepEqual(last(root).failures, ["test:web"]);
	assert.ok(existsSync(join(ui, "ran-test.txt")));

	//  (e) --unit で挙げた unit だけを検査する。宣言に無い名前は失敗
	rmSync(join(ui, "ran-test.txt"));
	const e = runGate(root, stop(root), { tools, args: ["--unit", "ui"] });
	assert.equal(e.status, 0, e.stderr);
	assert.ok(existsSync(join(ui, "ran-test.txt")));
	runGate(root, stop(root), { tools, args: ["--unit", "nope"] });
	assert.deepEqual(last(root).failures, ["config:nope"]);

	//  (f) ルートに commands があれば、unit の後にルートで実行する。--unit を指定したら実行しない
	writeConfig(web, { commands: cmds() });
	writeConfig(root, { git: { units: { web: "apps/web", ui: "packages/ui" } }, commands: cmds({ test: "pwd > ran-root.txt" }) });
	const f = runGate(root, stop(root), { tools });
	assert.equal(f.status, 0, f.stderr);
	assert.equal(realpathSync(readFileSync(join(root, "ran-root.txt"), "utf8").trim()), realpathSync(root));
	rmSync(join(root, "ran-root.txt"));
	const f2 = runGate(root, stop(root), { tools, args: ["--unit", "web", "--force"] });
	assert.equal(f2.status, 0, f2.stderr);
	assert.ok(!existsSync(join(root, "ran-root.txt")));
	assert.match(f2.stdout, /--unit を指定したので、ルートの commands は実行しない/);
});

test("stop-gate: --level で、どこまで実行するかを選ぶ。実行しなかった検査は skip として表示する", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: cmds({ typecheck: "echo t >> ran.txt", test: "echo u >> ran.txt", extra: { gateway: "echo x >> ran.txt" }, system: "echo s >> ran.txt" }) }, { gitInit: false });
	const ran = () => (existsSync(join(root, "ran.txt")) ? readFileSync(join(root, "ran.txt"), "utf8").split("\n").filter(Boolean).join("") : "");
	const reset = () => rmSync(join(root, "ran.txt"), { force: true });

	//  lint: 読むだけ。利用プロジェクトのコマンドも contract-run も実行しない
	const a = runGate(root, stop(root), { tools, args: ["--level", "lint"] });
	assert.equal(a.status, 0, a.stderr);
	assert.equal(ran(), "");
	assert.deepEqual(calls(tools).map((c) => c.name), ["config-lint", "spec-lint", "trace-check", "exec-check"]);
	assert.match(a.stdout, /skip: contract-run（--level lint では実行しない）/);
	assert.match(a.stdout, /skip: commands\.test（--level lint では実行しない）/);

	//  fast: typecheck → lint → test → extra。system は実行しない
	const b = runGate(root, stop(root), { tools, args: ["--level", "fast"] });
	assert.equal(b.status, 0, b.stderr);
	assert.equal(ran(), "tux");
	assert.equal(calls(tools).length, 6);
	assert.match(b.stdout, /skip: commands\.system（--level fast では実行しない）/);
	reset();

	//  full（既定）: system まで。extra は test の後、system の前
	const c = runGate(root, stop(root), { tools });
	assert.equal(c.status, 0, c.stderr);
	assert.equal(ran(), "tuxs");
	reset();

	//  level lint でも、commands の宣言の欠落は失敗にする（読むだけで分かる誤りは、どの level でも通さない）
	writeConfig(root, { commands: { typecheck: NONE, lint: NONE, test: "exit 0" } });
	runGate(root, stop(root), { tools, args: ["--level", "lint"] });
	assert.deepEqual(last(root).failures, ["commands.system"]);

	//  level が違えば、同じツリーでも合格を使い回さない
	writeConfig(root, { commands: cmds() });
	git(root, "init", "-q");
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "init");
	assert.equal(runGate(root, stop(root), { tools, args: ["--level", "lint"] }).status, 0);
	const again = runGate(root, stop(root), { tools, args: ["--level", "lint"] });
	assert.match(again.stdout, /変更なし/);
	const full = runGate(root, stop(root), { tools });
	assert.doesNotMatch(full.stdout, /変更なし/);

	//  知らない level は使い方の誤り
	assert.equal(runGate(root, stop(root), { tools, args: ["--level", "all"] }).status, 2);
});

test("stop-gate: 実行の記録の検査は test が通った直後にだけ実行し、落ちたら extra と system を実行しない", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: cmds({ test: "echo t >> ran.txt", extra: { x: "echo x >> ran.txt" }, system: "echo s >> ran.txt" }) }, { gitInit: false });
	const names = () => calls(tools).map((c) => `${c.name}${c.name === "exec-check" ? `:${c.args[0]}` : ""}`);
	//  test が落ちたら、記録の検査は実行しない
	writeConfig(root, { commands: cmds({ test: "exit 1" }) });
	runGate(root, stop(root), { tools });
	assert.deepEqual(last(root).failures, ["test"]);
	assert.ok(!names().includes("exec-check:coverage"));
	//  test が none なら、記録を書くものが無いので実行しない。coverage を宣言していれば、実行しなかったことを表示する
	writeConfig(root, { commands: cmds({ test: NONE }), coverage: { report: "lcov.info" } });
	const n = runGate(root, stop(root), { tools });
	assert.ok(!names().includes("exec-check:coverage"));
	assert.match(n.stdout, /skip: coverage（commands\.test が none なので、実行の記録が無い）/);
	writeConfig(root, { commands: cmds({ test: "exit 0" }), coverage: { report: "lcov.info" } });
	const l = runGate(root, stop(root), { tools, args: ["--level", "lint"] });
	assert.match(l.stdout, /skip: coverage（--level lint では実行しない）/);
	calls(tools);
	//  宣言していなければ、表示しない（未宣言であることは exec-check 自身が、実行されたときに表示する）
	writeConfig(root, { commands: cmds({ test: NONE }) });
	assert.doesNotMatch(runGate(root, stop(root), { tools }).stdout, /skip: coverage/);
	calls(tools);
	//  記録の検査が落ちたら、その先を実行しない。失敗の名前は coverage
	writeConfig(root, { commands: cmds({ test: "echo t >> ran.txt", extra: { x: "echo x >> ran.txt" }, system: "echo s >> ran.txt" }) });
	writeFileSync(join(tools, "exec-check", "exec-check.mjs"), STUB + `if (process.argv[2] === "coverage") { console.log("V3 red"); process.exit(1); }\n`);
	const r = runGate(root, stop(root), { tools });
	assert.equal(r.status, 2, r.stdout);
	assert.deepEqual(last(root).failures, ["coverage"]);
	assert.equal(readFileSync(join(root, "ran.txt"), "utf8"), "t\n");
});

test("stop-gate: commands.extra の形の誤りは失敗にする", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: cmds({ extra: ["npm run x"] }) }, { gitInit: false });
	runGate(root, stop(root), { tools });
	assert.deepEqual(last(root).failures, ["commands.extra"]);
	writeConfig(root, { commands: cmds({ extra: { gateway: 1 } }) });
	runGate(root, stop(root), { tools });
	assert.deepEqual(last(root).failures, ["commands.extra"]);
});

test("stop-gate: 制限時間を過ぎたコマンドは、シェルの子として動くプロセスごと止める", { skip: process.platform === "win32" }, (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: cmds({ test: `node -e "setInterval(() => require('fs').appendFileSync('alive.txt', 'x'), 100)" ; true` }) }, { gitInit: false });
	const r = runGate(root, stop(root), { tools, args: ["--timeout", "1"] });
	assert.equal(r.status, 2, r.stdout);
	assert.match(r.stderr, /失敗 = timeout:test/);
	//  pid の生存はゾンビで偽になるので、追記が続いていないことで確かめる
	const size = () => readFileSync(join(root, "alive.txt"), "utf8").length;
	const before = size();
	spawnSync("sleep", ["0.6"]);
	assert.equal(size(), before, "制限時間の後も、コマンドが起動したプロセスが動き続けている");
});

test("stop-gate: 止めたコマンドがプロセスグループを抜けた孫を残していても、制限時間で戻る", { skip: process.platform === "win32" || spawnSync("setsid", ["true"]).status !== 0 }, (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: cmds({ test: "setsid sleep 6 & sleep 60" }) }, { gitInit: false });
	const started = Date.now();
	const r = runGate(root, stop(root), { tools, args: ["--timeout", "1"] });
	assert.equal(r.status, 2, r.stdout);
	assert.match(r.stderr, /失敗 = timeout:test/);
	assert.ok(Date.now() - started < 4000, `戻るまで ${Date.now() - started}ms かかった`);
});

test("stop-gate: コマンドが孫を残して先に終わっていても、制限時間で戻る", { skip: process.platform === "win32" || spawnSync("setsid", ["true"]).status !== 0 }, (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: cmds({ test: "setsid sleep 6 & echo done" }) }, { gitInit: false });
	const started = Date.now();
	const r = runGate(root, stop(root), { tools, args: ["--timeout", "1"] });
	assert.equal(r.status, 2, r.stdout);
	assert.match(r.stderr, /失敗 = timeout:test/);
	assert.ok(Date.now() - started < 4000, `戻るまで ${Date.now() - started}ms かかった`);
});

test("stop-gate: --timeout 0 は制限なし", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: cmds({ test: "sleep 0.3" }) }, { gitInit: false });
	const r = runGate(root, stop(root), { tools, args: ["--timeout", "0"] });
	assert.equal(r.status, 0, r.stderr);
});

test("stop-gate: unit の設定が JSON として壊れていれば、その unit を失敗にして、ほかの unit は検査する", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { git: { units: { a: "a", b: "b" } } }, { gitInit: false });
	mkdirSync(join(root, "a"));
	mkdirSync(join(root, "b"));
	writeFileSync(join(root, "a", "harness.config.json"), "{broken");
	writeConfig(join(root, "b"), { commands: cmds({ test: "pwd > ran.txt" }) });
	runGate(root, stop(root), { tools });
	assert.deepEqual(last(root).failures, ["config:a"]);
	assert.ok(existsSync(join(root, "b", "ran.txt")));
});

test("stop-gate: commands.extra の説明の欄（_ で始まるキー）は実行しない。--ignore-legacy-layout は spec-lint に渡す", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: cmds({ extra: { _comment: "exit 1", gateway: "echo x > ran.txt" } }) }, { gitInit: false });
	const r = runGate(root, stop(root), { tools, args: ["--ignore-legacy-layout"] });
	assert.equal(r.status, 0, r.stderr);
	assert.ok(existsSync(join(root, "ran.txt")));
	const c = calls(tools);
	assert.deepEqual(c[1].args, ["validate", "--docs", join(root, "docs"), "--ignore-legacy-layout"]);
});

test("stop-gate: commands.extra の形が誤っていれば、extra から先（system も）を実行しない", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: cmds({ extra: { a: "echo a >> ran.txt", bad: { x: 1 } }, system: "echo s >> ran.txt" }) }, { gitInit: false });
	runGate(root, stop(root), { tools });
	assert.deepEqual(last(root).failures, ["commands.extra"]);
	assert.ok(!existsSync(join(root, "ran.txt")));
});

test("stop-gate: コマンドの標準入力は閉じている（入力を待つコマンドで止まらない）", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: cmds({ test: "cat > got.txt" }) }, { gitInit: false });
	const r = runGate(root, stop(root), { tools, args: ["--timeout", "5"] });
	assert.equal(r.status, 0, r.stderr);
	assert.equal(readFileSync(join(root, "got.txt"), "utf8"), "");
});

test("stop-gate: 指紋は --unit の指定と、使う検査の並び（suite.mjs）の変更で変わる", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { git: { units: { a: "a", b: "b" } } });
	for (const u of ["a", "b"]) {
		mkdirSync(join(root, u));
		writeConfig(join(root, u), { commands: cmds() });
	}
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "units");
	assert.equal(runGate(root, stop(root), { tools, args: ["--unit", "a"] }).status, 0);
	assert.match(runGate(root, stop(root), { tools, args: ["--unit", "a"] }).stdout, /変更なし/);
	//  別の unit を指定したら、合格を使い回さない
	assert.doesNotMatch(runGate(root, stop(root), { tools, args: ["--unit", "b"] }).stdout, /変更なし/);
	assert.match(runGate(root, stop(root), { tools, args: ["--unit", "b"] }).stdout, /変更なし/);
	//  同じ unit を重ねて書いても、同じ指定として扱う
	assert.match(runGate(root, stop(root), { tools, args: ["--unit", "b", "--unit", "b"] }).stdout, /変更なし/);
	//  spec-lint へ渡す引数が違えば、合格を使い回さない
	assert.doesNotMatch(runGate(root, stop(root), { tools, args: ["--unit", "b", "--ignore-legacy-layout"] }).stdout, /変更なし/);
	//  検査の並びを書き換えたら、合格を使い回さない
	mkdirSync(join(tools, "gate-hook"), { recursive: true });
	writeFileSync(join(tools, "gate-hook", "suite.mjs"), "// changed\n");
	assert.doesNotMatch(runGate(root, stop(root), { tools, args: ["--unit", "b"] }).stdout, /変更なし/);
});

test("stop-gate: 直前のラウンドと同じ検査が落ちていれば、上限を待たずに人間へ渡す", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { commands: cmds({ test: "exit 1" }) }, { gitInit: false });
	const args = ["--max-rounds", "5"];
	assert.equal(runGate(root, stop(root), { tools, args }).status, 2);
	assert.equal(runGate(root, stop(root, { stop_hook_active: true }), { tools, args }).status, 2);
	//  2 ラウンド続けて同じ失敗 → 3 回目は検査せずに解放する
	calls(tools);
	const r = runGate(root, stop(root, { stop_hook_active: true }), { tools, args });
	assert.equal(r.status, 0, r.stderr);
	assert.equal(last(root).decision, "release");
	assert.equal(last(root).reason, "non-decreasing");
	assert.match(JSON.parse(r.stdout).systemMessage, /前のラウンドから進んでいない/);
	assert.equal(calls(tools).length, 0);

	//  落ちる検査が増えたとき（悪化）も、進んでいないので渡す
	const root3 = makeRoot(t, { commands: cmds({ test: "exit 1" }) }, { gitInit: false });
	assert.equal(runGate(root3, stop(root3), { tools, args }).status, 2); //  test
	assert.equal(runGate(root3, stop(root3, { stop_hook_active: true }), { tools, args, fail: "trace-check" }).status, 2); //  trace-check, test
	assert.equal(runGate(root3, stop(root3, { stop_hook_active: true }), { tools, args }).status, 0);
	assert.equal(last(root3).reason, "non-decreasing");

	//  落ちる検査の組が前のものへ戻ったとき（直しては壊す往復）も渡す
	const root4 = makeRoot(t, { commands: cmds({ lint: "exit 1" }) }, { gitInit: false });
	assert.equal(runGate(root4, stop(root4), { tools, args }).status, 2); //  lint
	writeConfig(root4, { commands: cmds({ lint: "exit 0", test: "exit 1" }) });
	assert.equal(runGate(root4, stop(root4, { stop_hook_active: true }), { tools, args }).status, 2); //  test（前進）
	writeConfig(root4, { commands: cmds({ lint: "exit 1" }) });
	assert.equal(runGate(root4, stop(root4, { stop_hook_active: true }), { tools, args }).status, 2); //  lint（戻った。この回は検査する）
	assert.equal(runGate(root4, stop(root4, { stop_hook_active: true }), { tools, args }).status, 0);
	assert.equal(last(root4).reason, "non-decreasing");

	//  落ちる検査が変わっている間は続ける（件数が 1 件のままでも、型検査 → lint と前へ進んでいる）
	const root2 = makeRoot(t, { commands: cmds({ typecheck: "exit 1", lint: "exit 1", test: "exit 1" }) }, { gitInit: false });
	assert.equal(runGate(root2, stop(root2), { tools, args }).status, 2);
	assert.deepEqual(last(root2).failures, ["typecheck"]);
	writeConfig(root2, { commands: cmds({ typecheck: "exit 0", lint: "exit 1", test: "exit 1" }) });
	assert.equal(runGate(root2, stop(root2, { stop_hook_active: true }), { tools, args }).status, 2);
	assert.deepEqual(last(root2).failures, ["lint"]);
	writeConfig(root2, { commands: cmds({ typecheck: "exit 0", lint: "exit 0", test: "exit 1" }) });
	assert.equal(runGate(root2, stop(root2, { stop_hook_active: true }), { tools, args }).status, 2); //  前へ進んでいるので検査した
	assert.deepEqual(last(root2).failures, ["test"]);
});

test("stop-gate: 実際の spec-lint / trace-check / contract-run とテンプレートの harness.config.json で動く（結合）", (t) => {
	//  テンプレートから、空の skeleton では対象の無い範囲を理由付きの none にした最小設定（ADR-0056）
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	delete cfg._comment;
	cfg.contract = { none: "空の skeleton" };
	cfg.schema = { none: "空の skeleton" };
	cfg.docs.shared = { none: "空の skeleton" };
	cfg.docs.glossary = { none: "空の skeleton" };
	cfg.commands = { typecheck: NONE, lint: NONE, test: "exit 0", system: NONE };
	const root = makeRoot(t, cfg);
	const r = runGate(root, stop(root));
	assert.equal(r.status, 0, r.stderr + r.stdout);
	assert.match(r.stdout, /終端ゲート通過（7 検査、skip: typecheck, lint, system）/);
});
