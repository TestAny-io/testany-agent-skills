#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../workspace" && pwd)
exec "$root/.tools/bin/contract-check" lint \
  --schema "$root/contracts/receipt.schema.json" \
  --example "$root/examples/receipt.json" \
  --example "$root/examples/receipt-without-id.json" \
  --baseline "$root/contracts/receipt.v1.schema.json"
