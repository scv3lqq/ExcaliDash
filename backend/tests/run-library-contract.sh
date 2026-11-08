#!/bin/sh
set -eu

# No published ports, production volumes, database access, or auth bypasses.
# Usage: backend/tests/run-library-contract.sh IMAGE [PRIVATE_LOG_DIRECTORY]
image=${1:?Pass the backend image to test}
log_dir=${2:-$(mktemp -d "${TMPDIR:-/tmp}/excalidash-library-contract.XXXXXX")}
mkdir -p "$log_dir"
chmod 700 "$log_dir"
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
name="library-contract-$(date +%s)-$$"
network="$name-network"
network_created=false
container_created=false
cleanup() {
  result=$?
  trap - EXIT INT TERM
  if [ "$container_created" = true ]; then
    docker logs "$name" 2>&1 | sed -E 's/(setup code \([^)]*\): )[^ ]+/\1[REDACTED]/g' > "$log_dir/backend.log" || true
    if ! docker rm -f "$name" >/dev/null; then
      echo "Failed to remove disposable container: $name" >&2
      result=1
    fi
  fi
  if [ "$network_created" = true ]; then
    if ! docker network rm "$network" >/dev/null; then
      echo "Failed to remove disposable network: $network" >&2
      result=1
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker network create --internal "$network" >/dev/null
network_created=true
docker create --name "$name" --network "$network" --cpus=0.5 --memory=512m \
  -e AUTH_MODE=local -e NODE_ENV=production -e DATABASE_PROVIDER=sqlite \
  -e DATABASE_URL=file:/app/prisma/contract.db -e UPDATE_CHECK_ENABLED=false \
  "$image" >/dev/null
container_created=true
docker start "$name" >/dev/null
ready=false
attempt=0
while [ "$attempt" -lt 60 ]; do
  if docker exec "$name" node -e 'fetch("http://127.0.0.1:8000/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
    ready=true
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done
[ "$ready" = true ] || { echo "Disposable backend did not become healthy" >&2; exit 1; }
docker exec -i "$name" node --input-type=module - --onboard < "$script_dir/library-scope-contract.mjs"
setup_code=$(docker logs "$name" 2>&1 | sed -nE 's/.*One-time admin setup code \([^)]*\): ([A-Z0-9-]+) .*/\1/p' | tail -n 1)
[ -n "$setup_code" ] || { echo "Fixture setup code missing" >&2; exit 1; }
docker exec -i -e SYNTHETIC_SETUP_CODE="$setup_code" "$name" node --input-type=module - < "$script_dir/library-scope-contract.mjs"
