import type { HostProjectListItem } from "@/projects/host-project-model";

// Resolving "launch an agent at this Project" to a concrete cwd. A selected
// Project is UI context, not a directory — committee guidance (Plan 00, Phase
// 1c#4). Precedence: designated primary folder → sole member folder → (multiple,
// no primary → ambiguous, caller prompts) → the Project's own domain directory
// when it has no folders at all.

export interface ProjectLaunchTarget {
  /** Concrete directory the agent launches in. */
  cwd: string;
  /** Member folder this resolved to, or null when launching in the domain dir. */
  folderProjectKey: string | null;
  /** Human label for the launch target ("launching in <label>"). */
  label: string;
  /** Multiple folders with no designated primary — caller should let the user pick. */
  ambiguous: boolean;
}

export interface ProjectLaunchGroup {
  displayName: string;
  /** The Project's own domain directory ($PASEO_HOME/projects/<groupId>/). */
  cwd?: string | null;
  /** projectKey of the designated primary folder, if any. */
  primaryProjectId?: string | null;
}

export function resolveProjectLaunchTarget(input: {
  group: ProjectLaunchGroup;
  folders: HostProjectListItem[];
}): ProjectLaunchTarget {
  const { group, folders } = input;
  const domainCwd = group.cwd ?? "";
  const domainTarget: ProjectLaunchTarget = {
    cwd: domainCwd,
    folderProjectKey: null,
    label: `${group.displayName} (Project home)`,
    ambiguous: false,
  };

  const asTarget = (folder: HostProjectListItem): ProjectLaunchTarget => ({
    cwd: folder.iconWorkingDir,
    folderProjectKey: folder.projectKey,
    label: folder.projectName,
    ambiguous: false,
  });

  if (group.primaryProjectId) {
    const primary = folders.find((folder) => folder.projectKey === group.primaryProjectId);
    if (primary) {
      return asTarget(primary);
    }
  }

  if (folders.length === 1) {
    return asTarget(folders[0]);
  }

  if (folders.length === 0) {
    return domainTarget;
  }

  // Multiple folders, no usable primary: default to the domain dir but flag it so
  // the caller can surface an overridable picker (Slice 2).
  return { ...domainTarget, ambiguous: true };
}
