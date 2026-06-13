import { describe, expect, test } from "vitest";
import { normalizeWorkspaceTabTarget } from "@/workspace-tabs/identity";
import { buildProjectAgentProfileDraftTarget } from "./project-home-screen-core";

describe("buildProjectAgentProfileDraftTarget", () => {
  test("carries a loaded profile prompt into the draft tab setup", () => {
    const target = buildProjectAgentProfileDraftTarget({
      draftId: "draft-profile",
      groupId: "grp_work",
      launchCwd: "/tmp/work",
      initialPrompt: "# QA Tester\n",
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
