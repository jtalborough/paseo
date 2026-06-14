import { describe, expect, test } from "vitest";
import { normalizeWorkspaceTabTarget } from "@/workspace-tabs/identity";
import {
  buildProjectAgentProfileDraftTarget,
  buildProjectOperatingPath,
} from "./project-home-screen-core";

describe("buildProjectOperatingPath", () => {
  test("keeps the Project workflow path tied to durable surfaces", () => {
    expect(
      buildProjectOperatingPath({
        hasProjectDirectory: true,
        folderCount: 2,
        activeAgentCount: 1,
      }),
    ).toEqual([
      {
        id: "tasks",
        title: "Shape the work",
        detail: "Create roadmap items, bugs, follow-ups, and acceptance criteria.",
        actionLabel: "Open tasks",
      },
      {
        id: "agents",
        title: "Set the team",
        detail: "1 active agent attached.",
        actionLabel: "Open agents",
      },
      {
        id: "notes",
        title: "Keep decisions",
        detail: "Store product direction, project notes, and durable operating context.",
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
        detail: "2 external folders referenced by this Project.",
        actionLabel: "Open files",
      },
    ]);
  });

  test("points new Projects toward folder setup before execution", () => {
    const filesStep = buildProjectOperatingPath({
      hasProjectDirectory: false,
      folderCount: 0,
      activeAgentCount: 0,
    }).find((step) => step.id === "files");

    expect(filesStep?.detail).toBe(
      "Attach local or remote folders so agents can reach the right work.",
    );
  });
});

describe("buildProjectAgentProfileDraftTarget", () => {
  test("carries a loaded profile prompt into the draft tab setup", () => {
    const target = buildProjectAgentProfileDraftTarget({
      draftId: "draft-profile",
      groupId: "grp_work",
      launchCwd: "/tmp/work",
      initialPrompt: "# QA Tester\n",
      contextPacketPath: "context/packets/profile-launch.yaml",
      entry: {
        path: "agents/qa-tester.yaml",
        profile: {
          schemaVersion: 1,
          id: "qa-tester",
          name: "QA Tester",
          provider: "codex",
          model: "gpt-5.4",
          prompt: "prompts/qa-tester.md",
          defaultTools: ["project-files"],
          folderGrants: [],
        },
      },
    });

    expect(normalizeWorkspaceTabTarget(target)).toEqual({
      kind: "draft",
      draftId: "draft-profile",
      cwd: "/tmp/work",
      projectGroupId: "grp_work",
      setup: {
        provider: "codex",
        cwd: "/tmp/work",
        modeId: null,
        model: "gpt-5.4",
        thinkingOptionId: null,
        featureValues: {},
        labels: {
          launchSource: "project-agent-profile",
          projectGroupId: "grp_work",
          profilePath: "agents/qa-tester.yaml",
          contextPacket: "context/packets/profile-launch.yaml",
        },
        initialPrompt: "# QA Tester\n",
      },
    });
  });

  test("rejects profiles without a provider for direct draft tab launch", () => {
    expect(() =>
      buildProjectAgentProfileDraftTarget({
        draftId: "draft-profile",
        groupId: "grp_work",
        launchCwd: "/tmp/work",
        initialPrompt: null,
        contextPacketPath: null,
        entry: {
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
      }),
    ).toThrow("Set a provider on this profile before using it");
  });
});
