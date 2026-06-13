import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  ProjectContextFileIdSchema,
  ProjectContextPacketSchema,
  type ProjectContextPacket,
} from "@getpaseo/protocol/project-context/types";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { writeFileAtomic } from "../atomic-file.js";

export interface StoredProjectContextPacket {
  path: string;
  packet: ProjectContextPacket;
}

export interface CreateProjectContextPacketInput {
  id?: string;
  projectGroupId: string;
  createdByAgentId?: string | null;
  launchedAgentId?: string | null;
  launchReason?: string | null;
  provider?: string | null;
  model?: string | null;
  profile?: string | null;
  prompt?: string | null;
  task?: string | null;
  tools?: string[];
  notes?: string[];
  files?: string[];
  bookmarks?: string[];
  browser?: Array<{ url: string; title?: string | null }>;
  folderGrants?: Array<{ projectId: string; path?: string; mode?: "read" | "read-write" }>;
  now?: string;
}

export class ProjectContextPacketStore {
  constructor(private readonly paseoHome: string) {}

  async list(projectGroupId: string): Promise<StoredProjectContextPacket[]> {
    const dir = this.packetDir(projectGroupId);
    let entries: string[];
    try {
      entries = (await readdir(dir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && isPacketFilename(entry.name))
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const packets = await Promise.all(
      entries.map(async (name) => this.readFile(projectGroupId, path.join(dir, name))),
    );
    return packets.sort((left, right) => comparePackets(left.packet, right.packet));
  }

  async create(input: CreateProjectContextPacketInput): Promise<StoredProjectContextPacket> {
    await mkdir(this.packetDir(input.projectGroupId), { recursive: true });
    const id = input.id ?? (await this.allocateId(input.projectGroupId, input.launchReason));
    const packet = ProjectContextPacketSchema.parse({
      schemaVersion: 1,
      id,
      projectGroupId: input.projectGroupId,
      createdAt: input.now ?? new Date().toISOString(),
      createdByAgentId: input.createdByAgentId ?? null,
      launchedAgentId: input.launchedAgentId ?? null,
      launchReason: input.launchReason ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      profile: input.profile ?? null,
      prompt: input.prompt ?? null,
      task: input.task ?? null,
      tools: input.tools ?? [],
      notes: input.notes ?? [],
      files: input.files ?? [],
      bookmarks: input.bookmarks ?? [],
      browser: input.browser ?? [],
      folderGrants: input.folderGrants ?? [],
    });
    const packetPath = this.relativePacketPath(packet.id);
    await writeFileAtomic(
      this.absolutePacketPath(input.projectGroupId, packet.id),
      serialize(packet),
    );
    return { path: packetPath, packet };
  }

  private async allocateId(
    projectGroupId: string,
    seed: string | null | undefined,
  ): Promise<string> {
    const datePrefix = new Date().toISOString().slice(0, 10);
    const slug = slugify(seed ?? "context-packet");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const id = `${datePrefix}-${slug}-${randomBytes(3).toString("hex")}`;
      const filePath = this.absolutePacketPath(projectGroupId, id);
      try {
        await readFile(filePath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return id;
        }
        throw error;
      }
    }
    throw new Error("Failed to allocate a unique context packet id");
  }

  private async readFile(
    projectGroupId: string,
    filePath: string,
  ): Promise<StoredProjectContextPacket> {
    const raw = await readFile(filePath, "utf8");
    const parsed = parsePacketFile(filePath, raw);
    const packet = ProjectContextPacketSchema.parse(parsed);
    if (packet.projectGroupId !== projectGroupId) {
      throw new Error(`Context packet ${filePath} belongs to ${packet.projectGroupId}`);
    }
    return { path: this.relativePacketPath(packet.id), packet };
  }

  private packetDir(projectGroupId: string): string {
    assertProjectGroupId(projectGroupId);
    return path.join(this.paseoHome, "projects", projectGroupId, "context", "packets");
  }

  private absolutePacketPath(projectGroupId: string, id: string): string {
    return path.join(this.packetDir(projectGroupId), `${assertPacketId(id)}.yaml`);
  }

  private relativePacketPath(id: string): string {
    return `context/packets/${assertPacketId(id)}.yaml`;
  }
}

function parsePacketFile(filePath: string, raw: string): unknown {
  if (filePath.endsWith(".json")) {
    return JSON.parse(raw);
  }
  return parseYaml(raw) ?? {};
}

function serialize(packet: ProjectContextPacket): string {
  return `${stringifyYaml(packet).trimEnd()}\n`;
}

function comparePackets(left: ProjectContextPacket, right: ProjectContextPacket): number {
  const leftCreatedAt = left.createdAt ?? "";
  const rightCreatedAt = right.createdAt ?? "";
  return leftCreatedAt.localeCompare(rightCreatedAt) || left.id.localeCompare(right.id);
}

function isPacketFilename(name: string): boolean {
  return name.endsWith(".yaml") || name.endsWith(".yml") || name.endsWith(".json");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "context-packet";
}

function assertProjectGroupId(groupId: string): string {
  if (!/^grp_[A-Za-z0-9_-]+$/.test(groupId)) {
    throw new Error("Invalid Project group id");
  }
  return groupId;
}

function assertPacketId(id: string): string {
  return ProjectContextFileIdSchema.parse(id);
}
