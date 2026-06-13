import type { ProjectAgentProfileEntry } from "@getpaseo/client/internal/daemon-client";
import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";

export function buildProjectAgentProfileDraftTarget(input: {
  entry: ProjectAgentProfileEntry;
  draftId: string;
  groupId: string;
  launchCwd: string;
  initialPrompt: string | null;
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
      ...(input.initialPrompt ? { initialPrompt: input.initialPrompt } : {}),
    },
  };
}
