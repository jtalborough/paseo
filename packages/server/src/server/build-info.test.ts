import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_PASEO_BUILD_VERSION, resolvePaseoBuildInfo } from "./build-info.js";

const envKeys = [
  "PASEO_BUILD_VERSION",
  "PASEO_PACKAGE_VERSION",
  "PASEO_BUILD_SHA",
  "PASEO_BUILD_BRANCH",
  "PASEO_BUILD_TIME",
  "GITHUB_SHA",
  "GITHUB_REF_NAME",
] as const;

const createdDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "paseo-build-info-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of createdDirs.splice(0, createdDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolvePaseoBuildInfo", () => {
  it("defaults local builds to the 2.0 build line", () => {
    const releaseRoot = createTempDir();
    for (const key of envKeys) {
      vi.stubEnv(key, "");
    }

    expect(resolvePaseoBuildInfo({ packageVersion: "0.1.90-beta.1", releaseRoot })).toEqual({
      version: DEFAULT_PASEO_BUILD_VERSION,
      packageVersion: "0.1.90-beta.1",
      sha: null,
      branch: null,
      builtAt: null,
    });
  });

  it("reads artifact metadata from BUILD.json", () => {
    const releaseRoot = createTempDir();
    writeFileSync(
      path.join(releaseRoot, "BUILD.json"),
      JSON.stringify({
        version: "2.0",
        packageVersion: "0.1.91-beta.0",
        sha: "abc123",
        branch: "jta/dev",
        builtAt: "2026-06-14T12:00:00.000Z",
      }),
      "utf8",
    );

    expect(resolvePaseoBuildInfo({ packageVersion: "0.1.90-beta.1", releaseRoot })).toEqual({
      version: "2.0",
      packageVersion: "0.1.91-beta.0",
      sha: "abc123",
      branch: "jta/dev",
      builtAt: "2026-06-14T12:00:00.000Z",
    });
  });

  it("falls back to REVISION when BUILD.json does not include a SHA", () => {
    const releaseRoot = createTempDir();
    mkdirSync(releaseRoot, { recursive: true });
    writeFileSync(path.join(releaseRoot, "REVISION"), "deadbeef\n", "utf8");

    expect(resolvePaseoBuildInfo({ packageVersion: "0.1.90-beta.1", releaseRoot }).sha).toBe(
      "deadbeef",
    );
  });

  it("lets environment variables override artifact metadata", () => {
    const releaseRoot = createTempDir();
    writeFileSync(
      path.join(releaseRoot, "BUILD.json"),
      JSON.stringify({ version: "2.0", sha: "file-sha", branch: "main" }),
      "utf8",
    );
    vi.stubEnv("PASEO_BUILD_VERSION", "2.0-local");
    vi.stubEnv("PASEO_BUILD_SHA", "env-sha");
    vi.stubEnv("PASEO_BUILD_BRANCH", "env-branch");

    expect(resolvePaseoBuildInfo({ packageVersion: "0.1.90-beta.1", releaseRoot })).toMatchObject({
      version: "2.0-local",
      sha: "env-sha",
      branch: "env-branch",
    });
  });
});
