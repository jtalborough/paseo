# Mobile Delivery

How to get a Paseo change from this checkout onto an iPhone and prove which build is running.

## Build identity

The mobile app shows its identity in Settings -> About:

- App version: package/app version installed on the device.
- App build: app variant plus Paseo build line.
- App commit: short git SHA and branch when the build was stamped with metadata.
- Connected hosts: daemon version plus host commit/branch when the daemon reports build metadata.

For local builds, stamp the app with the same metadata as the daemon when practical:

```bash
export PASEO_BUILD_VERSION=2.0
export PASEO_BUILD_SHA="$(git rev-parse HEAD)"
export PASEO_BUILD_BRANCH="$(git branch --show-current)"
export PASEO_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

If these variables are absent, the app still shows package version and variant, but commit and build
time may be unknown.

## iPhone development install

Use this for the normal "get the current branch onto my phone" loop.

Prerequisites:

- Xcode installed and opened at least once.
- iPhone connected to the Mac over USB or available to Xcode over Wi-Fi.
- The iPhone is trusted by the Mac.
- Apple development signing is configured in Xcode for the generated iOS project.

From the repo root:

```bash
npm run ios:doctor
npm run ios:device
```

The doctor checks Xcode selection, `xcodebuild`, CocoaPods, and whether Xcode CoreDevice can see a
physical iPhone. The device script runs the same doctor before it runs `build:client`,
prebuilds/runs the Expo iOS app with `APP_VARIANT=development`, and asks Expo/Xcode to install
`Paseo Debug` on a selected device.

If device selection is ambiguous, run from `packages/app` with Expo's interactive selector:

```bash
npm run ios:device -- --device
```

If the doctor reports no physical iPhone, unlock the phone, trust the Mac, and confirm it appears in
Xcode > Window > Devices and Simulators before rerunning the install.

## iPhone release-style local install

Use this when you need a production-variant local build on a physical iPhone:

```bash
npm run ios:device:release
```

This selects `APP_VARIANT=production` and `--configuration Release`. It is still a local Xcode
install, not an App Store/TestFlight submission.

## Verification checklist

After install:

1. Open Paseo on the iPhone.
2. Open Settings -> About.
3. Confirm App version/build/commit match the checkout or release being tested.
4. Connect to the intended daemon.
5. Confirm the connected host version/build is visible and matches the daemon you expect.
6. Open Projects and confirm the Paseo Project appears.
7. Open an active agent or task and send a small message or refresh action.

Do not call a mobile change verified until the installed iPhone app and connected daemon identity
are visible in the app.

## Store/TestFlight releases

Stable `v*` tags trigger EAS iOS production builds through the EAS GitHub app. That path uploads to
TestFlight and submits for App Store review. See `docs/release.md` for the release babysitting flow.

Local iPhone installs are for development verification. TestFlight/App Store delivery is for shared
or stable release verification.
