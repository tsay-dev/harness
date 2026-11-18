//  契約の語彙のうち、複数のコマンドが使うもの（lint spec・lint entries・convert）。
//  コマンドごとに語彙や「書いてある」の判定が違うと、lint spec が通した契約を lint entries が読めない、という食い違いになる
//  （ADR-0056。読み方を 1 つにする）。

//  契約の transport の語彙（閉じている）。入口の一覧の kind も同じ語を使う
export const TRANSPORTS = ["http", "sdk", "local-store", "deeplink", "push", "device", "internal", "stream"];
//  契約に entry（入口の名前）を書く transport。それ以外の、http でない transport の入口は、操作の名前で表す
export const ENTRY_TRANSPORTS = ["deeplink", "push", "stream"];

//  契約と入口の一覧の、突き合わせに使う項目（wire.method・wire.path・entry、一覧の method・path・name）が書いてあるか。
//  空でない文字列だけを「書いてある」とみなす（空白だけは空とみなす。数や真偽値は文字列でない）
export const isFilledText = (v) => typeof v === "string" && v.trim() !== "";
