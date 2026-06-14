import type { ProjectAgentProfileEntry } from "@getpaseo/client/internal/daemon-client";
import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import { buildProjectAgentProfileLaunchLabels } from "@/projects/project-agent-launch-labels";

export type ProjectOperatingStepId =
  | "roadmap"
  | "tasks"
  | "agents"
  | "workflows"
  | "decisions"
  | "context"
  | "files";

export interface ProjectOperatingStep {
  id: ProjectOperatingStepId;
  title: string;
  detail: string;
  actionLabel: string;
}

export function buildProjectOperatingPath(input: {
  hasProjectDirectory: boolean;
  folderCount: number;
  activeAgentCount: number;
}): ProjectOperatingStep[] {
  return [
    {
      id: "roadmap",
      title: "Set direction",
      detail: "Capture outcomes, sequencing, and risks in roadmap.md.",
      actionLabel: "Open files",
    },
    {
      id: "tasks",
      title: "Shape the work",
      detail: "Create executable work, bugs, follow-ups, and acceptance criteria.",
      actionLabel: "Open tasks",
    },
    {
      id: "agents",
      title: "Set the team",
      detail:
        input.activeAgentCount > 0
          ? `${input.activeAgentCount} active agent${input.activeAgentCount === 1 ? "" : "s"} attached.`
          : "Create reusable profiles and launch Project agents from one roster.",
      actionLabel: "Open agents",
    },
    {
      id: "workflows",
      title: "Define workflows",
      detail: "Keep repeatable intake, QA, release, or domain procedures in workflows/.",
      actionLabel: "Open files",
    },
    {
      id: "decisions",
      title: "Keep decisions",
      detail: "Record durable calls and consequences in notes/decisions.md.",
      actionLabel: "Open notes",
    },
    {
      id: "context",
      title: "Audit launches",
      detail: "Review the prompt, profile, tools, folder grants, provider, and evidence.",
      actionLabel: "Open context",
    },
    {
      id: "files",
      title: "Grant work surfaces",
      detail: input.hasProjectDirectory
        ? `${input.folderCount} external folder${input.folderCount === 1 ? "" : "s"} referenced by this Project.`
        : "Attach local or remote folders so agents can reach the right work.",
      actionLabel: "Open files",
    },
  ];
}

export function buildProjectAgentProfileDraftTarget(input: {
  entry: ProjectAgentProfileEntry;
  draftId: string;
  groupId: string;
  launchCwd: string;
  initialPrompt: string | null;
  contextPacketPath: string | null;
}): WorkspaceTabTarget {
  const provider = input.entry.profile.provider?.trim();
  if (!provider) {
    throw new Error("Set a provider on this profile before using it");
  }
  return {
    kind: "draft",
    draftId: input.draftId,
    cwd: input.launchCwd,
    projectGroupId: input.groupId,
    setup: {
      provider,
      cwd: input.launchCwd,
      modeId: null,
      model: input.entry.profile.model,
      thinkingOptionId: null,
      featureValues: {},
      ...(input.contextPacketPath
        ? {
            labels: buildProjectAgentProfileLaunchLabels({
              projectGroupId: input.groupId,
              profilePath: input.entry.path,
              contextPacketPath: input.contextPacketPath,
            }),
          }
        : {}),
      ...(input.initialPrompt ? { initialPrompt: input.initialPrompt } : {}),
    },
  };
}
