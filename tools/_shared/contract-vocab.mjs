//  契約の語彙のうち、複数のコマンドが使うもの（lint spec・lint entries・convert）。
//  コマンドごとに語彙や「書いてある」の判定が違うと、lint spec が通した契約を lint entries が読めない、という食い違いになる
//  （ADR-0056。読み方を 1 つにする）。

//  契約の x-status の語彙（閉じている）。fixed ＝ 構造オラクル不整合ゼロで orchestrator が凍結した
export const CONTRACT_STATUS = ["draft", "fixed"];
//  操作の名前と観測者の名前の形（lowerCamelCase）
export const OP_NAME_RE = /^[a-z][A-Za-z0-9]*$/;
//  契約の transport の語彙（閉じている）。入口の一覧の kind も同じ語を使う
export const TRANSPORTS = ["http", "sdk", "local-store", "deeplink", "push", "device", "internal", "stream"];
//  契約の direction の語彙（閉じている）。outbound = このアプリが呼ぶ / inbound = このアプリが呼ばれる
export const DIRECTIONS = ["outbound", "inbound"];
//  契約に entry（入口の名前）を書く transport。それ以外の、http でない transport の入口は、操作の名前で表す
export const ENTRY_TRANSPORTS = ["deeplink", "push", "stream"];

//  契約と入口の一覧の、突き合わせに使う項目（wire.method・wire.path・entry、一覧の method・path・name）が書いてあるか。
//  空でない文字列だけを「書いてある」とみなす（空白だけは空とみなす。数や真偽値は文字列でない）
export const isFilledText = (v) => typeof v === "string" && v.trim() !== "";
