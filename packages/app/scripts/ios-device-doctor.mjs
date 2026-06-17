import { spawnSync } from "node:child_process";

const TIMEOUT_MS = 20_000;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeoutMs ?? TIMEOUT_MS,
  });
  return {
    command: [command, ...args].join(" "),
    status: result.status,
    signal: result.signal,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    error: result.error,
  };
}

function firstLine(value) {
  return (
    value
      .split("\n")
      .find((line) => line.trim().length > 0)
      ?.trim() ?? ""
  );
}

function printCheck(name, result) {
  if (result.ok) {
    console.log(`PASS ${name}${result.detail ? `: ${result.detail}` : ""}`);
    return;
  }
  console.error(`FAIL ${name}${result.detail ? `: ${result.detail}` : ""}`);
}

function commandSucceeded(result) {
  return result.status === 0 && !result.signal && !result.error;
}

function parseJsonPayload(output) {
  const start = output.indexOf("{");
  if (start < 0) {
    return null;
  }
  try {
    return JSON.parse(output.slice(start));
  } catch {
    return null;
  }
}

function collectDeviceNames(value, names = []) {
  if (!value || typeof value !== "object") {
    return names;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectDeviceNames(item, names);
    }
    return names;
  }

  const record = value;
  const name = record.name ?? record.deviceName ?? record.displayName;
  const identifier = record.identifier ?? record.udid ?? record.ecid;
  if (typeof name === "string" && typeof identifier === "string") {
    names.push(name);
  }

  for (const item of Object.values(record)) {
    collectDeviceNames(item, names);
  }

  return names;
}

function checkXcodeSelect() {
  const result = run("xcode-select", ["-p"]);
  return {
    ok: commandSucceeded(result) && result.stdout.includes("Xcode.app"),
    detail: commandSucceeded(result)
      ? result.stdout
      : firstLine(result.stderr) || result.error?.message || "xcode-select failed",
  };
}

function checkXcodeBuild() {
  const result = run("xcrun", ["--find", "xcodebuild"]);
  return {
    ok: commandSucceeded(result),
    detail: commandSucceeded(result)
      ? result.stdout
      : firstLine(result.stderr) || result.error?.message || "xcodebuild not found",
  };
}

function checkCocoaPods() {
  const result = run("pod", ["--version"]);
  return {
    ok: commandSucceeded(result),
    detail: commandSucceeded(result)
      ? result.stdout
      : firstLine(result.stderr) || result.error?.message || "CocoaPods not found",
  };
}

function checkPhysicalDevices() {
  const result = run("xcrun", ["devicectl", "list", "devices", "--json-output", "-"], {
    timeoutMs: 30_000,
  });
  const payload = parseJsonPayload(`${result.stdout}\n${result.stderr}`);
  const names = [...new Set(collectDeviceNames(payload))];

  if (commandSucceeded(result) && names.length > 0) {
    return {
      ok: true,
      detail: names.join(", "),
    };
  }

  if (commandSucceeded(result)) {
    return {
      ok: false,
      detail: "No physical iPhone reported by Xcode CoreDevice.",
    };
  }

  const payloadMessage =
    payload?.error?.userInfo?.NSLocalizedDescription?.string ??
    payload?.error?.userInfo?.NSLocalizedDescription;
  return {
    ok: false,
    detail:
      payloadMessage ??
      firstLine(result.stderr) ??
      firstLine(result.stdout) ??
      result.error?.message ??
      "devicectl failed",
  };
}

const checks = [
  ["Xcode selected", checkXcodeSelect()],
  ["Xcode build tool", checkXcodeBuild()],
  ["CocoaPods", checkCocoaPods()],
  ["Physical iPhone", checkPhysicalDevices()],
];

let failed = false;
for (const [name, result] of checks) {
  printCheck(name, result);
  failed = failed || !result.ok;
}

if (failed) {
  console.error("\nPhysical iPhone install is not ready.");
  console.error("Before running npm run ios:device:");
  console.error("- Connect the iPhone over USB or make it available to Xcode over Wi-Fi.");
  console.error("- Unlock the iPhone and trust this Mac.");
  console.error("- Open Xcode > Window > Devices and Simulators and confirm the device appears.");
  console.error(
    "- If CoreDevice is stuck, restart Xcode and reconnect the phone, then rerun this doctor.",
  );
  process.exit(1);
}

console.log("\nPhysical iPhone install prerequisites look ready.");
