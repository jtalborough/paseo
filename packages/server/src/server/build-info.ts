import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_PASEO_BUILD_VERSION = "2.0";

export interface PaseoBuildInfo {
  version: string;
  packageVersion: string | null;
  sha: string | null;
  branch: string | null;
  builtAt: string | null;
}

interface BuildMetadataFile {
  version?: unknown;
  packageVersion?: unknown;
  sha?: unknown;
  branch?: unknown;
  builtAt?: unknown;
}

function normalizeBuildString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBuildMetadataFile(releaseRoot: string): BuildMetadataFile {
  const buildPath = path.join(releaseRoot, "BUILD.json");
  if (!existsSync(buildPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(buildPath, "utf8")) as BuildMetadataFile;
  } catch {
    return {};
  }
}

function readRevisionFile(releaseRoot: string): string | null {
  const revisionPath = path.join(releaseRoot, "REVISION");
  if (!existsSync(revisionPath)) {
    return null;
  }
  try {
    return normalizeBuildString(readFileSync(revisionPath, "utf8"));
  } catch {
    return null;
  }
}

export function resolvePaseoBuildInfo(params?: {
  packageVersion?: string | null;
  releaseRoot?: string;
}): PaseoBuildInfo {
  const releaseRoot = params?.releaseRoot ?? process.cwd();
  const fileMetadata = readBuildMetadataFile(releaseRoot);
  const packageVersion = normalizeBuildString(params?.packageVersion);

  return {
    version:
      normalizeBuildString(process.env.PASEO_BUILD_VERSION) ??
      normalizeBuildString(fileMetadata.version) ??
      DEFAULT_PASEO_BUILD_VERSION,
    packageVersion:
      normalizeBuildString(process.env.PASEO_PACKAGE_VERSION) ??
      normalizeBuildString(fileMetadata.packageVersion) ??
      packageVersion,
    sha:
      normalizeBuildString(process.env.PASEO_BUILD_SHA) ??
      normalizeBuildString(process.env.GITHUB_SHA) ??
      normalizeBuildString(fileMetadata.sha) ??
      readRevisionFile(releaseRoot),
    branch:
      normalizeBuildString(process.env.PASEO_BUILD_BRANCH) ??
      normalizeBuildString(process.env.GITHUB_REF_NAME) ??
      normalizeBuildString(fileMetadata.branch),
    builtAt:
      normalizeBuildString(process.env.PASEO_BUILD_TIME) ??
      normalizeBuildString(fileMetadata.builtAt),
  };
}
