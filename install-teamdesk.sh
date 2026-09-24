#!/bin/sh
# Download this file and run `sh install-teamdesk.sh`, or run it from a clone.
set -eu
umask 077
case "${1:-}" in
  --help|-h)
    printf '%s\n' 'TeamDesk installer (macOS)' \
      'Usage: sh install-teamdesk.sh [--check] [--no-open] [--destination /path/TeamDesk.app]' \
      'From a repository checkout: install that checkout. Downloaded script: install GitHub main.' \
      '--check: dependency checks only. --no-open: install without opening the launcher.'
    exit 0 ;;
esac
if [ "$(uname -s)" != Darwin ]; then
  printf '%s\n' 'TeamDesk 一键启动目前仅支持 macOS。' >&2; exit 1
fi
INSTALL_ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd)
INSTALL_ENTRY=plugins/teamdesk/skills/team-workspace/scripts/install.sh
if [ -f "$INSTALL_ROOT/$INSTALL_ENTRY" ] && [ -f "$INSTALL_ROOT/.claude-plugin/marketplace.json" ]; then
  exec /bin/sh "$INSTALL_ROOT/$INSTALL_ENTRY" --source "$INSTALL_ROOT" "$@"
fi
INSTALL_TMP=$(mktemp -d "${TMPDIR:-/tmp}/teamdesk-install.XXXXXX")
trap 'rm -rf "$INSTALL_TMP"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s\n' '正在下载 GitHub main 的 TeamDesk 安装程序…'
/usr/bin/curl --fail --location --show-error --silent --proto '=https' --proto-redir '=https' \
  --connect-timeout 15 --max-time 180 --retry 2 \
  https://codeload.github.com/TestAny-io/testany-agent-skills/tar.gz/refs/heads/main \
  --output "$INSTALL_TMP/source.tar.gz"
/usr/bin/tar -xzf "$INSTALL_TMP/source.tar.gz" -C "$INSTALL_TMP"
INSTALL_DOWNLOADED="$INSTALL_TMP/testany-agent-skills-main/$INSTALL_ENTRY"
if [ ! -f "$INSTALL_DOWNLOADED" ]; then
  printf '%s\n' '下载内容缺少 TeamDesk 安装入口，安装未执行。请重新下载后重试。' >&2; exit 1
fi
/bin/sh "$INSTALL_DOWNLOADED" "$@"
