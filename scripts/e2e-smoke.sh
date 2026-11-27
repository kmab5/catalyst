#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

port="${CATALYST_SMOKE_PORT:-4400}"
output="$(mktemp -d "${TMPDIR:-/tmp}/catalyst-e2e-XXXXXX")"
echo "Smoke responses: $output"
# Convert to a native absolute path for Node on Windows and leave POSIX paths alone elsewhere.
native_dir="$(cd "$output" && (pwd -W 2>/dev/null || pwd))"
first=""
second=""
stop_servers() {
  for pid in "$second" "$first"; do
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  done
}
trap stop_servers EXIT
trap 'exit 130' INT TERM
cli="packages/cli/dist/index.js"
if [[ ! -f "$cli" ]]; then echo "Build the workspace before running the smoke test." >&2; exit 1; fi
repo="$native_dir/ts-basic"
mkdir -p "$output/home"
node -e "require('node:fs').cpSync('fixtures/repos/ts-basic', process.argv[1], {recursive:true, filter:p=>require('node:path').basename(p)!=='.catalyst'})" "$repo"
# Isolate both CLI launches and the indexer from the user's recent projects and provider config.
run_cli() { env HOME="$native_dir/home" USERPROFILE="$native_dir/home" node "$cli" "$@"; }
run_cli index --no-ai "$repo" --json > "$output/run.json"

wait_for_health() {
  local url="$1" pid="$2" logfile="$3"
  for ((i=0; i<150; i++)); do
    if ! kill -0 "$pid" 2>/dev/null; then cat "$logfile" >&2; return 1; fi
    if curl --silent --fail --max-time 2 "$url/api/health" >/dev/null; then return; fi
    sleep 0.2
  done
  cat "$logfile" >&2
  return 1
}
for p in "$port" "$((port+1))"; do
  if curl --silent --max-time 1 "http://127.0.0.1:$p/" >/dev/null; then echo "Smoke port $p is occupied" >&2; exit 1; fi
done
start_cli() {
  exec env HOME="$native_dir/home" USERPROFILE="$native_dir/home" node "$cli" serve "$repo" --no-open --port "$port"
}
start_cli >"$output/serve.log" 2>&1 & first=$!
base="http://127.0.0.1:$port"
wait_for_health "$base" "$first" "$output/serve.log"
fetch_json() { curl --fail --silent --show-error --max-time 15 "$base/api/$2" > "$output/$1.json"; }
fetch_json ready health
fetch_json projects projects
pid="$(node -e "const p=require(process.argv[1]).find(p=>p.name==='ts-basic'); if(!p) process.exit(1); console.log(p.id)" "$native_dir/projects.json")"
project="projects/$pid"
id="$(node -e "process.stdout.write(encodeURIComponent('file:lib/session.ts'))")"
fetch_json project "$project"
fetch_json overview "$project/overview"
fetch_json features "$project/features"
fetch_json tree "$project/tree"
fetch_json xray "$project/nodes/$id"
fetch_json source "$project/nodes/$id/source"
fetch_json impact "$project/nodes/$id/impact"
fetch_json graph "$project/graph?level=file"
fetch_json find "$project/find?q=sess"
fetch_json search "$project/search?q=stripe"
fetch_json health "$project/health"
node --import tsx scripts/validate-dtos.ts "$native_dir"
start_cli >"$output/fallback.log" 2>&1 & second=$!
fallback="http://127.0.0.1:$((port+1))"
wait_for_health "$fallback" "$second" "$output/fallback.log"
grep -F "$fallback" "$output/fallback.log" >/dev/null
echo "Port fallback verified at $fallback"
