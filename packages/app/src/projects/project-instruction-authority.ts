import type {
  ProjectContextFolderGrant,
  ProjectContextInstructionSource,
} from "@getpaseo/protocol/project-context/types";
import type { HostProjectListItem } from "@/projects/host-projects";

export interface InstructionAuthorityClient {
  readFile(cwd: string, path: string): Promise<{ bytes: Uint8Array }>;
}

export interface ProjectInstructionAuthority {
  launchCwd: string | null;
  instructionSources: ProjectContextInstructionSource[];
  instructionWarnings: string[];
}

const INSTRUCTION_FILES: Array<{
  path: string;
  sourceType: ProjectContextInstructionSource["sourceType"];
  note: string;
}> = [
  { path: "AGENTS.md", sourceType: "agents", note: "Provider-neutral folder instructions" },
  { path: "CLAUDE.md", sourceType: "claude", note: "Claude folder instructions" },
  { path: "GEMINI.md", sourceType: "gemini", note: "Gemini folder instructions" },
  { path: ".claude/commands", sourceType: "provider-command", note: "Claude command directory" },
  { path: ".agents/skills", sourceType: "provider-skill", note: "Paseo/agent skill directory" },
];

export async function resolveProjectInstructionAuthority(input: {
  client: InstructionAuthorityClient;
  launchCwd?: string | null;
  projectDirectory?: string | null;
  folderGrants: readonly ProjectContextFolderGrant[];
  folders: readonly HostProjectListItem[];
}): Promise<ProjectInstructionAuthority> {
  const launchCwd = input.launchCwd?.trim() || null;
  const candidates = buildProbeCandidates({
    launchCwd,
    projectDirectory: input.projectDirectory?.trim() || null,
    folderGrants: input.folderGrants,
    folders: input.folders,
  });
  const sources: ProjectContextInstructionSource[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    for (const instructionFile of INSTRUCTION_FILES) {
      const readPath = joinPortablePath(candidate.relativePath, instructionFile.path);
      if (!(await canRead(input.client, candidate.cwd, readPath))) {
        continue;
      }
      const packetPath = joinDisplayPath(candidate.displayRoot, readPath);
      const key = `${candidate.scope}:${candidate.projectId ?? ""}:${packetPath}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      sources.push({
        path: packetPath,
        sourceType: instructionFile.sourceType,
        scope: candidate.scope,
        projectId: candidate.projectId,
        note: instructionFile.note,
      });
    }
  }

  return {
    launchCwd,
    instructionSources: sources,
    instructionWarnings: buildInstructionWarnings(sources),
  };
}

function buildProbeCandidates(input: {
  launchCwd: string | null;
  projectDirectory: string | null;
  folderGrants: readonly ProjectContextFolderGrant[];
  folders: readonly HostProjectListItem[];
}) {
  const candidates: Array<{
    cwd: string;
    relativePath: string;
    displayRoot: string;
    scope: ProjectContextInstructionSource["scope"];
    projectId: string | null;
  }> = [];

  if (input.launchCwd) {
    candidates.push({
      cwd: input.launchCwd,
      relativePath: ".",
      displayRoot: input.launchCwd,
      scope: input.launchCwd === input.projectDirectory ? "project-directory" : "launch-cwd",
      projectId: null,
    });
  }

  for (const grant of input.folderGrants) {
    const folder = input.folders.find((candidate) => candidate.projectKey === grant.projectId);
    if (!folder) {
      continue;
    }
    candidates.push({
      cwd: folder.iconWorkingDir,
      relativePath: grant.path || ".",
      displayRoot: folder.iconWorkingDir,
      scope: "folder-grant",
      projectId: grant.projectId,
    });
  }

  return candidates;
}

function buildInstructionWarnings(sources: ProjectContextInstructionSource[]): string[] {
  if (!sources.length) {
    return [];
  }
  return ["Folder/provider instructions may constrain or override Project prompt behavior."];
}

async function canRead(
  client: InstructionAuthorityClient,
  cwd: string,
  filePath: string,
): Promise<boolean> {
  try {
    await client.readFile(cwd, filePath);
    return true;
  } catch {
    return false;
  }
}

function joinPortablePath(base: string, child: string): string {
  if (!base || base === ".") {
    return child;
  }
  return `${base.replace(/\/+$/g, "")}/${child}`;
}

function joinDisplayPath(base: string, child: string): string {
  if (!base || base === ".") {
    return child;
  }
  return `${base.replace(/\/+$/g, "")}/${child}`;
}
