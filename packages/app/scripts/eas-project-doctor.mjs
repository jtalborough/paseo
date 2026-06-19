import { spawnSync } from "node:child_process";

const TIMEOUT_MS = 30_000;
const EAS_PROBE_ATTEMPTS = 3;
const requireAppleTeam = process.argv.includes("--require-apple-team");
const DEFAULT_APPLE_TEAM_ID = "YYQHJ5E4H8";
const appleTeamId = process.env.PASEO_APPLE_TEAM_ID?.trim() || DEFAULT_APPLE_TEAM_ID;

function run(command, args) {
  let lastResult = null;
  for (let attempt = 1; attempt <= EAS_PROBE_ATTEMPTS; attempt += 1) {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      timeout: TIMEOUT_MS,
    });
    lastResult = {
      status: result.status,
      signal: result.signal,
      stdout: result.stdout?.trim() ?? "",
      stderr: result.stderr?.trim() ?? "",
      error: result.error,
    };

    if (commandSucceeded(lastResult) || !isTransientEasFailure(lastResult)) {
      return lastResult;
    }

    if (attempt < EAS_PROBE_ATTEMPTS) {
      spawnSync("sleep", ["2"]);
    }
  }
  return lastResult;
}

function commandSucceeded(result) {
  return result.status === 0 && !result.signal && !result.error;
}

function isTransientEasFailure(result) {
  const details = `${result.stdout}\n${result.stderr}\n${result.error?.message ?? ""}`;
  return (
    details.includes("GraphQL request failed") ||
    details.includes("request to https://api.expo.dev/graphql failed") ||
    details.includes("Check your network connection")
  );
}

function firstLine(value) {
  return (
    value
      .split("\n")
      .find((line) => line.trim().length > 0 && !isEasCliNoticeLine(line))
      ?.trim() ?? ""
  );
}

function isEasCliNoticeLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("★ eas-cli@") ||
    trimmed === "To upgrade, run:" ||
    trimmed.startsWith("npm install ") ||
    trimmed === "Proceeding with outdated version."
  );
}

function printPass(label, detail) {
  console.log(`PASS ${label}${detail ? `: ${detail}` : ""}`);
}

function printFail(label, detail) {
  console.error(`FAIL ${label}${detail ? `: ${detail}` : ""}`);
}

const whoami = run("npx", ["eas", "whoami"]);
if (!commandSucceeded(whoami)) {
  printFail("Expo account", firstLine(whoami.stderr) || whoami.error?.message || "not logged in");
  console.error("\nRun `npx eas login`, then retry the OTA command.");
  process.exit(1);
}

const whoamiLines = whoami.stdout
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !isEasCliNoticeLine(line));
const username = whoamiLines.find((line) => /^[\w-]+$/.test(line)) ?? "unknown";
printPass("Expo account", username);

const projectInfo = run("npx", ["eas", "project:info"]);
if (!commandSucceeded(projectInfo)) {
  const details = `${projectInfo.stdout}\n${projectInfo.stderr}`;
  const permissionHint = details.includes("Entity not authorized")
    ? "Logged-in Expo account cannot read this app's EAS project."
    : firstLine(projectInfo.stderr) || firstLine(projectInfo.stdout) || "project access failed";

  printFail("EAS project access", permissionHint);
  console.error("\nThis checkout is configured for the EAS project in packages/app/app.config.js.");
  console.error("Fix one of these before running OTA delivery:");
  console.error("- Add the logged-in Expo account to the configured Expo owner/project.");
  console.error("- Run `npx eas login` with an account that already has access.");
  console.error("- Relink the app to an EAS project owned by your Expo account or organization.");
  process.exit(1);
}

printPass("EAS project access", "current project is readable");

if (!requireAppleTeam) {
  process.exit(0);
}

const devices = run("npx", [
  "eas",
  "device:list",
  "--apple-team-id",
  appleTeamId,
  "--json",
  "--non-interactive",
  "--limit",
  "1",
]);
if (!commandSucceeded(devices)) {
  const details = `${devices.stdout}\n${devices.stderr}`;
  const teamHint =
    details.includes("Couldn't find any teams") ||
    details.includes("Unable to select an Apple team")
      ? "No Apple Developer team is configured for this Expo account."
      : firstLine(devices.stderr) || firstLine(devices.stdout) || "Apple device access failed";

  printFail("Apple Developer team", teamHint);
  console.error("\nInternal iOS install links require Apple signing credentials.");
  console.error("Fix one of these before registering an iPhone or building an iOS OTA install:");
  console.error("- Enroll the Apple ID in the Apple Developer Program.");
  console.error("- Add the Apple ID to an existing Apple Developer team.");
  console.error("- Run `npm run ios:credentials` and let EAS configure iOS signing.");
  process.exit(1);
}

printPass("Apple Developer team", `device registry is reachable for ${appleTeamId}`);
