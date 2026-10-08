#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Hand-written 0.11.x launcher sample used by tests/compat-matrix.test.mjs.
set -eu
script_dir=$(CDPATH='' cd -- "$(/usr/bin/dirname -- "$0")" && pwd -P)
exec "${SKILLDOCK_NODE_BIN:?}" "$script_dir/stub-launcher.mjs" "$@"
