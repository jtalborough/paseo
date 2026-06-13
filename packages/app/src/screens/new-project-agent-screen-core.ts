import type {
  ProjectAgentProfileEntry,
  ProjectContextPacketEntry,
} from "@getpaseo/client/internal/daemon-client";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";

interface ProjectAgentProfileClient {
  projectAgentProfileList(projectGroupId: string): Promise<ProjectAgentProfileEntry[]>;
  projectContextPacketCreate(input: {
    projectGroupId: string;
    launchReason?: string | null;
    provider?: string | null;
    model?: string | null;
    profile?: string | null;
    prompt?: string | null;
    tools?: string[];
    folderGrants?: Array<{ projectId: string; path?: string; mode?: "read" | "read-write" }>;
  }): Promise<ProjectContextPacketEntry>;
  readFile(cwd: string, path: string): Promise<{ bytes: Uint8Array }>;
}

interface ProjectAgentProfileComposer {
  setProviderAndModelFromUser(provider: AgentProvider, modelId: string): void;
  setProviderFromUser(provider: AgentProvider): void;
}

export async function applyProjectAgentProfileToDraft(input: {
  client: ProjectAgentProfileClient;
  composerState: ProjectAgentProfileComposer;
  projectGroupId: string;
  projectDirectory: string;
  profilePath: string;
  setText: (text: string) => void;
}): Promise<ProjectContextPacketEntry> {
  const profiles = await input.client.projectAgentProfileList(input.projectGroupId);
  const entry = profiles.find((candidate) => candidate.path === input.profilePath);
  if (!entry) {
    throw new Error("Agent profile not found");
  }

  const provider = entry.profile.provider?.trim();
  if (provider) {
    const model = entry.profile.model?.trim();
    if (model) {
      input.composerState.setProviderAndModelFromUser(provider as AgentProvider, model);
    } else {
      input.composerState.setProviderFromUser(provider as AgentProvider);
    }
  }

  if (entry.profile.prompt) {
    const promptFile = await input.client.readFile(input.projectDirectory, entry.profile.prompt);
    input.setText(new TextDecoder().decode(promptFile.bytes));
  }

  return input.client.projectContextPacketCreate({
    projectGroupId: input.projectGroupId,
    launchReason: `Use profile: ${entry.profile.name}`,
    provider: entry.profile.provider,
    model: entry.profile.model,
    profile: entry.path,
    prompt: entry.profile.prompt,
    tools: entry.profile.defaultTools,
    folderGrants: entry.profile.folderGrants,
  });
}
