import { describe, expect, test } from "vitest";
import { applyProjectAgentProfileToDraft } from "./new-project-agent-screen-core";

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("applyProjectAgentProfileToDraft", () => {
  test("loads prompt-only profiles without requiring provider or model", async () => {
    const selected: string[] = [];
    const packets: unknown[] = [];
    let draftText = "";

    await applyProjectAgentProfileToDraft({
      client: {
        async projectAgentProfileList() {
          return [
            {
              path: "agents/qa-tester.yaml",
              profile: {
                schemaVersion: 1,
                id: "qa-tester",
                name: "QA Tester",
                provider: null,
                model: null,
                prompt: "prompts/qa-tester.md",
                defaultTools: [],
                folderGrants: [],
              },
            },
          ];
        },
        async readFile(cwd, filePath) {
          selected.push(`${cwd}:${filePath}`);
          return { bytes: encodeText("# QA Tester\n") };
        },
        async projectContextPacketCreate(input) {
          packets.push(input);
          return {
            path: "context/packets/qa-tester.yaml",
            packet: {
              schemaVersion: 1,
              id: "qa-tester",
              projectGroupId: input.projectGroupId,
              createdAt: "2026-06-13T12:00:00.000Z",
              createdByAgentId: null,
              launchedAgentId: null,
              launchReason: input.launchReason ?? null,
              provider: input.provider ?? null,
              model: input.model ?? null,
              profile: input.profile ?? null,
              prompt: input.prompt ?? null,
              task: null,
              tools: input.tools ?? [],
              notes: [],
              files: [],
              bookmarks: [],
              browser: [],
              folderGrants: normalizeFolderGrants(input.folderGrants),
            },
          };
        },
      },
      composerState: {
        setProviderAndModelFromUser: (provider, model) => selected.push(`${provider}:${model}`),
        setProviderFromUser: (provider) => selected.push(provider),
      },
      projectGroupId: "grp_work",
      projectDirectory: "/tmp/project",
      profilePath: "agents/qa-tester.yaml",
      setText: (text) => {
        draftText = text;
      },
    });

    expect(selected).toEqual(["/tmp/project:prompts/qa-tester.md"]);
    expect(draftText).toBe("# QA Tester\n");
    expect(packets).toEqual([
      {
        projectGroupId: "grp_work",
        launchReason: "Use profile: QA Tester",
        provider: null,
        model: null,
        profile: "agents/qa-tester.yaml",
        prompt: "prompts/qa-tester.md",
        tools: [],
        folderGrants: [],
      },
    ]);
  });

  test("applies provider and model when the profile defines them", async () => {
    const selected: string[] = [];
    const packets: unknown[] = [];

    await applyProjectAgentProfileToDraft({
      client: {
        async projectAgentProfileList() {
          return [
            {
              path: "agents/reviewer.yaml",
              profile: {
                schemaVersion: 1,
                id: "reviewer",
                name: "Reviewer",
                provider: "codex",
                model: "gpt-5.4",
                prompt: null,
                defaultTools: [],
                folderGrants: [],
              },
            },
          ];
        },
        async readFile() {
          throw new Error("unexpected read");
        },
        async projectContextPacketCreate(input) {
          packets.push(input);
          return {
            path: "context/packets/reviewer.yaml",
            packet: {
              schemaVersion: 1,
              id: "reviewer",
              projectGroupId: input.projectGroupId,
              createdAt: "2026-06-13T12:00:00.000Z",
              createdByAgentId: null,
              launchedAgentId: null,
              launchReason: input.launchReason ?? null,
              provider: input.provider ?? null,
              model: input.model ?? null,
              profile: input.profile ?? null,
              prompt: input.prompt ?? null,
              task: null,
              tools: input.tools ?? [],
              notes: [],
              files: [],
              bookmarks: [],
              browser: [],
              folderGrants: normalizeFolderGrants(input.folderGrants),
            },
          };
        },
      },
      composerState: {
        setProviderAndModelFromUser: (provider, model) => selected.push(`${provider}:${model}`),
        setProviderFromUser: (provider) => selected.push(provider),
      },
      projectGroupId: "grp_work",
      projectDirectory: "/tmp/project",
      profilePath: "agents/reviewer.yaml",
      setText: () => {
        throw new Error("unexpected text");
      },
    });

    expect(selected).toEqual(["codex:gpt-5.4"]);
    expect(packets).toEqual([
      {
        projectGroupId: "grp_work",
        launchReason: "Use profile: Reviewer",
        provider: "codex",
        model: "gpt-5.4",
        profile: "agents/reviewer.yaml",
        prompt: null,
        tools: [],
        folderGrants: [],
      },
    ]);
  });
});

function normalizeFolderGrants(
  grants: Array<{ projectId: string; path?: string; mode?: "read" | "read-write" }> | undefined,
): Array<{ projectId: string; path: string; mode: "read" | "read-write" }> {
  return (grants ?? []).map((grant) => ({
    projectId: grant.projectId,
    path: grant.path ?? ".",
    mode: grant.mode ?? "read",
  }));
}
