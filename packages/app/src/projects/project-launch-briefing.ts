import type {
  ProjectAgentProfile,
  ProjectContextPacket,
  ProjectContextFolderGrant,
} from "@getpaseo/protocol/project-context/types";

export interface LaunchBriefingItem {
  label: string;
  value: string;
}

export interface FolderGrantDisplayProject {
  serverId: string;
  projectKey: string;
  projectName: string;
  iconWorkingDir: string;
}

export interface FolderGrantDisplay {
  title: string;
  detail: string;
}

export interface ProjectLaunchBriefing {
  title: string;
  readinessLabel: string;
  badgeVariant: "success" | "warning" | "muted";
  ready: boolean;
  warnings: string[];
  items: LaunchBriefingItem[];
  accessSummary: string[];
}

export function buildProfileLaunchBriefing(input: {
  profile: ProjectAgentProfile;
  path: string;
}): ProjectLaunchBriefing {
  const { profile, path } = input;
  const warnings = compact([
    profile.prompt?.trim() ? null : "Prompt file is not set",
    profile.defaultTools.length ? null : "No default tools",
  ]);
  const providerModel = formatProviderModel(profile.provider, profile.model) ?? "Default provider";
  const items = compactItems([
    { label: "Profile", value: path },
    { label: "Provider", value: providerModel },
    profile.prompt ? { label: "Prompt", value: profile.prompt } : null,
    profile.defaultTools.length ? { label: "Tools", value: profile.defaultTools.join(", ") } : null,
    profile.folderGrants.length
      ? { label: "Folder grants", value: formatFolderGrantCount(profile.folderGrants) }
      : null,
    { label: "Packet", value: "Created when launched" },
  ]);

  return {
    title: profile.name,
    readinessLabel: warnings.length
      ? `${warnings.length} note${warnings.length === 1 ? "" : "s"}`
      : "Ready",
    badgeVariant: warnings.length ? "warning" : "success",
    ready: true,
    warnings,
    items,
    accessSummary: buildAccessSummary({
      tools: profile.defaultTools.length,
      folderGrants: profile.folderGrants.length,
    }),
  };
}

export function buildPacketLaunchBriefing(input: {
  packet: ProjectContextPacket;
  path: string;
}): ProjectLaunchBriefing {
  const { packet, path } = input;
  const warnings = compact([
    hasPacketLaunchContext(packet) ? null : "No launch context recorded",
    packet.launchedAgentId?.trim() ? null : "No launched agent recorded",
  ]);
  const providerModel = formatProviderModel(packet.provider, packet.model);
  const items = compactItems([
    packet.launchReason ? { label: "Reason", value: packet.launchReason } : null,
    packet.profile ? { label: "Profile", value: packet.profile } : null,
    packet.prompt ? { label: "Prompt", value: packet.prompt } : null,
    providerModel ? { label: "Provider", value: providerModel } : null,
    packet.task ? { label: "Task", value: packet.task } : null,
    packet.createdByAgentId ? { label: "Created by", value: packet.createdByAgentId } : null,
    packet.launchedAgentId ? { label: "Agent", value: packet.launchedAgentId } : null,
    { label: "Packet", value: path },
  ]);

  return {
    title: packet.launchReason ?? packet.id,
    readinessLabel: warnings.length
      ? `${warnings.length} note${warnings.length === 1 ? "" : "s"}`
      : "Complete",
    badgeVariant: warnings.length ? "warning" : "success",
    ready: true,
    warnings,
    items,
    accessSummary: buildAccessSummary({
      files: packet.files.length,
      notes: packet.notes.length,
      bookmarks: packet.bookmarks.length,
      browser: packet.browser.length,
      tools: packet.tools.length,
      folderGrants: packet.folderGrants.length,
    }),
  };
}

function hasPacketLaunchContext(packet: ProjectContextPacket): boolean {
  return Boolean(
    packet.profile?.trim() ||
    packet.prompt?.trim() ||
    packet.task?.trim() ||
    packet.tools.length ||
    packet.notes.length ||
    packet.files.length ||
    packet.bookmarks.length ||
    packet.browser.length ||
    packet.folderGrants.length,
  );
}

export function formatProviderModel(
  provider?: string | null,
  model?: string | null,
): string | null {
  const normalizedProvider = provider?.trim() || null;
  const normalizedModel = model?.trim() || null;
  if (!normalizedProvider && !normalizedModel) {
    return null;
  }
  if (!normalizedProvider) {
    return normalizedModel;
  }
  if (!normalizedModel) {
    return normalizedProvider;
  }
  return `${normalizedProvider} / ${normalizedModel}`;
}

function buildAccessSummary(input: {
  files?: number;
  notes?: number;
  bookmarks?: number;
  browser?: number;
  tools?: number;
  folderGrants?: number;
}): string[] {
  return compact([
    formatCount(input.files, "file"),
    formatCount(input.notes, "note"),
    formatCount(input.bookmarks, "bookmark"),
    formatCount(input.browser, "browser state"),
    formatCount(input.tools, "tool"),
    formatCount(input.folderGrants, "folder grant"),
  ]);
}

function formatFolderGrantCount(grants: ProjectContextFolderGrant[]): string {
  return formatCount(grants.length, "folder grant") ?? "0 folder grants";
}

export function formatFolderGrantDisplay(input: {
  grant: ProjectContextFolderGrant;
  folders: readonly FolderGrantDisplayProject[];
}): FolderGrantDisplay {
  const folder = input.folders.find((candidate) => candidate.projectKey === input.grant.projectId);
  const mode = input.grant.mode === "read-write" ? "Read/write" : "Read";
  const displayName = folder?.projectName ?? `Unknown Folder (${input.grant.projectId})`;
  const host = folder?.serverId ?? "Unknown host";
  const rootPath = folder?.iconWorkingDir ?? input.grant.projectId;
  const scopedPath = joinGrantPath(rootPath, input.grant.path);

  return {
    title: `${displayName} - ${mode}`,
    detail: `${host} - ${scopedPath}`,
  };
}

function joinGrantPath(rootPath: string, grantPath: string): string {
  if (!grantPath || grantPath === ".") {
    return rootPath;
  }
  if (rootPath.endsWith("/")) {
    return `${rootPath}${grantPath}`;
  }
  return `${rootPath}/${grantPath}`;
}

function formatCount(count: number | undefined, label: string): string | null {
  if (!count) {
    return null;
  }
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function compact<T>(items: (T | null | undefined | false)[]): T[] {
  return items.filter(Boolean) as T[];
}

function compactItems(items: (LaunchBriefingItem | null)[]): LaunchBriefingItem[] {
  return items.filter((item): item is LaunchBriefingItem => item !== null);
}
