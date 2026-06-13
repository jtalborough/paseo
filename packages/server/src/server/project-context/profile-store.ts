import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  ProjectAgentProfilePathSchema,
  ProjectAgentProfileSchema,
  ProjectContextFileIdSchema,
  type ProjectAgentProfile,
} from "@getpaseo/protocol/project-context/types";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { writeFileAtomic } from "../atomic-file.js";

export interface StoredProjectAgentProfile {
  path: string;
  profile: ProjectAgentProfile;
}

export class ProjectAgentProfileStore {
  constructor(private readonly paseoHome: string) {}

  async list(projectGroupId: string): Promise<StoredProjectAgentProfile[]> {
    const dir = this.profileDir(projectGroupId);
    let entries: string[];
    try {
      entries = (await readdir(dir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && isProfileFilename(entry.name))
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const profiles = await Promise.all(
      entries.map(async (name) => this.readFile(path.join(dir, name))),
    );
    return profiles.sort((left, right) => compareProfiles(left.profile, right.profile));
  }

  async upsert(input: {
    projectGroupId: string;
    path?: string;
    profile: ProjectAgentProfile;
  }): Promise<StoredProjectAgentProfile> {
    const profile = ProjectAgentProfileSchema.parse(input.profile);
    const profilePath = input.path
      ? ProjectAgentProfilePathSchema.parse(input.path)
      : this.relativeProfilePath(profile.id);
    const absolutePath = this.absoluteProfilePath(input.projectGroupId, profilePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFileAtomic(absolutePath, serialize(profile));
    return { path: profilePath, profile };
  }

  async delete(projectGroupId: string, profilePath: string): Promise<void> {
    await rm(this.absoluteProfilePath(projectGroupId, profilePath), { force: true });
  }

  private async readFile(filePath: string): Promise<StoredProjectAgentProfile> {
    const raw = await readFile(filePath, "utf8");
    const parsed = parseProfileFile(filePath, raw);
    const profile = ProjectAgentProfileSchema.parse(parsed);
    return { path: this.relativeProfilePath(profile.id, filePath), profile };
  }

  private profileDir(projectGroupId: string): string {
    assertProjectGroupId(projectGroupId);
    return path.join(this.paseoHome, "projects", projectGroupId, "agents");
  }

  private absoluteProfilePath(projectGroupId: string, profilePath: string): string {
    assertProjectGroupId(projectGroupId);
    const parsedPath = ProjectAgentProfilePathSchema.parse(profilePath);
    const absolute = path.join(this.paseoHome, "projects", projectGroupId, parsedPath);
    const profileRoot = path.join(this.paseoHome, "projects", projectGroupId, "agents");
    const relative = path.relative(profileRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Agent profile path must stay under agents/");
    }
    return absolute;
  }

  private relativeProfilePath(id: string, filePath?: string): string {
    if (filePath) {
      return ProjectAgentProfilePathSchema.parse(`agents/${path.basename(filePath)}`);
    }
    return `agents/${ProjectContextFileIdSchema.parse(id)}.yaml`;
  }
}

function parseProfileFile(filePath: string, raw: string): unknown {
  if (filePath.endsWith(".json")) {
    return JSON.parse(raw);
  }
  return parseYaml(raw) ?? {};
}

function serialize(profile: ProjectAgentProfile): string {
  return `${stringifyYaml(profile).trimEnd()}\n`;
}

function compareProfiles(left: ProjectAgentProfile, right: ProjectAgentProfile): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function isProfileFilename(name: string): boolean {
  return name.endsWith(".yaml") || name.endsWith(".yml") || name.endsWith(".json");
}

function assertProjectGroupId(groupId: string): void {
  if (!/^grp_[A-Za-z0-9_-]+$/.test(groupId)) {
    throw new Error("Invalid Project group id");
  }
}
