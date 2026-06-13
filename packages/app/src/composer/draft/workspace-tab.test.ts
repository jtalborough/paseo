import { describe, expect, test } from "vitest";

import { updateProfileFormField, validateDraftSubmission } from "./workspace-tab-core";

const baseComposerState = {
  providerDefinitions: [{ id: "deepseek-tui" }],
  selectedProvider: "deepseek-tui",
  isModelLoading: false,
  effectiveModelId: "",
  availableModels: [],
};

function validate(overrides = {}) {
  return validateDraftSubmission({
    text: "hello",
    allowsEmptyAutoSubmit: false,
    composerState: baseComposerState,
    autoSubmitConfig: null,
    workspaceDirectory: "/tmp/project",
    hasClient: true,
    ...overrides,
  });
}

describe("workspace draft agent model validation", () => {
  test("allows a ready provider with no models to submit without a selected model", () => {
    expect(validate({})).toBeNull();
  });

  test("keeps waiting while model defaults are loading", () => {
    expect(
      validate({
        composerState: {
          ...baseComposerState,
          isModelLoading: true,
        },
      }),
    ).toBe("Model defaults are still loading");
  });

  test("still requires a selected model when the provider exposes models", () => {
    expect(
      validate({
        composerState: {
          ...baseComposerState,
          availableModels: [{ id: "deepseek/deepseek-v4-pro" }],
        },
      }),
    ).toBe("No model is available for the selected provider");
  });
});

describe("profile form field updates", () => {
  const profileForm = {
    id: "reviewer",
    name: "Reviewer",
    provider: "codex",
    model: "gpt-5.4",
    prompt: "prompts/reviewer.md",
    defaultTools: "project-files",
  };

  test("clears model when provider changes", () => {
    expect(updateProfileFormField(profileForm, "provider", "claude")).toEqual({
      ...profileForm,
      provider: "claude",
      model: "",
    });
  });

  test("preserves model when other fields change", () => {
    expect(updateProfileFormField(profileForm, "name", "QA Tester")).toEqual({
      ...profileForm,
      name: "QA Tester",
    });
  });
});
