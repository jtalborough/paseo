# Deployment

This repo ships public desktop/mobile/web releases through the release workflows in
`docs/release.md`. Private Linux host deploys use a pull-based flow:

1. GitHub Actions builds and uploads a Linux deploy artifact.
2. The Linux server periodically pulls the latest successful artifact.
3. The server installs that artifact locally, flips a `current` symlink, restarts Paseo, and runs a
   smoke check.

This keeps the server closed to inbound deploy traffic. GitHub never SSHs into the host.

## Linux Server Artifact Build

`.github/workflows/deploy-linux-server.yml` builds the server-side workspace stack, typechecks it,
packs the daemon/CLI npm workspaces, and uploads an artifact named `paseo-linux-<git-sha>`.

The artifact includes:

- npm tarballs for `@getpaseo/highlight`, `@getpaseo/relay`, `@getpaseo/protocol`,
  `@getpaseo/client`, `@getpaseo/server`, and `@getpaseo/cli`
- `install-linux-release.sh`
- `pull-linux-release.sh`

The workflow runs on `main` when server-side packages, deploy scripts, or lockfiles change. It can
also be run manually from GitHub Actions.

## Linux Server Puller

Run `scripts/deploy/pull-linux-release.sh` on the Linux host. It finds the latest successful
`deploy-linux-server.yml` run for the configured branch, downloads the matching artifact, installs it
with `install-linux-release.sh`, then records the deployed SHA under
`<deploy-path>/state/last-deployed`.

Required host tools:

- Node.js 22 and npm
- GitHub CLI (`gh`)
- outbound HTTPS access to GitHub

For a private repo, authenticate `gh` with a fine-scoped token that can read Actions artifacts:

```bash
gh auth login
```

or run the service with `GH_TOKEN` set.

Required environment:

```bash
PASEO_DEPLOY_REPO=jtalborough/paseo
```

Optional environment:

```bash
PASEO_DEPLOY_WORKFLOW=deploy-linux-server.yml
PASEO_DEPLOY_BRANCH=main
PASEO_DEPLOY_PATH=/opt/paseo
PASEO_DEPLOY_FORCE=1
PASEO_RESTART_COMMAND="sudo systemctl restart paseo"
PASEO_SMOKE_COMMAND="curl --fail --silent --show-error http://127.0.0.1:6767/health"
PASEO_KEEP_RELEASES=5
```

## Install Layout

`install-linux-release.sh` installs into:

```text
<deploy-path>/
  current -> releases/<git-sha>
  releases/<git-sha>/
    package.json
    node_modules/
    packages/*.tgz
    REVISION
  state/last-deployed
```

`current` is swapped atomically with `ln -sfn` + `mv -Tf`.

## systemd Example

One workable host layout:

- Deploy path: `/opt/paseo`
- Runtime state: `/var/lib/paseo`
- Service user: `paseo`

Daemon service:

```ini
[Unit]
Description=Paseo daemon
After=network.target

[Service]
Type=simple
User=paseo
WorkingDirectory=/opt/paseo/current
Environment=PASEO_HOME=/var/lib/paseo
Environment=PASEO_LISTEN=127.0.0.1:6767
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Pull service:

```ini
[Unit]
Description=Pull latest Paseo Linux deploy artifact

[Service]
Type=oneshot
User=deploy
Environment=PASEO_DEPLOY_REPO=jtalborough/paseo
Environment=PASEO_DEPLOY_BRANCH=main
Environment=PASEO_DEPLOY_PATH=/opt/paseo
Environment=PASEO_RESTART_COMMAND=sudo systemctl restart paseo
Environment=PASEO_SMOKE_COMMAND=curl --fail --silent --show-error http://127.0.0.1:6767/health
ExecStart=/opt/paseo/bin/pull-linux-release.sh
```

Pull timer:

```ini
[Unit]
Description=Poll GitHub Actions for Paseo Linux deploy artifacts

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
```

If the deploy user is not `root`, grant only the restart command:

```sudoers
deploy ALL=(root) NOPASSWD: /bin/systemctl restart paseo, /bin/systemctl status paseo
```

## Bootstrap

Create the deploy path and install the pull script once:

```bash
sudo mkdir -p /opt/paseo/bin
sudo cp scripts/deploy/pull-linux-release.sh /opt/paseo/bin/
sudo chmod +x /opt/paseo/bin/pull-linux-release.sh
```

After the first successful pull, each artifact also carries the current deploy scripts. You can
refresh `/opt/paseo/bin/pull-linux-release.sh` from the downloaded artifact if the puller changes.

## Rollback

Releases are stored under `<deploy-path>/releases/<git-sha>`. To roll back manually:

```bash
cd /opt/paseo
ln -sfn releases/<previous-sha> current.next
mv -Tf current.next current
sudo systemctl restart paseo
printf '%s\n' '<previous-sha>' > state/last-deployed
```

The deploy script prunes old releases after a successful install. Keep more releases by setting
`PASEO_KEEP_RELEASES`.

## Release Assets Alternative

For a stricter release-only flow, use GitHub Release assets instead of Actions artifacts. The host
poller would look at the latest non-prerelease GitHub Release and download a `paseo-linux-<tag>.tgz`
asset. That is a good fit when the Linux server should update only on versioned releases, not every
successful `main` build.

The current implementation intentionally uses Actions artifacts so the server can track `main`
without exposing SSH.
