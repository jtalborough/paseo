#!/usr/bin/env bash
set -euo pipefail

repo="${PASEO_DEPLOY_REPO:-}"
workflow="${PASEO_DEPLOY_WORKFLOW:-deploy-linux-server.yml}"
branch="${PASEO_DEPLOY_BRANCH:-main}"
deploy_path="${PASEO_DEPLOY_PATH:-$HOME/paseo}"
force="${PASEO_DEPLOY_FORCE:-0}"

usage() {
  cat >&2 <<'USAGE'
usage: pull-linux-release.sh

Required env:
  PASEO_DEPLOY_REPO=owner/repo

Optional env:
  PASEO_DEPLOY_WORKFLOW=deploy-linux-server.yml
  PASEO_DEPLOY_BRANCH=main
  PASEO_DEPLOY_PATH=$HOME/paseo
  PASEO_DEPLOY_FORCE=1
  PASEO_RESTART_COMMAND='sudo systemctl restart paseo'
  PASEO_SMOKE_COMMAND='curl --fail --silent --show-error http://127.0.0.1:6767/health'
  PASEO_KEEP_RELEASES=5

Authentication:
  gh must be installed and authenticated. For private repos, set GH_TOKEN or run gh auth login.
USAGE
}

if [ -z "$repo" ]; then
  usage
  exit 64
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required on the deploy host" >&2
  exit 69
fi

run_id="$(
  gh run list \
    --repo "$repo" \
    --workflow "$workflow" \
    --branch "$branch" \
    --limit 20 \
    --json databaseId,headSha,conclusion \
    --jq 'map(select(.conclusion == "success")) | .[0].databaseId // ""'
)"

head_sha="$(
  gh run list \
    --repo "$repo" \
    --workflow "$workflow" \
    --branch "$branch" \
    --limit 20 \
    --json databaseId,headSha,conclusion \
    --jq 'map(select(.conclusion == "success")) | .[0].headSha // ""'
)"

if [ -z "$run_id" ] || [ -z "$head_sha" ]; then
  echo "no successful $workflow run found for $repo:$branch" >&2
  exit 75
fi

state_dir="$deploy_path/state"
last_deployed_file="$state_dir/last-deployed"
last_deployed=""
if [ -f "$last_deployed_file" ]; then
  last_deployed="$(cat "$last_deployed_file")"
fi

if [ "$force" != "1" ] && [ "$last_deployed" = "$head_sha" ]; then
  echo "Paseo $head_sha is already deployed"
  exit 0
fi

work_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

artifact_name="paseo-linux-$head_sha"
gh run download "$run_id" \
  --repo "$repo" \
  --name "$artifact_name" \
  --dir "$work_dir"

if [ ! -x "$work_dir/install-linux-release.sh" ]; then
  chmod +x "$work_dir/install-linux-release.sh"
fi

"$work_dir/install-linux-release.sh" "$work_dir" "$deploy_path" "$head_sha"

mkdir -p "$state_dir"
printf '%s\n' "$head_sha" >"$last_deployed_file"

echo "Paseo $head_sha deployed from GitHub Actions run $run_id"
