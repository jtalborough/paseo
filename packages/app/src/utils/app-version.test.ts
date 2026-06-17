import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      version: "0.1.0",
      extra: {
        appVariant: "development",
        build: {
          version: "2.0",
          packageVersion: "0.1.90-beta.1",
          sha: "abcdef1234567890",
          branch: "jta/dev",
          builtAt: "2026-06-17T10:00:00.000Z",
        },
      },
    },
  },
}));

describe("app version helpers", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("resolves build metadata from Expo config extras", async () => {
    const { resolveAppBuildInfo } = await import("./app-version");

    expect(resolveAppBuildInfo()).toEqual({
      version: "2.0",
      packageVersion: "0.1.90-beta.1",
      sha: "abcdef1234567890",
      branch: "jta/dev",
      builtAt: "2026-06-17T10:00:00.000Z",
      variant: "development",
    });
  });

  test("formats short commit SHAs", async () => {
    const { formatShortSha } = await import("./app-version");

    expect(formatShortSha("abcdef1234567890")).toBe("abcdef1");
    expect(formatShortSha("  ")).toBeNull();
  });
});
