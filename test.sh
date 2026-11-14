#!/usr/bin/env bash
# Runs every test and builds both frontends. Must be green before a commit.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Java: engine + backend"
./mvnw -q -B verify

for app in admin demo; do
  echo "==> $app: typecheck + build"
  npm --prefix "$app" ci --no-audit --no-fund --silent
  npm --prefix "$app" run --silent build
done

echo "==> All green"
