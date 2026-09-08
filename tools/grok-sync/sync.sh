#!/usr/bin/env bash
# 中立 packages/ からの legacy 展開入口。旧 .claude 入力は受け付けない。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec "$ROOT/init.sh" grok "$@"
