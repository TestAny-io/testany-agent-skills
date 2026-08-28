#!/bin/sh
set -u
. "$(dirname "$0")/probe.sh"
permission_state get pods review-space
