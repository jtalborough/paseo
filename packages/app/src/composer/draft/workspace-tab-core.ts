import { resolveSubmissionReadiness } from "@/provider-selection/provider-selection";

export interface WorkspaceDraftAutoSubmitConfig {
  provider: string;
  model: string | null;
}

export function updateProfileFormField<TForm extends { provider: string; model: string }>(
  current: TForm,
  field: keyof TForm,
  value: string,
): TForm {
  if (field !== "provider" || current.provider === value) {
    return { ...current, [field]: value };
  }
  return { ...current, provider: value, model: "" };
}

export function validateDraftSubmission(input: {
  text: string;
  allowsEmptyAutoSubmit: boolean;
  composerState: {
    providerDefinitions: unknown[];
    selectedProvider: string | null;
    isModelLoading: boolean;
    effectiveModelId: string | null;
    availableModels: unknown[];
  };
  autoSubmitConfig: WorkspaceDraftAutoSubmitConfig | null;
  workspaceDirectory: string | null;
  hasClient: boolean;
}): string | null {
  const {
    text,
    allowsEmptyAutoSubmit,
    composerState,
    autoSubmitConfig,
    workspaceDirectory,
    hasClient,
  } = input;
  const readiness = resolveSubmissionReadiness({
    text,
    allowsEmptyAutoSubmit,
    providerCount: composerState.providerDefinitions.length,
    selection: {
      provider: composerState.selectedProvider,
      modelId: composerState.effectiveModelId ?? "",
      availableModels: composerState.availableModels,
      isModelLoading: composerState.isModelLoading,
    },
    autoSubmitConfig,
    workspaceDirectory,
    hasClient,
  });
  return readiness.ok ? null : (readiness.reason ?? null);
}
