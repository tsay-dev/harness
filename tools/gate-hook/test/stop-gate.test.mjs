//  stop-gate（Stop フック）の回帰検証。一時ディレクトリに git リポジトリを組み、Stop の stdin を模擬する。
//  spec-lint / trace-check / contract-run は、引数を記録して終わるだけのスタブ（STOP_GATE_TOOLS_DIR）に差し替え、
//  stop-gate 自身の振る舞い（順序・引数・指紋・commands の宣言・monorepo）を固定する。
//  実際のツールとの結合は最後のテストで確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, "..", "stop-gate.mjs");
const GATE_LOG = join(HERE, "..", "gate-log.mjs");
const TEMPLATE = join(HERE, "..", "..", "..", "templates", "develop", "traceconfig.json");

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
	for (const n of ["spec-lint", "trace-check", "contract-run"]) {
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

const writeConfig = (root, cfg) => writeFileSync(join(root, "traceconfig.json"), typeof cfg === "string" ? cfg : JSON.stringify(cfg, null, 2) + "\n");

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
	assert.match(a.stdout, /\[stop-gate\] 終端ゲート通過（4 検査、skip: typecheck, lint, system）/);
	assert.match(a.stdout, /skip: commands\.typecheck = none（テストでは使わない）/);
	assert.equal(last(root).decision, "pass");
	assert.equal(last(root).session, "s1");
	assert.equal(last(root).hook, "stop-gate");
	assert.equal(last(root).event, "Stop");
	const state = JSON.parse(readFileSync(join(root, ".harness-gate", "state.json"), "utf8"));
	assert.ok(state.last_pass.fingerprint);
	//  contract-run に --docs を渡す。spec-lint は docs、trace-check は root と config
	const c1 = calls(tools);
	assert.deepEqual(c1.map((c) => c.name), ["spec-lint", "trace-check", "contract-run"]);
	assert.deepEqual(c1[0].args, ["validate", "--docs", join(root, "docs")]);
	assert.deepEqual(c1[1].args, ["--root", root, "--config", join(root, "traceconfig.json")]);
	assert.deepEqual(c1[2].args, ["--root", root, "--config", join(root, "traceconfig.json"), "--docs", join(root, "docs")]);

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
	//  直せない失敗は未達として報告して終える。traceconfig を緩めて通さない
	assert.match(c.stderr, /直せる失敗は直し/);
	assert.match(c.stderr, /人間ゲート待ちや後続の担当の成果物でしか直せない失敗は、未達として報告して終える/);
	assert.match(c.stderr, /traceconfig\.json を緩めて（none にする、範囲を狭める）通さない/);
	assert.match(c.stderr, /DEFERRED\.md/);
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
	assert.match(s.stdout, /gate-hook: gated 0 \/ block 0 \/ last block: なし \/ ask 0（traceconfig 0, harness 0, hook-settings 0, workflow 0, status-down 0, status-up-gate 0, actor-kind 0）\/ status-up 0/);
	assert.match(s.stdout, /降格候補/);
});

test("stop-gate: 指紋は未追跡ファイルの中身・traceconfig・harness ツールの変更で変わる", (t) => {
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
	//  ignore された traceconfig.json の中身を変える → 再検査
	writeFileSync(join(root, ".gitignore"), "traceconfig.json\n");
	git(root, "rm", "-q", "--cached", "traceconfig.json");
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
	assert.match(e.stdout, /終端ゲート通過（3 検査、skip: typecheck, lint, test, system）/);

	//  (f) traceconfig.json の JSON 構文の誤りは例外でなく失敗の 1 項目
	writeConfig(root, "{ not json");
	const f = runGate(root, stop(root), opt);
	assert.equal(f.status, 2, f.stdout);
	assert.deepEqual(last(root).failures, ["traceconfig"]);
	assert.match(f.stderr, /JSON として読めない/);
	assert.equal(last(root).reason, "traceconfig");
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
	assert.match(c.stdout, /終端ゲート通過（5 検査、skip: typecheck, lint）/);

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

test("stop-gate: traceconfig.json が無ければ trace-check の失敗としてブロックする（ADR-0056）", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, null, { gitInit: false }); //  git 無し → 指紋なし → 毎回検査する
	const r1 = runGate(root, stop(root), { tools });
	assert.equal(r1.status, 2, r1.stdout);
	assert.match(r1.stderr, /traceconfig\.json が無い。紐づきの検査は省略できない/);
	assert.deepEqual(last(root).failures, ["trace-check"]);
	assert.deepEqual(calls(tools).map((c) => c.name), ["spec-lint"]);
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

test("stop-gate: monorepo（git.units）は unit ごとに spec-lint / trace-check / contract-run を実行する", (t) => {
	const tools = makeTools(t);
	const root = makeRoot(t, { git: { units: { web: "apps/web", api: "apps/api", ui: "packages/ui" } }, commands: cmds() }, { gitInit: false });
	mkdirSync(join(root, "apps", "web", "docs", "goals"), { recursive: true });
	writeConfig(join(root, "apps", "web"), { commands: {} });
	mkdirSync(join(root, "packages", "ui", "src"), { recursive: true }); //  docs も traceconfig も無い

	//  (a) web は検査、ui は「docs なし」、api（存在しない）も docs なし。ルートでは 1–3 を実行しない
	const a = runGate(root, stop(root), { tools });
	assert.equal(a.status, 0, a.stderr + a.stdout);
	assert.match(a.stdout, /unit ui（packages\/ui）: docs なし/);
	assert.match(a.stdout, /unit api（apps\/api）: docs なし/);
	const web = join(root, "apps", "web");
	const c = calls(tools);
	assert.deepEqual(c.map((x) => x.name), ["spec-lint", "trace-check", "contract-run"]);
	assert.deepEqual(c[0].args, ["validate", "--docs", join(web, "docs")]);
	assert.deepEqual(c[1].args, ["--root", web, "--config", join(web, "traceconfig.json")]);
	assert.deepEqual(c[2].args, ["--root", web, "--config", join(web, "traceconfig.json"), "--docs", join(web, "docs")]);

	//  (b) docs を持つのに traceconfig が無い unit は失敗。検査器の失敗は unit 名付き
	mkdirSync(join(root, "apps", "api", "docs"), { recursive: true });
	const b = runGate(root, stop(root), { tools, fail: "trace-check" });
	assert.equal(b.status, 2, b.stdout);
	assert.deepEqual(last(root).failures, ["trace-check:web", "trace-check:api"]);
	assert.match(b.stderr, /unit api（apps\/api）は docs を持つのに apps\/api\/traceconfig\.json が無い/);

	//  (c) unit が tests を宣言していれば、ルートの commands.test は none にできない
	writeConfig(root, { git: { units: { web: "apps/web" } }, commands: cmds({ test: NONE }) });
	writeConfig(web, { tests: { dirs: ["tests"] } });
	runGate(root, stop(root), { tools });
	assert.deepEqual(last(root).failures, ["commands.test"]);
});

test("stop-gate: 実際の spec-lint / trace-check / contract-run とテンプレートの traceconfig で動く（結合）", (t) => {
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
	assert.match(r.stdout, /終端ゲート通過（4 検査、skip: typecheck, lint, system）/);
});
