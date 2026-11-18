//  lint entries のテスト。入口の一覧と契約を 1 か所ずつずらし、その検査項目で落ちることを確かめる
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { toolOf, project, run, op, contract, ucDoc, G, DOCS, line, h, LIST, entriesCfg, entries } from "../../_shared/test/entry-fixture.mjs";

//  契約 1 つ（UC-001、fixed）だけにする
const only = (ops, status = "fixed") => ({ [`${G}/UC-001-members/contract.yaml`]: contract("UC-001", status, ops), [`${G}/UC-002-draft/contract.yaml`]: null, [`${G}/UC-004-operate/contract.yaml`]: null });

test("entries: 一覧の入口が、fixed の契約の inbound の操作と文字どおり一致し、fixed の操作の入口が一覧にあれば通る", () => {
	const r = entries();
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /OK: 入口 5 件（すべて fixed の契約の inbound の操作に合う）、fixed の契約の inbound の操作 5 件/);
});

//  harness はパスを解釈しない。契約 /a/{id} に対して、1 文字でも違う入口は合わない（E1 と E2 の両方が出る）
for (const [name, method, path] of [
	[":id と {id} を同じとみなさない", "GET", "/a/:id"],
	["パラメーターの名前が違う", "GET", "/a/{itemId}"],
	["末尾の / を無視しない", "GET", "/a/{id}/"],
	["大文字小文字をならさない", "GET", "/A/{id}"],
	["* を特別に扱わない", "GET", "/a/*"],
	["method の表記が違う（小文字）", "get", "/a/{id}"],
	["method が違う", "PUT", "/a/{id}"],
	["前後の空白を削らない", "GET", "/a/{id} "],
]) {
	test(`entries E1 / E2: 完全一致でなければ合わない（${name}）`, () => {
		const r = entries({ files: only([op("getA", { path: "/a/{id}" })]), list: h(method, path) });
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.ok(r.stdout.includes(`err  E1  契約に無い入口: ${method} ${path}（`), r.stdout);
		assert.match(r.stdout, /err  E2  UC-001#getA（fixed、owned かつ inbound）に合う入口が、一覧に無い: GET \/a\/\{id\}/);
	});
}

test("entries: どんな書き方のパスや名前でも、契約と一覧が同じ文字なら合う（harness は書式を持たない）", () => {
	const paths = ["/a/{id}", "/files/{name}.json", "/odata/$metadata", "/v1/items/{id}:cancel", "/docs/[[...slug]]", "/a/:id?", "/assets/*", "/"];
	const files = only([...paths.map((p, i) => op(`op${i}`, { path: JSON.stringify(p) })), op("openItem", { transport: "deeplink", entry: '"myapp://open?item={id}"' }), op("openProfile", { transport: "deeplink", entry: '"myapp:profile"' }), op("syncLocal", { transport: "internal" })]);
	const list = [...paths.map((p) => h("GET", p)), line({ kind: "deeplink", name: "myapp://open?item={id}" }), line({ kind: "deeplink", name: "myapp:profile" }), line({ kind: "internal", name: "syncLocal" })].join("\n");
	const r = entries({ files, list });
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /OK: 入口 11 件/);
	//  名前の入口も完全一致（パラメーターの書き方が違えば合わない）
	const diff = entries({ files, list: list.replace("myapp://open?item={id}", "myapp://open?item=:id") });
	assert.match(diff.stdout, /err  E1  契約に無い入口: deeplink myapp:\/\/open\?item=:id/);
	assert.match(diff.stdout, /err  E2  UC-001#openItem/);
});

test("entries: 契約が draft の間は、入口が無いのが正しい（draft の契約の操作しか無ければ、一覧が 0 行でも none でも通る）", () => {
	const draftOnly = { [`${G}/UC-001-members/contract.yaml`]: null, [`${G}/UC-004-operate/contract.yaml`]: null };
	const r = entries({ files: draftOnly, list: "" });
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /OK: 入口は無い、fixed の契約の inbound の操作 0 件/);
	const d = project({ cfg: entriesCfg((c) => (c.commands.list_entries = { none: "契約が fixed になるまで入口を置かない" })), files: { ...DOCS, ...draftOnly }, lcov: null });
	assert.equal(run(d, "entries").status, 0);
	//  同じ状態で入口を置くと、契約を fixed にするまで違反
	const early = entries({ files: draftOnly, list: h("GET", "/api/members/export") });
	assert.equal(early.status, 1);
	assert.match(early.stdout, /err  E1  契約が fixed でない入口: GET \/api\/members\/export/);
	//  「fixed でない契約に合う」の判定も完全一致（1 文字違えば、契約に無い入口）
	assert.match(entries({ files: draftOnly, list: h("GET", "/api/members/export/") }).stdout, /err  E1  契約に無い入口: GET \/api\/members\/export\//);
});

test("entries: fixed の契約で owned が false の inbound の操作（外部からの通知など）に合う入口は通る", () => {
	const hook = { [`${G}/UC-004-operate/contract.yaml`]: contract("UC-004", "fixed", [op("checkHealth", { path: "/api/health" }), op("serveAssets", { path: "/assets/*" }), op("receiveHook", { owned: false, method: "POST", path: "/hooks/pay" })]) };
	const r = entries({ files: hook, list: `${LIST}\n${h("POST", "/hooks/pay")}` });
	assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("entries: inbound の操作が無ければ、一覧が 0 行でも通る。一覧は標準入力からも読める", () => {
	const empty = entries({ files: only([op("sendMail", { direction: "outbound", owned: false, method: "POST", path: "/v1/mail" })]), list: "" });
	assert.equal(empty.status, 0, empty.stdout + empty.stderr);
	assert.match(empty.stdout, /OK: 入口は無い、fixed の契約の inbound の操作 0 件/);
	const d = project({ cfg: entriesCfg(), files: DOCS, lcov: null });
	const r = spawnSync(process.execPath, [toolOf("entries"), "--root", d], { encoding: "utf8", input: LIST });
	assert.equal(r.status, 0, r.stdout + r.stderr);
});

const BAD_ENTRIES = [
	["E1", "契約に無い入口", { list: `${LIST}\n${h("DELETE", "/api/members/{id}")}` }, /契約に無い入口: DELETE \/api\/members\/\{id\}/],
	["E1", "撤回済みの UC の契約にしか無い入口", { list: `${LIST}\n${h("GET", "/api/old-report")}` }, /契約に無い入口: GET \/api\/old-report/],
	["E1", "outbound の操作と同じパスの入口", { list: `${LIST}\n${h("POST", "/v1/mail")}` }, /契約に無い入口: POST \/v1\/mail/],
	["E1", "http 以外で契約に無い入口", { list: `${LIST}\n${line({ kind: "deeplink", name: "app://open/{id}" })}` }, /契約に無い入口: deeplink app:\/\/open\/\{id\}/],
	["E1", "契約に書いていない運用の入口（生存確認）は、認める宣言の手段が無く、必ず違反になる", { files: { [`${G}/UC-004-operate/contract.yaml`]: contract("UC-004", "fixed", [op("serveAssets", { path: "/assets/*" })]) } }, /契約に無い入口: GET \/api\/health（契約に inbound の操作として書くか、使っていなければ入口を消す。生存確認や静的なファイルの配信のような入口も、契約に書く。突き合わせは文字の完全一致/],
	["E4", "廃止した entries.outside_contract に書いても、入口は認められない", { cfg: entriesCfg((c) => (c.entries = { outside_contract: [{ entry: "GET /api/health", reason: "監視が呼ぶ生存確認" }] })), files: { [`${G}/UC-004-operate/contract.yaml`]: contract("UC-004", "fixed", [op("serveAssets", { path: "/assets/*" })]) } }, /設定の entries は廃止した（契約の外の入口は置けない）[^]*err  E1  契約に無い入口: GET \/api\/health/],
	["E4", "廃止した entries のキーが残っている（空でも）", { cfg: entriesCfg((c) => (c.entries = { outside_contract: [] })) }, /設定の entries は廃止した（契約の外の入口は置けない）。キーを削除し/],
	["E1", "draft の契約の操作にしか合わない入口（人が承認していない契約では、入口を通さない）", { list: `${LIST}\n${h("GET", "/api/members/export")}` }, /契約が fixed でない入口: GET \/api\/members\/export（合う操作 UC-002#exportMembers はあるが、その契約の x-status が draft。fixed でない契約の操作は、入口の突き合わせ先に数えない。人間の承認を得て契約を fixed にするまで、この検査は通らない/],
	["E1", "x-status の無い契約の操作にしか合わない入口", { list: `${LIST}\n${h("GET", "/api/members/export")}`, files: { [`${G}/UC-002-draft/contract.yaml`]: contract("UC-002", null, [op("exportMembers", { path: "/api/members/export" })]) } }, /契約が fixed でない入口: GET \/api\/members\/export（合う操作 UC-002#exportMembers はあるが、その契約に x-status が無い。/],
	["E2", "fixed の操作の入口が一覧に無い", { list: LIST.split("\n").slice(1).join("\n") }, /UC-001#getMember（fixed、owned かつ inbound）に合う入口が、一覧に無い: GET \/api\/members\/\{accountId\}/],
	["E2", "fixed の push の操作の入口が一覧に無い", { list: LIST.replace("notice.updated", "notice.created") }, /UC-001#receiveNotice（fixed、owned かつ inbound）に合う入口が、一覧に無い: push notice\.updated/],
	["E4", "fixed の契約に inbound の操作があるのに一覧が 0 行", { list: "", files: only([op("receiveHook", { owned: false, method: "POST", path: "/hooks/pay" })]) }, /入口の一覧が 0 行（撤回されていない UC の fixed の契約に inbound の操作が 1 件ある。例: UC-001#receiveHook）/],
	["E4", "契約の wire.path が文字列でない操作を、黙って捨てない（draft でも、owned が false でも）", { files: { [`${G}/UC-002-draft/contract.yaml`]: contract("UC-002", "draft", [op("getA", { owned: false, path: "123" })]) } }, /E4  契約の操作 UC-002#getA の wire\.path を読めない: 空でない文字列でない（実際: 123）（契約の書き方の誤り/],
	["E4", "契約の wire.path が空", { files: { [`${G}/UC-002-draft/contract.yaml`]: contract("UC-002", "draft", [op("getA", { path: '""' })]) } }, /E4  契約の操作 UC-002#getA の wire\.path を読めない: 空でない文字列でない（実際: ""）/],
	["E4", "契約の wire.method が文字列でない", { files: { [`${G}/UC-002-draft/contract.yaml`]: contract("UC-002", "draft", [op("getA", { method: "1", path: "/a" })]) } }, /E4  契約の操作 UC-002#getA の wire\.method を読めない: 空でない文字列でない（実際: 1）/],
	["E4", "契約の deeplink の操作に entry が無い", { files: { [`${G}/UC-002-draft/contract.yaml`]: contract("UC-002", "draft", [op("openItem", { transport: "deeplink" })]) } }, /E4  契約の操作 UC-002#openItem の entry を読めない: 空でない文字列でない（実際: null）/],
	["E4", "契約の push の entry が数（文字列でない）", { files: { [`${G}/UC-002-draft/contract.yaml`]: contract("UC-002", "draft", [op("onNotice", { transport: "push", entry: "123" })]) } }, /E4  契約の操作 UC-002#onNotice の entry を読めない: 空でない文字列でない（実際: 123）/],
	["E4", "契約の wire.path が空白だけ（空とみなす。一覧に同じ空白を出しても合わない）", { files: { [`${G}/UC-002-draft/contract.yaml`]: contract("UC-002", "draft", [op("getA", { path: '" "' })]) } }, /E4  契約の操作 UC-002#getA の wire\.path を読めない: 空でない文字列でない（実際: " "）/],
	["E4", "契約の inbound の操作の transport が、入口の種類に無い", { files: { [`${G}/UC-002-draft/contract.yaml`]: contract("UC-002", "draft", [op("call", { transport: "grpc" })]) } }, /E4  契約の操作 UC-002#call の transport を読めない: 入口の種類（http \/ sdk/],
	["E4", "一覧の path が空白だけ", { list: `${LIST}\n${line({ kind: "http", method: "GET", path: " " })}` }, /kind が http の入口は、method と path を、空でない文字列で持つ/],
	["E4", "一覧の name が空白だけ", { list: `${LIST}\n${line({ kind: "push", name: " " })}` }, /kind が push の入口は、name を、空でない文字列で持つ/],
	["E1", "method と path の境目をまたぐ文字（改行）で、別の入口と同じ鍵にならない", { files: only([op("getA", { path: '"/a\\nb"' })]), list: line({ kind: "http", method: "GET\n/a", path: "b" }) }, /契約に無い入口: GET\n\/a b/],
	["E4", "JSON でない行", { list: `${LIST}\nGET /api/x` }, /一覧の 6 行目が JSON でない: GET \/api\/x/],
	["E4", "kind が無い", { list: `${LIST}\n${line({ method: "GET", path: "/x" })}` }, /一覧の 6 行目: kind が無いか、知らない種類/],
	["E4", "path が無い", { list: `${LIST}\n${line({ kind: "http", method: "GET" })}` }, /kind が http の入口は、method と path を、空でない文字列で持つ/],
	["E4", "path が文字列でない", { list: `${LIST}\n${line({ kind: "http", method: "GET", path: 1 })}` }, /kind が http の入口は、method と path を、空でない文字列で持つ/],
	["E4", "method が空", { list: `${LIST}\n${line({ kind: "http", method: "", path: "/x" })}` }, /kind が http の入口は、method と path を、空でない文字列で持つ/],
	["E4", "name が無い", { list: `${LIST}\n${line({ kind: "push" })}` }, /kind が push の入口は、name を、空でない文字列で持つ/],
	["E4", "知らない項目", { list: LIST.replace('"kind":"push"', '"kind":"push","file":"src/x.ts"') }, /知らない項目「file」がある/],
	["E4", "同じ入口の重複", { list: `${LIST}\n${h("GET", "/api/health")}` }, /一覧の 6 行目: 同じ入口が 4 行目にもある/],
	["E4", "list_entries が未宣言", { cfg: entriesCfg((c) => delete c.commands) }, /commands\.list_entries が宣言されていない/],
	["E4", "list_entries の形が誤り", { cfg: entriesCfg((c) => (c.commands.list_entries = ["node"])) }, /commands\.list_entries は、文字列のコマンドか/],
	["E4", "fixed の契約に inbound の操作があるのに none", { cfg: entriesCfg((c) => (c.commands.list_entries = { none: "入口は無い" })) }, /commands\.list_entries は none にできない（撤回されていない UC の fixed の契約に inbound の操作が 5 件ある。例: UC-001#getMember）/],
	["E4", "none に理由が無い", { cfg: entriesCfg((c) => (c.commands.list_entries = { none: "" })) }, /commands\.list_entries の none は、理由の文字列だけを持つ/],
	["E4", "docs.goals_dir が無い", { cfg: entriesCfg((c) => delete c.docs) }, /docs\.goals_dir が無いので、契約を読めない/],
];
for (const [id, name, opts, re] of BAD_ENTRIES) {
	test(`entries ${id}: ${name} は違反`, () => {
		const r = entries(opts);
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.match(r.stdout, re);
		assert.match(r.stdout, new RegExp(`err  ${id}  `));
	});
}

test("entries: 撤回済みの UC の契約は対象外（比べる項目が文字列でなくても、違反にしない）", () => {
	const r = entries({ files: { [`${G}/UC-003-old/contract.yaml`]: contract("UC-003", "fixed", [op("oldReport", { path: "123" })]) } });
	assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("entries: none は、撤回されていない UC の fixed の契約に inbound の操作が無い間だけ通り、確かめていないことを表示する", () => {
	const none = (c) => (c.commands.list_entries = { none: "外から呼ばれる入口を持たないバッチ" });
	const d = project({ cfg: entriesCfg(none), files: { ...DOCS, ...only([op("sendMail", { direction: "outbound", owned: false, method: "POST", path: "/v1/mail" })]) }, lcov: null });
	const r = run(d, "entries");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /commands\.list_entries = none（外から呼ばれる入口を持たないバッチ）: 契約に無い入口が無いかを確かめていない/);
});

//  フォルダの数え方は lint spec・lint refs・guard と同じ（tools/_shared/spec-tree.mjs）。
//  lint spec が検査しないフォルダに置いた「fixed の契約」を、入口の突き合わせ先に数えない
for (const dir of ["docs/goals/.stash/x", "docs/goals/_shared/x", "docs/goals/_tmp/x", `${G}/.hidden`, `${G}/_draft`, `${G}/_shared`]) {
	test(`entries E1: ほかの検査ツールが読まないフォルダ（${dir}）の契約は、突き合わせ先に数えない`, () => {
		const hidden = { [`${dir}/UC.md`]: ucDoc("UC-900"), [`${dir}/contract.yaml`]: contract("UC-900", "fixed", [op("wipe", { method: "DELETE", path: "/admin/everything" })]) };
		const r = entries({ files: hidden, list: `${LIST}\n${h("DELETE", "/admin/everything")}` });
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.match(r.stdout, /err  E1  契約に無い入口: DELETE \/admin\/everything/);
		//  入口が無ければ、そのフォルダの操作は入口を求めもしない（E2 にならない）
		assert.equal(entries({ files: hidden }).status, 0);
	});
}
