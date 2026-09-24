#!/bin/sh
set -eu
if [ "$(uname -s)" != Darwin ]; then
  printf '%s\n' 'TeamDesk 一键启动目前仅支持 macOS。' >&2; exit 1
fi
TEAMDESK_CODEX_APP=${TEAMDESK_CODEX_APP:-$(/usr/bin/osascript -l JavaScript -e '
  ObjC.import("AppKit");
  var app = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier("com.openai.codex");
  if (!app.isNil()) ObjC.unwrap(app.path);
' 2>/dev/null || true)}
if [ -z "$TEAMDESK_CODEX_APP" ]; then
  printf '%s\n' '未找到 Codex Desktop。请先安装并正常打开一次 Codex，再重跑本安装命令。' >&2; exit 1
fi
check_node() {
  [ -x "$1" ] && "$1" --input-type=module -e '
    import {DatabaseSync} from "node:sqlite";
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (major < 22 || (major === 22 && minor < 13)) process.exit(1);
  ' >/dev/null 2>&1
}
INSTALL_NODE=${TEAMDESK_NODE:-}
if [ -n "$INSTALL_NODE" ]; then
  if ! check_node "$INSTALL_NODE"; then
    printf '%s\n' 'TEAMDESK_NODE 指定的 Node 不可用；需要 Node.js ≥22.13 且支持 node:sqlite。' >&2; exit 1
  fi
else
  for candidate in "$TEAMDESK_CODEX_APP/Contents/Resources/cua_node/bin/node" /opt/homebrew/bin/node /usr/local/bin/node "$(command -v node || true)"; do
    if check_node "$candidate"; then INSTALL_NODE=$candidate; break; fi
  done
fi
if [ -z "$INSTALL_NODE" ]; then
  printf '%s\n' '未找到 Node.js ≥22.13。请从 https://nodejs.org/ 安装受支持的 Node LTS 后重跑；也可用 TEAMDESK_NODE 指定已有运行时。' >&2; exit 1
fi
TEAMDESK_NODE=$INSTALL_NODE
export TEAMDESK_CODEX_APP TEAMDESK_NODE
exec "$INSTALL_NODE" "$(dirname "$0")/install.mjs" "$@"
