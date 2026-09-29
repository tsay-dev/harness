//  suite — 終端リスト（完成の定義の機械部分）の実行。並びをここ 1 か所に持つ
//
//  使うのは 2 つ: stop-gate（通らなければ終了を止める）と goal-status（結果を GOAL ごとの状態へ導出して報告する）。
//  止めるか報告するかは呼び出し側が決め、ここは「何を・どの順で走らせ・どうなったか」だけを返す。
//
//  検査の順序（1–3 は全部走らせて失敗を集める。4 は最初の失敗で止める）:
//    1. spec-lint validate            docs SSOT のフォーマット / ライフサイクル
//    2. trace-check                   トレーサビリティ（<root>/traceconfig.json がある時だけ）
//    3. contract-run                  契約例の実行検査（commands.contract_adapter 宣言時だけ）
//    4. commands.typecheck → lint → test（traceconfig.json の commands ブロックから。無い鍵は skip）
//    5. commands.system                シナリオテスト（system suite）全件。宣言時だけ、4 が全部通ったあとに 1 回（ADR-0035）
//  コマンドは traceconfig.json に宣言されたものしか走らせない。推測・発明はしない。

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

//  1 ステップ実行。戻り: { step, name, ok, code, signal, timedOut, stdout, output, ms }
//  name は失敗の呼び名（タイムアウトは timeout:<step>）。stdout は機械可読な出力を読む呼び出し側のために分けて持つ
export function runStep(step, cmd, root, timeoutSec) {
	const startedAt = Date.now();
	const r = spawnSync(cmd, { cwd: root, shell: true, timeout: timeoutSec * 1000, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
	const timedOut = r.error?.code === "ETIMEDOUT" || !!r.signal;
	const output = (r.stdout ?? "") + (r.stderr ?? "") + (r.error && !timedOut ? `\n${r.error.message}` : "");
	return { step, name: timedOut ? `timeout:${step}` : step, ok: !timedOut && r.status === 0, code: r.status, signal: r.signal, timedOut, stdout: r.stdout ?? "", output, ms: Date.now() - startedAt };
}

export const tailLines = (text, n) => {
	const lines = text.replace(/\s+$/, "").split(/\r?\n/);
	return lines.slice(Math.max(0, lines.length - n));
};

export function readCommands(configPath) {
	if (!existsSync(configPath)) return {};
	const cfg = JSON.parse(readFileSync(configPath, "utf8"));
	return cfg.commands && typeof cfg.commands === "object" ? cfg.commands : {};
}

//  opts: { docs, timeout }
//  hooks:
//    onSkip(step, why)   宣言が無くて走らせなかったステップの通知
//    traceArgs           trace-check へ足す引数（goal-status が --json を足す）
//    commands: false     host の実行（contract-run / typecheck / lint / test / system）を走らせない。
//                        宣言済みのものは not-run、未宣言のものは従来どおり skip として返す
//  戻り: { steps, failures, skipped, ran }
//    steps は並びどおりの全ステップ: { step, state: pass | fail | timeout | skip | not-run, why?, ...runStep の戻り }
export function runSuite(root, opts, toolsDir, configPath, hooks = {}) {
	const q = (p) => `"${p.replace(/"/g, '\\"')}"`;
	const execute = hooks.commands !== false;
	const steps = [];
	const failures = [];
	const skipped = [];
	let ran = 0;
	const run = (step, cmd) => {
		ran++;
		const r = runStep(step, cmd, root, opts.timeout);
		if (!r.ok) failures.push(r);
		steps.push({ ...r, state: r.ok ? "pass" : r.timedOut ? "timeout" : "fail" });
		return r.ok;
	};
	const skip = (step, why) => {
		skipped.push(step);
		steps.push({ step, state: "skip", why });
		hooks.onSkip?.(step, why);
	};
	const notRun = (step, why) => steps.push({ step, state: "not-run", why });

	//  1–3: 全部走らせて失敗を集める
	run("spec-lint", `node ${q(join(toolsDir, "spec-lint", "spec-lint.mjs"))} validate --docs ${q(opts.docs)}`);

	const hasConfig = existsSync(configPath);
	if (hasConfig)
		run("trace-check", `node ${q(join(toolsDir, "trace-check", "trace-check.mjs"))} --root ${q(root)} --config ${q(configPath)}${hooks.traceArgs ? ` ${hooks.traceArgs}` : ""}`);
	else skip("trace-check", "traceconfig.json 無し");

	const commands = hasConfig ? readCommands(configPath) : {};
	if (!commands.contract_adapter) skip("contract-run", "commands.contract_adapter 未宣言 — 契約の実行検査は行われていない");
	else if (!execute) notRun("contract-run", "実行しない指定");
	else run("contract-run", `node ${q(join(toolsDir, "contract-run", "contract-run.mjs"))}`);

	//  4–5: 宣言されたコマンドを順に。最初の失敗で止める（型が通らないのに test を回しても意味がない。
	//  system はブラウザ / シミュレータを起動する最も重い検査なので最後に置き、default suite が赤なら走らせない）
	let stopped = null;
	for (const k of ["typecheck", "lint", "test", "system"]) {
		const undeclared = k === "system" ? "commands.system 未宣言 — シナリオテストは走っていない（CI に任せるなら宣言しない）" : `commands.${k} 未宣言`;
		if (stopped) {
			//  止まった後のステップは steps にだけ残す（skip の通知と件数は、止まる前に判定したものに限る）
			if (commands[k]) notRun(k, `${stopped} が通っていない`);
			else steps.push({ step: k, state: "skip", why: undeclared });
		} else if (!commands[k]) skip(k, undeclared);
		else if (!execute) notRun(k, "実行しない指定");
		else if (!run(k, commands[k])) stopped = k;
	}
	return { steps, failures, skipped, ran };
}
