#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: install-linux-release.sh <artifact-dir> <deploy-path> <revision>" >&2
  exit 64
fi

artifact_dir="$1"
deploy_path="$2"
revision="$3"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required on the deploy host" >&2
  exit 69
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required on the deploy host" >&2
  exit 69
fi

if ! compgen -G "$artifact_dir/packages/*.tgz" >/dev/null; then
  echo "no package tarballs found in $artifact_dir/packages" >&2
  exit 66
fi

release_dir="$deploy_path/releases/$revision"
packages_dir="$release_dir/packages"

mkdir -p "$packages_dir"
cp "$artifact_dir"/packages/*.tgz "$packages_dir"/

cat >"$release_dir/package.json" <<'JSON'
{
  "name": "paseo-linux-deploy",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node node_modules/@getpaseo/server/dist/scripts/supervisor-entrypoint.js"
  }
}
JSON

(
  cd "$release_dir"
  npm install --omit=dev --no-audit --fund=false ./packages/*.tgz
)

printf '%s\n' "$revision" >"$release_dir/REVISION"
if [ -f "$artifact_dir/BUILD.json" ]; then
  cp "$artifact_dir/BUILD.json" "$release_dir/BUILD.json"
else
  PASEO_BUILD_SHA="$revision" node -e 'const fs = require("fs"); fs.writeFileSync(process.argv[1], JSON.stringify({ version: process.env.PASEO_BUILD_VERSION || "2.0", sha: process.env.PASEO_BUILD_SHA || null, branch: process.env.PASEO_BUILD_BRANCH || null, builtAt: process.env.PASEO_BUILD_TIME || null }, null, 2) + "\n");' "$release_dir/BUILD.json"
fi

mkdir -p "$deploy_path"
ln -sfn "$release_dir" "$deploy_path/current.next"
mv -Tf "$deploy_path/current.next" "$deploy_path/current"

if [ -n "${PASEO_RESTART_COMMAND:-}" ]; then
  (
    cd "$deploy_path/current"
    bash -lc "$PASEO_RESTART_COMMAND"
  )
fi

if [ -n "${PASEO_SMOKE_COMMAND:-}" ]; then
  (
    cd "$deploy_path/current"
    bash -lc "$PASEO_SMOKE_COMMAND"
  )
fi

keep_releases="${PASEO_KEEP_RELEASES:-5}"
if [[ "$keep_releases" =~ ^[0-9]+$ ]] && [ "$keep_releases" -gt 0 ]; then
  find "$deploy_path/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -rn \
    | awk -v keep="$keep_releases" 'NR > keep { print substr($0, index($0, $2)) }' \
    | xargs -r rm -rf
fi

echo "Paseo release $revision installed at $release_dir"
