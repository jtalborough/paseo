import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProjectDirectoryManifestSchema } from "@getpaseo/protocol/project-context/types";
import { afterEach, describe, expect, test } from "vitest";
import {
  archiveProjectDirectory,
  archivedProjectDirectoryPath,
  projectDirectoryPath,
  syncProjectDirectory,
} from "./project-directory.js";
import { createPersistedGroupRecord, createPersistedProjectRecord } from "./workspace-registry.js";

describe("Project directory", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("materializes a portable Project with Markdown content and external child references", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-project-directory-"));
    const externalChild = mkdtempSync(path.join(tmpdir(), "paseo-project-child-"));
    roots.push(paseoHome, externalChild);
    writeFileSync(path.join(externalChild, ".keep"), "");
    const group = createPersistedGroupRecord({
      groupId: "grp_work",
      displayName: "Work",
      archetype: "code",
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
    });
    const child = createPersistedProjectRecord({
      projectId: "child-1",
      rootPath: externalChild,
      kind: "non_git",
      displayName: "Child",
      groupId: group.groupId,
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
    });

    const cwd = await syncProjectDirectory({ paseoHome, group, children: [child] });
    expect(cwd).toBe(projectDirectoryPath(paseoHome, group.groupId));
    expect(readFileSync(path.join(cwd, "project.md"), "utf8")).toBe("# Work\n\n");
    expect(readFileSync(path.join(cwd, "tasks", "README.md"), "utf8")).toContain(
      "projectGroupId: grp_example",
    );
    expect(readFileSync(path.join(cwd, "notes", "README.md"), "utf8")).toBe("# Notes\n\n");
    expect(readFileSync(path.join(cwd, "context", "README.md"), "utf8")).toContain(
      "Runtime agent state still lives",
    );
    expect(readFileSync(path.join(cwd, "agents", "README.md"), "utf8")).toContain(
      "Project agent profiles",
    );
    expect(readFileSync(path.join(cwd, "prompts", "README.md"), "utf8")).toContain(
      "Reusable Project prompts",
    );
    expect(readFileSync(path.join(cwd, "context", "packets", "README.md"), "utf8")).toContain(
      "Context packets",
    );
    expect(
      ProjectDirectoryManifestSchema.parse(
        JSON.parse(readFileSync(path.join(cwd, "project.json"), "utf8")),
      ),
    ).toMatchObject({
      schemaVersion: 1,
      groupId: "grp_work",
      displayName: "Work",
      archetype: "code",
      children: [{ projectId: "child-1", rootPath: externalChild }],
    });

    const manifestInode = statSync(path.join(cwd, "project.json")).ino;
    await syncProjectDirectory({ paseoHome, group, children: [child] });
    expect(statSync(path.join(cwd, "project.json")).ino).toBe(manifestInode);
  });

  test("preserves user Markdown and archives only the managed Project directory", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-project-directory-"));
    const externalChild = mkdtempSync(path.join(tmpdir(), "paseo-project-child-"));
    roots.push(paseoHome, externalChild);
    writeFileSync(path.join(externalChild, ".keep"), "");
    const group = createPersistedGroupRecord({
      groupId: "grp_work",
      displayName: "Work",
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
    });
    const cwd = await syncProjectDirectory({ paseoHome, group, children: [] });
    writeFileSync(path.join(cwd, "project.md"), "# My notes\n");
    writeFileSync(path.join(cwd, "prompts", "README.md"), "# My prompts\n");
    writeFileSync(path.join(cwd, "agents", "README.md"), "# My agents\n");
    writeFileSync(path.join(cwd, "context", "README.md"), "# My context\n");
    writeFileSync(path.join(cwd, "context", "packets", "README.md"), "# My packets\n");

    await syncProjectDirectory({
      paseoHome,
      group: { ...group, displayName: "Renamed" },
      children: [],
    });
    expect(readFileSync(path.join(cwd, "project.md"), "utf8")).toBe("# My notes\n");
    expect(readFileSync(path.join(cwd, "prompts", "README.md"), "utf8")).toBe("# My prompts\n");
    expect(readFileSync(path.join(cwd, "agents", "README.md"), "utf8")).toBe("# My agents\n");
    expect(readFileSync(path.join(cwd, "context", "README.md"), "utf8")).toBe("# My context\n");
    expect(readFileSync(path.join(cwd, "context", "packets", "README.md"), "utf8")).toBe(
      "# My packets\n",
    );

    const archivedAt = "2026-06-07T12:00:00.000Z";
    await archiveProjectDirectory({ paseoHome, groupId: group.groupId, archivedAt });
    expect(
      readFileSync(
        path.join(archivedProjectDirectoryPath(paseoHome, group.groupId, archivedAt), "project.md"),
        "utf8",
      ),
    ).toBe("# My notes\n");
    expect(readFileSync(path.join(externalChild, ".keep"), "utf8")).toBe("");
  });

  test("rejects Project ids that could escape the managed Projects directory", () => {
    expect(() => projectDirectoryPath("/tmp/paseo", "../outside")).toThrow(
      "Invalid Project group id",
    );
  });
});
