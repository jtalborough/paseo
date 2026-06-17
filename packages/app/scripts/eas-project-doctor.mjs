import { spawnSync } from "node:child_process";

const TIMEOUT_MS = 30_000;

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: TIMEOUT_MS,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    error: result.error,
  };
}

function commandSucceeded(result) {
  return result.status === 0 && !result.signal && !result.error;
}

function firstLine(value) {
  return (
    value
      .split("\n")
      .find((line) => line.trim().length > 0)
      ?.trim() ?? ""
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

const whoamiLines = whoami.stdout.split("\n").map((line) => line.trim());
const username = whoamiLines.find((line) => line.length > 0 && !line.startsWith("★")) ?? "unknown";
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
