#!/usr/bin/env bash
# Runs every test and builds both frontends. Must be green before a commit.
#
# Uses local Java 21+ and Node 20+ when they work; otherwise runs that half in Docker,
# so a clean machine only needs Docker. Backend tests start Postgres via Testcontainers,
# so Docker must be running either way.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"

java_major() {
  local java="${JAVA_HOME:+$JAVA_HOME/bin/}java"
  "$java" -XshowSettings:properties -version 2>&1 \
    | awk -F'= ' '/java.specification.version/ {print $2}' | cut -d. -f1
}

node_major() {
  node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'
}

if [ "$(java_major || true)" -ge 21 ] 2>/dev/null; then
  echo "==> Java: engine + backend (local JDK)"
  ./mvnw -q -B verify
else
  echo "==> Java: engine + backend (no local JDK 21+, using Docker)"
  # The socket mount lets Testcontainers start Postgres next to this container;
  # host.docker.internal is how the tests reach it.
  docker run --rm \
    -v "$ROOT":/src -w /src \
    -v feature-flags-m2:/root/.m2 \
    -v /var/run/docker.sock:/var/run/docker.sock \
    --add-host=host.docker.internal:host-gateway \
    -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
    maven:3.9-eclipse-temurin-21 \
    mvn -q -B verify
fi

for app in admin demo; do
  if [ "$(node_major || true)" -ge 20 ] 2>/dev/null; then
    echo "==> $app: typecheck + build (local Node)"
    npm --prefix "$app" ci --no-audit --no-fund --silent
    npm --prefix "$app" run --silent build
  else
    echo "==> $app: typecheck + build (no local Node 20+, using Docker)"
    # Anonymous volume over node_modules keeps Linux binaries out of the host checkout.
    docker run --rm \
      -v "$ROOT/$app":/app -v /app/node_modules -w /app \
      node:22-alpine \
      sh -c "npm ci --no-audit --no-fund --silent && npm run --silent build"
  fi
done

echo "==> All green"
