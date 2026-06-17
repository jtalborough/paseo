import Constants from "expo-constants";
import appPackage from "../../package.json";

export interface AppBuildInfo {
  version: string | null;
  packageVersion: string | null;
  sha: string | null;
  branch: string | null;
  builtAt: string | null;
  variant: string | null;
}

function toVersionOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

function readExpoExtra(): Record<string, unknown> {
  const extra = Constants.expoConfig?.extra;
  return extra && typeof extra === "object" ? (extra as Record<string, unknown>) : {};
}

function readManifestExtra(): Record<string, unknown> {
  const manifest = (Constants as unknown as { manifest?: { extra?: unknown } }).manifest;
  const extra = manifest?.extra;
  return extra && typeof extra === "object" ? (extra as Record<string, unknown>) : {};
}

function readBuildRecord(extra: Record<string, unknown>): Record<string, unknown> {
  const build = extra.build;
  return build && typeof build === "object" ? (build as Record<string, unknown>) : {};
}

export function resolveAppVersion(): string | null {
  const packageVersion = toVersionOrNull(appPackage?.version);
  if (packageVersion) {
    return packageVersion;
  }

  const expoVersion = toVersionOrNull(Constants.expoConfig?.version);
  if (expoVersion) {
    return expoVersion;
  }

  const manifestVersion = toVersionOrNull(
    (Constants as unknown as { manifest?: { version?: unknown } }).manifest?.version,
  );
  if (manifestVersion) {
    return manifestVersion;
  }

  return null;
}

export function resolveAppBuildInfo(): AppBuildInfo {
  const expoExtra = readExpoExtra();
  const manifestExtra = readManifestExtra();
  const expoBuild = readBuildRecord(expoExtra);
  const manifestBuild = readBuildRecord(manifestExtra);
  return {
    version: toVersionOrNull(expoBuild.version) ?? toVersionOrNull(manifestBuild.version),
    packageVersion:
      toVersionOrNull(expoBuild.packageVersion) ??
      toVersionOrNull(manifestBuild.packageVersion) ??
      resolveAppVersion(),
    sha: toVersionOrNull(expoBuild.sha) ?? toVersionOrNull(manifestBuild.sha),
    branch: toVersionOrNull(expoBuild.branch) ?? toVersionOrNull(manifestBuild.branch),
    builtAt: toVersionOrNull(expoBuild.builtAt) ?? toVersionOrNull(manifestBuild.builtAt),
    variant: toVersionOrNull(expoExtra.appVariant) ?? toVersionOrNull(manifestExtra.appVariant),
  };
}

export function formatShortSha(sha: string | null | undefined): string | null {
  const trimmed = toVersionOrNull(sha);
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 7);
}
