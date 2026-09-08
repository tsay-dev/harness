#!/usr/bin/env bash
# 選択した中立パッケージの legacy 展開。通常の消費側は apm install を使う。
set -euo pipefail
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ $# -eq 0 || "$1" == '-h' || "$1" == '--help' ]]; then
  cat <<'EOF'
usage: ./init.sh <claude|cursor|grok|codex|install> [TARGET] --package NAME [--package NAME ...]

例: ./init.sh codex . --package develop-core --package rules-next
install は claude の別名。パッケージの全部入り既定値はありません。
正経路は apm install。apm.yml / apm_modules / lock がある消費側への legacy 展開は拒否します。
旧 --mode / update / --force は自動変換しません。docs/apm.md の移行手順を参照してください。
生成物は直接編集せず packages/（ツールは tools/）を直して同じ選択で再実行してください。
EOF
  exit 0
fi
ACTION="$1"; shift
[[ "$ACTION" != install ]] || ACTION=claude
case "$ACTION" in
  claude|cursor|grok|codex) exec python3 "$SRC_DIR/tools/apm/project.py" "$ACTION" "$@" ;;
  *) echo "未対応の旧操作: $ACTION。./init.sh --help と docs/apm.md を参照してください。既存配置は変更していません。" >&2; exit 2 ;;
esac
