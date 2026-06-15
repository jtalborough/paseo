# Breakaway Plan

This document tracks J's fork of Paseo becoming an owned, self-hostable
agent-control app for ai-machine and related hosts.

The current fork is `https://github.com/jtalborough/paseo`. Upstream remains
`https://github.com/getpaseo/paseo`. Keep upstream copyright notices and the
AGPL-3.0-or-later license intact.

## Status

This is durable planning documentation for the fork-owned package and install
track. It is not release approval and it is not the current deployment
playbook.

- Use `docs/deployment.md` for the current pull-based Linux deploy flow.
- Use this document when planning package scope changes, GitHub Packages
  publishing, fork-owned endpoints, AGPL/source-offer work, and ai-machine
  install structure.
- Use `NOTICE.md` as the current fork notice and source-offer text.
- Keep this document until the package scope, product name, endpoint domains,
  and host install model are approved and represented in implementation docs.
- Do not run publish, release, tag, or registry mutation commands from this plan
  without explicit approval from J.

## Current State

- The root package is private and still points at upstream metadata:
  `homepage: https://paseo.sh`, `repository: getpaseo/paseo`, and upstream
  author metadata.
- Published workspace packages are still under `@getpaseo/*`: `highlight`,
  `relay`, `protocol`, `client`, `server`, and `cli`.
- `packages/app`, `packages/desktop`, and `packages/website` are private
  workspaces, but they depend on or bundle the `@getpaseo/*` packages.
- Release scripts publish public npm packages to the upstream npm scope. Do not
  run them for this fork until the package scope and registry policy are
  approved.
- Desktop and app workflows already read GitHub Packages in some build jobs,
  but the publish path is still npm-oriented.
- Linux host deployment already exists as a pull-based Actions artifact flow in
  `.github/workflows/deploy-linux-server.yml` and `scripts/deploy/*`.
- The Linux install script currently starts
  `node_modules/@getpaseo/server/dist/scripts/supervisor-entrypoint.js`, so a
  package-scope rename must update deploy scripts, not only package metadata.
- The relay defaults still point to upstream-hosted endpoints:
  `relay.paseo.sh:443` and `https://app.paseo.sh`.
- The Cloudflare relay worker is named `paseo-relay` and routes
  `relay.paseo.sh`.

## Breakaway Scope

The first approved slice should be documentation and install structure only.
Avoid deep internal renames until the package scope, public name, endpoint
domains, and package visibility are decided.

Smallest useful implementation branch:

1. Choose the public package scope and product name.
2. Add GitHub Packages publish configuration for server-side packages.
3. Update package metadata fields:
   - package names for publishable workspaces
   - internal dependency names
   - `repository`
   - `homepage`
   - `bugs`
   - package descriptions where user-visible
4. Keep upstream copyright and AGPL license text.
5. Keep `NOTICE.md` current with the modified-source location and upstream
   provenance.
6. Replace default relay/app endpoints with approved fork endpoints.
7. Update the Linux artifact workflow and install scripts for the chosen package
   scope.
8. Add ai-machine service templates for daemon, relay, and puller operation.
9. Defer desktop updater, app store, website, and mobile release renaming until
   the server/CLI/relay path is installable.

## Package Publishing Plan

Target GitHub Packages, not public npm, for the first owned channel.

Candidate publishable packages:

- `<scope>/highlight`
- `<scope>/relay`
- `<scope>/protocol`
- `<scope>/client`
- `<scope>/server`
- `<scope>/cli`

Required changes after scope approval:

- Change publishable workspace `name` fields from `@getpaseo/*` to the chosen
  scope.
- Change internal dependencies and root npm scripts to reference the new names.
- Set `publishConfig.registry` to `https://npm.pkg.github.com`.
- Decide `publishConfig.access` based on package visibility:
  - public packages are simpler for installation from multiple hosts
  - private packages require GitHub token handling on every host and workflow
- Update `scripts/sync-workspace-versions.mjs` so it syncs the chosen scope.
- Update release scripts or create fork-specific publish scripts that cannot
  accidentally publish to upstream npm.
- Keep dry-run verification separate from publish commands.

Do not run `npm publish`, release scripts, tag pushes, or package registry
mutations until J explicitly approves the scope and release path.

## Endpoint Plan

Defaults that need replacement after domains are chosen:

- `DEFAULT_RELAY_ENDPOINT` and related fallbacks in daemon config/bootstrap
- pairing offer defaults in `packages/server/src/server/pairing-offer.ts`
- relay proof and latency scripts
- app/desktop help, update, download, and docs URLs
- `packages/relay/wrangler.toml`
- website route, metadata, and release API URLs if the website is retained

Until domains are chosen, hosts can override runtime endpoints with:

```bash
PASEO_RELAY_ENDPOINT=<relay-host>:443
PASEO_RELAY_PUBLIC_ENDPOINT=<public-relay-host>:443
PASEO_RELAY_USE_TLS=true
PASEO_RELAY_PUBLIC_USE_TLS=true
PASEO_APP_BASE_URL=https://<app-host>
```

## ai-machine Install Skeleton

The first install path should be headless server/CLI/relay, with desktop and
mobile release workflows following later.

Proposed host layout:

```text
/opt/paseo/
  bin/
    pull-linux-release.sh
  current -> releases/<revision>
  releases/<revision>/
  state/
/var/lib/paseo/
```

Daemon service:

```ini
[Unit]
Description=J Paseo daemon
After=network.target

[Service]
Type=simple
User=paseo
WorkingDirectory=/opt/paseo/current
Environment=PASEO_HOME=/var/lib/paseo
Environment=PASEO_LISTEN=127.0.0.1:6767
Environment=PASEO_RELAY_ENABLED=true
Environment=PASEO_RELAY_ENDPOINT=<relay-host>:443
Environment=PASEO_RELAY_PUBLIC_ENDPOINT=<public-relay-host>:443
Environment=PASEO_APP_BASE_URL=https://<app-host>
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Pull service:

```ini
[Unit]
Description=Pull latest J Paseo Linux deploy artifact

[Service]
Type=oneshot
User=deploy
Environment=PASEO_DEPLOY_REPO=jtalborough/paseo
Environment=PASEO_DEPLOY_BRANCH=jta/dev
Environment=PASEO_DEPLOY_PATH=/opt/paseo
Environment=PASEO_RESTART_COMMAND=sudo systemctl restart paseo
Environment=PASEO_SMOKE_COMMAND=curl --fail --silent --show-error http://127.0.0.1:6767/api/health
ExecStart=/opt/paseo/bin/pull-linux-release.sh
```

Pull timer:

```ini
[Unit]
Description=Poll GitHub Actions for J Paseo Linux deploy artifacts

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
```

Relay deployment options:

- Cloudflare Worker using `packages/relay` and a fork-owned route.
- Node/WebSocket relay process behind an owned reverse proxy if Cloudflare is
  not desired.

## AGPL Obligations

The project is AGPL-3.0-or-later. For this fork:

- Preserve upstream copyright and license notices.
- Keep corresponding source available for any modified network service offered
  to users.
- Ensure published packages, deploy artifacts, desktop builds, mobile builds,
  and hosted app/relay services point users to the fork's source.
- Keep `NOTICE.md` available from published packages, deploy artifacts, desktop
  builds, mobile builds, hosted app/relay services, and any retained website.
- Update `NOTICE.md` once the public name, domains, and release channel are
  final.

This is engineering guidance, not legal advice.

## Decisions Needed

- Package scope: for example `@jtalborough`, `@jta`, or another organization
  scope.
- Product/package name: keep `paseo` temporarily or choose a fork name now.
- GitHub Packages visibility: public for simple installs, or private with token
  management.
- Domains:
  - app base URL
  - relay public endpoint
  - website/docs URL
  - desktop update release location
- Whether ai-machine should track `jta/dev`, `main`, beta tags, or stable tags.
- Whether relay is Cloudflare Worker first or a Linux-hosted service first.
- Whether the CLI binary should stay `paseo` during the transition.

## First Implementation Checklist

- [ ] Approve package scope and package visibility.
- [x] Add fork notice/source-offer text.
- [ ] Add fork-specific GitHub Packages dry-run workflow.
- [ ] Update package metadata and internal workspace dependencies.
- [ ] Update Linux deploy artifact packing and install script for the new scope.
- [ ] Add checked-in systemd templates after final service names are chosen.
- [ ] Replace relay/app defaults with approved endpoints.
- [ ] Verify with dry-run package packing and `bash -n` for deploy scripts.
