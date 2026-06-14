import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import { normalizeWorkspaceFileLocation, workspaceFileLocationsEqual } from "@/workspace/file-open";

type WorkspaceDraftTabSetup = NonNullable<Extract<WorkspaceTabTarget, { kind: "draft" }>["setup"]>;
type ProjectWorkspaceTabTarget = Extract<
  WorkspaceTabTarget,
  {
    kind:
      | "project-overview"
      | "tasks"
      | "notes"
      | "project-tasks"
      | "project-notes"
      | "project-agents"
      | "project-context"
      | "project-files";
  }
>;
type ProjectWorkspaceTabKind = ProjectWorkspaceTabTarget["kind"];

const PROJECT_WORKSPACE_TAB_KINDS = new Set<string>([
  "project-overview",
  "tasks",
  "notes",
  "project-tasks",
  "project-notes",
  "project-agents",
  "project-context",
  "project-files",
]);

function isProjectWorkspaceTabKind(kind: string): kind is ProjectWorkspaceTabKind {
  return PROJECT_WORKSPACE_TAB_KINDS.has(kind);
}

function normalizeProjectWorkspaceTabTarget(
  value: WorkspaceTabTarget,
): ProjectWorkspaceTabTarget | null {
  if (!isProjectWorkspaceTabTarget(value)) {
    return null;
  }
  const groupId = trimNonEmpty(value.groupId);
  if (!groupId) {
    return null;
  }
  if (value.kind === "project-context") {
    const packetPath = trimOptionalString(value.packetPath);
    return {
      kind: value.kind,
      groupId,
      ...(packetPath ? { packetPath } : {}),
    };
  }
  return { kind: value.kind, groupId };
}

function isProjectWorkspaceTabTarget(
  value: WorkspaceTabTarget,
): value is ProjectWorkspaceTabTarget {
  return isProjectWorkspaceTabKind(value.kind);
}

function normalizeTerminalTabTarget(
  value: Extract<WorkspaceTabTarget, { kind: "terminal" }>,
): WorkspaceTabTarget | null {
  const terminalId = trimNonEmpty(value.terminalId);
  const cwd = trimOptionalString(value.cwd);
  const sourceAgentId = trimOptionalString(value.sourceAgentId);
  return terminalId
    ? {
        kind: "terminal",
        terminalId,
        ...(cwd ? { cwd } : {}),
        ...(sourceAgentId ? { sourceAgentId } : {}),
      }
    : null;
}

export function normalizeWorkspaceTabTarget(
  value: WorkspaceTabTarget | null | undefined,
): WorkspaceTabTarget | null {
  if (!value || typeof value !== "object" || typeof value.kind !== "string") {
    return null;
  }
  if (value.kind === "draft") {
    const draftId = trimNonEmpty(value.draftId);
    if (!draftId) {
      return null;
    }
    const setup = normalizeWorkspaceDraftTabSetup(value.setup);
    const cwd = trimOptionalString(value.cwd);
    const projectGroupId = trimOptionalString(value.projectGroupId);
    return {
      kind: "draft",
      draftId,
      ...(cwd ? { cwd } : {}),
      ...(projectGroupId ? { projectGroupId } : {}),
      ...(setup ? { setup } : {}),
    };
  }
  if (value.kind === "agent") {
    const agentId = trimNonEmpty(value.agentId);
    return agentId ? { kind: "agent", agentId } : null;
  }
  if (value.kind === "terminal") {
    return normalizeTerminalTabTarget(value);
  }
  if (value.kind === "browser") {
    const browserId = trimNonEmpty(value.browserId);
    return browserId ? { kind: "browser", browserId } : null;
  }
  if (value.kind === "file") {
    return normalizeFileTabTarget(value);
  }
  if (value.kind === "setup") {
    const workspaceId = trimNonEmpty(value.workspaceId);
    return workspaceId ? { kind: "setup", workspaceId } : null;
  }
  const projectTarget = normalizeProjectWorkspaceTabTarget(value);
  if (projectTarget) return projectTarget;
  return null;
}

export function normalizeWorkspaceDraftTabSetup(
  value: unknown,
): WorkspaceDraftTabSetup | undefined {
  const record = isPlainRecord(value) ? value : null;
  if (!record) {
    return undefined;
  }
  const provider = trimNonEmpty(typeof record.provider === "string" ? record.provider : null);
  const cwd = trimNonEmpty(typeof record.cwd === "string" ? record.cwd : null);
  if (!provider || !cwd) {
    return undefined;
  }
  return {
    provider,
    cwd,
    modeId: trimOptionalString(typeof record.modeId === "string" ? record.modeId : null),
    model: trimOptionalString(typeof record.model === "string" ? record.model : null),
    thinkingOptionId: trimOptionalString(
      typeof record.thinkingOptionId === "string" ? record.thinkingOptionId : null,
    ),
    featureValues: isPlainRecord(record.featureValues) ? { ...record.featureValues } : {},
    ...(isPlainRecord(record.labels) ? { labels: normalizeStringRecord(record.labels) } : {}),
    ...(typeof record.initialPrompt === "string" && record.initialPrompt.length > 0
      ? { initialPrompt: record.initialPrompt }
      : {}),
  };
}

export function workspaceTabTargetsEqual(
  left: WorkspaceTabTarget,
  right: WorkspaceTabTarget,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "draft" && right.kind === "draft") {
    return workspaceDraftTargetsEqual(left, right);
  }
  if (left.kind === "agent" && right.kind === "agent") {
    return left.agentId === right.agentId;
  }
  if (left.kind === "terminal" && right.kind === "terminal") {
    return left.terminalId === right.terminalId;
  }
  if (left.kind === "browser" && right.kind === "browser") {
    return left.browserId === right.browserId;
  }
  if (left.kind === "file" && right.kind === "file") {
    return workspaceFileLocationsEqual(left, right);
  }
  if (left.kind === "setup" && right.kind === "setup") {
    return left.workspaceId === right.workspaceId;
  }
  if (isProjectWorkspaceTabTarget(left) && isProjectWorkspaceTabTarget(right)) {
    return projectWorkspaceTargetsEqual(left, right);
  }
  return false;
}

function projectWorkspaceTargetsEqual(
  left: ProjectWorkspaceTabTarget,
  right: ProjectWorkspaceTabTarget,
): boolean {
  if (left.kind === "project-context" && right.kind === "project-context") {
    return (
      left.groupId === right.groupId && (left.packetPath ?? null) === (right.packetPath ?? null)
    );
  }
  return left.groupId === right.groupId;
}

function workspaceDraftTargetsEqual(
  left: Extract<WorkspaceTabTarget, { kind: "draft" }>,
  right: Extract<WorkspaceTabTarget, { kind: "draft" }>,
): boolean {
  return (
    left.draftId === right.draftId &&
    (left.cwd ?? null) === (right.cwd ?? null) &&
    (left.projectGroupId ?? null) === (right.projectGroupId ?? null) &&
    workspaceDraftTabSetupsEqual(left.setup, right.setup)
  );
}

function workspaceDraftTabSetupsEqual(
  left: WorkspaceDraftTabSetup | undefined,
  right: WorkspaceDraftTabSetup | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }
  return (
    left.provider === right.provider &&
    left.cwd === right.cwd &&
    left.modeId === right.modeId &&
    left.model === right.model &&
    left.thinkingOptionId === right.thinkingOptionId &&
    (left.initialPrompt ?? null) === (right.initialPrompt ?? null) &&
    recordsShallowEqual(left.featureValues, right.featureValues) &&
    recordsShallowEqual(left.labels ?? {}, right.labels ?? {})
  );
}

function normalizeStringRecord(record: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

function recordsShallowEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!Object.hasOwn(right, key) || !Object.is(left[key], right[key])) {
      return false;
    }
  }
  return true;
}

export function buildDeterministicWorkspaceTabId(target: WorkspaceTabTarget): string {
  if (target.kind === "draft") {
    return target.draftId;
  }
  if (target.kind === "agent") {
    return `agent_${target.agentId}`;
  }
  if (target.kind === "terminal") {
    return `terminal_${target.terminalId}`;
  }
  if (target.kind === "browser") {
    return `browser_${target.browserId}`;
  }
  if (target.kind === "setup") {
    return `setup_${target.workspaceId}`;
  }
  if (isProjectWorkspaceTabTarget(target)) {
    return `${target.kind}_${target.groupId}`;
  }
  return `file_${target.path}`;
}

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeFileTabTarget(
  value: Extract<WorkspaceTabTarget, { kind: "file" }>,
): WorkspaceTabTarget | null {
  const location = normalizeWorkspaceFileLocation(value);
  return location ? { kind: "file", ...location } : null;
}

function trimOptionalString(value: string | null | undefined): string | null {
  return value == null ? null : trimNonEmpty(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
