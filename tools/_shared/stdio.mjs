//  標準入力・標準エラー出力を、パイプでも取りこぼさずに扱う（同期）。
//
//  Node はパイプへの書き込みを非同期に行う。書き込みが済む前に process.exit で終わると、残りは捨てられる
//  （出力が 64KB 前後で切れる）。コマンドの終わり方は、ふつうは process.exitCode に入れて自然に終わらせる。
//  使い方の誤りのように、処理の途中で止めたいところだけ exitWith を使い、メッセージを書き終えてから終わる。
//
//  readFileSync(0) は、標準入力のパイプが非ブロッキングのときに、書き手がまだ書いていなければ EAGAIN で落ちる。
//  Node は process.stdin に触れるだけでパイプを非ブロッキングにし、その設定はパイプを共有するほかのプロセスにも及ぶので、
//  コマンドの側からは避けられない。readStdin は EAGAIN を「まだ届いていない」とみなし、少し待って読み直す。

import { readSync, writeSync } from "node:fs";

const WAIT = new Int32Array(new SharedArrayBuffer(4));
const pause = () => Atomics.wait(WAIT, 0, 0, 10);

//  標準入力を最後まで読み、文字列で返す。終わりの印は、0 バイトの読み込み（POSIX）か、EOF のエラー（Windows のパイプ）
export function readStdin() {
	const chunks = [];
	const buf = Buffer.alloc(64 * 1024);
	for (;;) {
		let n;
		try {
			n = readSync(0, buf, 0, buf.length, null);
		} catch (e) {
			if (e.code === "EAGAIN") {
				pause();
				continue;
			}
			if (e.code === "EOF") break;
			throw e;
		}
		if (n === 0) break;
		chunks.push(Buffer.from(buf.subarray(0, n)));
	}
	return Buffer.concat(chunks).toString("utf8");
}

//  text を fd（1 = 標準出力、2 = 標準エラー出力）へ最後まで書く。読み手が閉じていれば（EPIPE）、あきらめる
export function writeAllSync(fd, text) {
	const buf = Buffer.from(text);
	let off = 0;
	while (off < buf.length) {
		try {
			off += writeSync(fd, buf, off, buf.length - off);
		} catch (e) {
			if (e.code === "EAGAIN") {
				pause();
				continue;
			}
			if (e.code === "EPIPE") return;
			throw e;
		}
	}
}

//  lines を 1 行ずつ標準エラー出力へ書き終えてから、code で終わる（console.error と同じく、各行の末尾に改行を付ける）。
//  先に process.stderr へ書いた分が残っていれば、それを捨てないよう、ここより前は process.stderr に書かない
export function exitWith(code, ...lines) {
	writeAllSync(2, lines.map((l) => `${l}\n`).join(""));
	process.exit(code);
}
