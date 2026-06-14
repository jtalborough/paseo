import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import ReanimatedAnimated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeyboardShiftStyle } from "@/hooks/use-keyboard-shift-style";
import { useContainerWidthBelow } from "@/hooks/use-container-width";
import invariant from "tiny-invariant";
import { Composer } from "@/composer";
import { DraftAgentModeControl } from "@/composer/agent-controls/mode-control";
import { ComposerImportPill } from "@/composer/draft/import-pill";
import { FileDropZone } from "@/components/file-drop-zone";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgentStreamView } from "@/agent-stream/view";
import { composerWorkspaceAttachment } from "@/composer/attachments/workspace";
import type { ImageAttachment } from "@/composer/types";
import { useAgentInputDraft } from "@/composer/draft/input-draft";
import type { CreateAgentInitialValues } from "@/hooks/use-agent-form-state";
import { useDraftAgentCreateFlow, type DraftCreateAttempt } from "@/composer/draft/create-flow";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { buildWorkspaceDraftAgentConfig } from "@/screens/workspace/workspace-draft-agent-config";
import { buildDraftStoreKey } from "@/stores/draft-keys";
import { usePanelStore } from "@/stores/panel-store";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { useWorkspaceExecutionAuthority } from "@/stores/session-store-hooks";
import { useWorkspaceDraftSubmissionStore } from "@/stores/workspace-draft-submission-store";
import { encodeImages } from "@/utils/encode-images";
import type { WorkspaceFileOpenRequest } from "@/workspace/file-open";
import { shouldAutoFocusWorkspaceDraftComposer } from "@/screens/workspace/workspace-draft-pane-focus";
import {
  updateProfileFormField,
  validateDraftSubmission,
} from "@/composer/draft/workspace-tab-core";
import type {
  AgentCapabilityFlags,
  AgentModelDefinition,
  AgentProvider,
} from "@getpaseo/protocol/agent-types";
import type { AgentSnapshotPayload } from "@getpaseo/protocol/messages";
import type {
  DaemonClient,
  ProjectAgentProfileEntry,
} from "@getpaseo/client/internal/daemon-client";
import type { ProjectAgentProfile } from "@getpaseo/protocol/project-context/types";
import type { WorkspaceComposerAttachment } from "@/attachments/types";
import {
  useWorkspaceAttachments,
  useWorkspaceAttachmentScopeKey,
} from "@/attachments/workspace-attachments-store";
import type { UserMessageImageAttachment } from "@/types/stream";
import { COMPACT_FORM_FACTOR_WIDTH, useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import type { WorkspaceDraftTabSetup } from "@/stores/workspace-tabs-store";
import { useToast } from "@/contexts/toast-context";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useProjectGroups } from "@/hooks/use-project-groups";
import { buildProfileLaunchBriefing } from "@/projects/project-launch-briefing";
import { buildProjectAgentProfileLaunchLabels } from "@/projects/project-agent-launch-labels";

const EMPTY_PENDING_PERMISSIONS = new Map();
const EMPTY_ONLINE_SERVER_IDS: string[] = [];
function profileSelectTriggerStyle({ pressed, hovered }: { pressed: boolean; hovered: boolean }) {
  return [styles.profileSelectTrigger, (pressed || hovered) && styles.profileSelectTriggerActive];
}
const DRAFT_CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: true,
  supportsSessionPersistence: false,
  supportsDynamicModes: false,
  supportsMcpServers: false,
  supportsReasoningStream: false,
  supportsToolInvocations: false,
};

interface AutoSubmitConfig {
  provider: string;
  modeId: string | null;
  model: string | null;
  thinkingOptionId: string | null;
  featureValues: Record<string, unknown>;
}

function resolveAutoSubmitConfig(
  pending: {
    provider: string;
    modeId?: string | null;
    model?: string | null;
    thinkingOptionId?: string | null;
    featureValues?: Record<string, unknown>;
  } | null,
): AutoSubmitConfig | null {
  if (!pending) return null;
  return {
    provider: pending.provider,
    modeId: pending.modeId ?? null,
    model: pending.model ?? null,
    thinkingOptionId: pending.thinkingOptionId ?? null,
    featureValues: pending.featureValues ?? {},
  };
}

function resolveDraftModeIdOverride(input: {
  autoSubmitConfig: AutoSubmitConfig | null;
  modeOptionsCount: number;
  selectedMode: string;
}): { modeId: string } | Record<string, never> {
  const { autoSubmitConfig, modeOptionsCount, selectedMode } = input;
  if (autoSubmitConfig?.modeId) {
    return { modeId: autoSubmitConfig.modeId };
  }
  if (modeOptionsCount > 0 && selectedMode !== "") {
    return { modeId: selectedMode };
  }
  return {};
}

function resolveDraftModeId(input: {
  autoSubmitConfig: AutoSubmitConfig | null;
  modeOptionsCount: number;
  selectedMode: string;
}): string | null {
  const { autoSubmitConfig, modeOptionsCount, selectedMode } = input;
  if (autoSubmitConfig?.modeId !== undefined) {
    return autoSubmitConfig.modeId;
  }
  if (modeOptionsCount > 0 && selectedMode !== "") {
    return selectedMode;
  }
  return null;
}

async function submitDraftCreateRequest(input: {
  attempt: { clientMessageId: string };
  text: string;
  images?: UserMessageImageAttachment[];
  attachments?: unknown;
  client: DaemonClient | null;
  workspaceDirectory: string | null;
  workspaceExecutionAuthority: { workspaceId: string } | null;
  projectGroupId: string | null;
  autoSubmitConfig: AutoSubmitConfig | null;
  launchLabels: Record<string, string> | null;
  composerState: {
    selectedProvider: string | null;
    selectedMode: string;
    modeOptions: unknown[];
    effectiveModelId: string | null;
    effectiveThinkingOptionId: string | null;
    featureValues: Record<string, unknown> | undefined;
  };
}): Promise<{ agentId: string | null; result: AgentSnapshotPayload }> {
  const {
    attempt,
    text,
    images,
    attachments,
    client,
    workspaceDirectory,
    workspaceExecutionAuthority,
    projectGroupId,
    autoSubmitConfig,
    launchLabels,
    composerState,
  } = input;

  invariant(workspaceDirectory, "Workspace directory is required");
  invariant(workspaceExecutionAuthority, "Workspace authority is required");
  if (!client) {
    throw new Error("Host is not connected");
  }

  const provider = autoSubmitConfig?.provider ?? composerState.selectedProvider;
  if (!provider) {
    throw new Error("Select a model");
  }
  const modeIdOverride = resolveDraftModeIdOverride({
    autoSubmitConfig,
    modeOptionsCount: composerState.modeOptions.length,
    selectedMode: composerState.selectedMode,
  });
  const config = buildWorkspaceDraftAgentConfig({
    provider,
    cwd: workspaceDirectory,
    ...modeIdOverride,
    model: autoSubmitConfig?.model ?? (composerState.effectiveModelId || undefined),
    thinkingOptionId:
      autoSubmitConfig?.thinkingOptionId ?? (composerState.effectiveThinkingOptionId || undefined),
    featureValues: autoSubmitConfig?.featureValues ?? composerState.featureValues,
  });

  const imagesData = await encodeImages(images);
  const attachmentsArray = Array.isArray(attachments) ? attachments : undefined;
  const result = await client.createAgent({
    config,
    workspaceId: workspaceExecutionAuthority.workspaceId,
    projectGroupId: projectGroupId ?? undefined,
    initialPrompt: text || undefined,
    clientMessageId: attempt.clientMessageId,
    images: imagesData ?? undefined,
    attachments: attachmentsArray,
    labels: launchLabels ?? undefined,
  });

  return {
    agentId: result.id,
    result,
  };
}

function buildDraftAgentSnapshot(input: {
  attempt: { timestamp: Date };
  serverId: string;
  tabId: string;
  workspaceDirectory: string | null;
  projectGroupId: string | null;
  autoSubmitConfig: AutoSubmitConfig | null;
  launchLabels: Record<string, string> | null;
  composerState: {
    effectiveModelId: string | null;
    effectiveThinkingOptionId: string | null;
    modeOptions: unknown[];
    selectedMode: string;
    selectedProvider: string | null;
    agentControls: { features?: Agent["features"] };
  };
}): Agent {
  const {
    attempt,
    serverId,
    tabId,
    workspaceDirectory,
    projectGroupId,
    autoSubmitConfig,
    launchLabels,
    composerState,
  } = input;
  invariant(workspaceDirectory, "Workspace directory is required");
  const now = attempt.timestamp;
  const model = autoSubmitConfig?.model ?? (composerState.effectiveModelId || null);
  const thinkingOptionId =
    autoSubmitConfig?.thinkingOptionId ?? (composerState.effectiveThinkingOptionId || null);
  const modeId = resolveDraftModeId({
    autoSubmitConfig,
    modeOptionsCount: composerState.modeOptions.length,
    selectedMode: composerState.selectedMode,
  });
  const provider = autoSubmitConfig?.provider ?? composerState.selectedProvider;
  if (!provider) {
    throw new Error("Select a model");
  }
  return {
    serverId,
    id: tabId,
    provider,
    status: "running",
    createdAt: now,
    updatedAt: now,
    lastUserMessageAt: now,
    lastActivityAt: now,
    capabilities: DRAFT_CAPABILITIES,
    currentModeId: modeId,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    runtimeInfo: { provider, sessionId: null, model, modeId },
    title: "Agent",
    cwd: workspaceDirectory,
    projectGroupId,
    model,
    features: composerState.agentControls.features,
    thinkingOptionId,
    parentAgentId: null,
    labels: launchLabels ?? {},
  };
}

function buildDraftInitialValues(input: {
  workingDir: string | null;
  initialSetup: WorkspaceDraftTabSetup | null;
}): CreateAgentInitialValues | undefined {
  if (!input.workingDir) {
    return undefined;
  }
  if (!input.initialSetup) {
    return { workingDir: input.workingDir };
  }
  return {
    workingDir: input.workingDir,
    provider: input.initialSetup.provider,
    modeId: input.initialSetup.modeId,
    model: input.initialSetup.model,
    thinkingOptionId: input.initialSetup.thinkingOptionId,
  };
}

function resolveDraftWorkingDirectory(input: {
  workspaceDirectory: string | null;
  initialCwd: string | null;
  initialSetup: WorkspaceDraftTabSetup | null;
}): string | null {
  if (input.initialCwd) {
    return input.initialCwd;
  }
  if (input.initialSetup) {
    return input.initialSetup.cwd;
  }
  return input.workspaceDirectory;
}

function resolveOnlineServerIds(input: { isConnected: boolean; serverId: string }): string[] {
  if (!input.isConnected) {
    return EMPTY_ONLINE_SERVER_IDS;
  }
  return [input.serverId];
}

function resolveDraftProjectGroupId(
  explicitProjectGroupId: string | null | undefined,
  workspaceProjectGroupId: string | null,
): string | null {
  return explicitProjectGroupId ?? workspaceProjectGroupId;
}

function resolveDraftLaunchLabels(
  profileLaunchLabels: Record<string, string> | null,
  draftSetup: WorkspaceDraftTabSetup | null,
): Record<string, string> | null {
  return profileLaunchLabels ?? draftSetup?.labels ?? null;
}

interface WorkspaceDraftAgentTabProps {
  serverId: string;
  workspaceId: string;
  tabId: string;
  draftId: string;
  initialSetup?: WorkspaceDraftTabSetup;
  initialCwd?: string | null;
  projectGroupId?: string | null;
  isPaneFocused: boolean;
  onCreated: (snapshot: AgentSnapshotPayload) => void;
  onOpenWorkspaceFile: (request: WorkspaceFileOpenRequest) => void;
  onOpenImportSheet?: () => void;
}

function resolveImportPillPress(
  onOpenImportSheet: (() => void) | undefined,
  isSubmitting: boolean,
): (() => void) | null {
  if (isSubmitting) {
    return null;
  }
  return onOpenImportSheet ?? null;
}

export function WorkspaceDraftAgentTab({
  serverId,
  workspaceId,
  tabId,
  draftId,
  initialSetup,
  initialCwd,
  projectGroupId,
  isPaneFocused,
  onCreated,
  onOpenWorkspaceFile,
  onOpenImportSheet,
}: WorkspaceDraftAgentTabProps) {
  const insets = useSafeAreaInsets();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const workspaceAuthority = useWorkspaceExecutionAuthority(serverId, workspaceId);
  const workspaceProjectGroupId = useSessionStore(
    (state) => state.sessions[serverId]?.workspaces.get(workspaceId)?.projectGroupId ?? null,
  );
  const workspaceExecutionAuthority = workspaceAuthority?.ok ? workspaceAuthority.authority : null;
  const workspaceDirectory = workspaceExecutionAuthority?.workspaceDirectory ?? null;
  const draftSetup = initialSetup ?? null;
  const [profileLaunchLabels, setProfileLaunchLabels] = useState<Record<string, string> | null>(
    null,
  );
  const launchLabels = resolveDraftLaunchLabels(profileLaunchLabels, draftSetup);
  const draftProjectGroupId = resolveDraftProjectGroupId(projectGroupId, workspaceProjectGroupId);
  const draftWorkingDirectory = resolveDraftWorkingDirectory({
    workspaceDirectory,
    initialCwd: initialCwd ?? null,
    initialSetup: draftSetup,
  });
  const draftInitialValues = buildDraftInitialValues({
    workingDir: draftWorkingDirectory,
    initialSetup: draftSetup,
  });
  const onlineServerIds = resolveOnlineServerIds({ isConnected, serverId });
  const addImagesRef = useRef<((images: ImageAttachment[]) => void) | null>(null);
  const draftStoreKey = useMemo(
    () =>
      buildDraftStoreKey({
        serverId,
        agentId: tabId,
        draftId,
      }),
    [draftId, serverId, tabId],
  );
  const draftInput = useAgentInputDraft({
    draftKey: draftStoreKey,
    composer: {
      initialServerId: serverId,
      initialValues: draftInitialValues,
      initialFeatureValues: draftSetup?.featureValues,
      isVisible: true,
      onlineServerIds,
      lockedWorkingDir: draftWorkingDirectory ?? undefined,
    },
  });
  const composerState = draftInput.composerState;
  if (!composerState) {
    throw new Error("Workspace draft composer state is required");
  }
  const clearDraftInput = draftInput.clear;
  const setDraftText = draftInput.setText;
  const setDraftAttachments = draftInput.setAttachments;
  const appliedInitialPromptKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const initialPrompt = draftSetup?.initialPrompt;
    if (!initialPrompt) {
      return;
    }
    const promptKey = `${draftId}:${initialPrompt}`;
    if (appliedInitialPromptKeyRef.current === promptKey) {
      return;
    }
    appliedInitialPromptKeyRef.current = promptKey;
    setDraftText(initialPrompt);
  }, [draftId, draftSetup?.initialPrompt, setDraftText]);
  const pendingAutoSubmit = useWorkspaceDraftSubmissionStore((state) => {
    const pending = state.pendingByDraftId[draftId] ?? null;
    return pending?.serverId === serverId && pending.workspaceId === workspaceId ? pending : null;
  });
  const pendingCreateAttempt = useCreateFlowStore((state) => {
    const pending = state.pendingByDraftId[draftId] ?? null;
    return pending?.serverId === serverId && pending.lifecycle === "active" ? pending : null;
  });
  const consumePendingAutoSubmit = useWorkspaceDraftSubmissionStore(
    (state) => state.consumePending,
  );
  const autoSubmitConfig = resolveAutoSubmitConfig(pendingAutoSubmit);
  const initialCreateAttempt = useMemo<DraftCreateAttempt | null>(() => {
    if (!pendingAutoSubmit || !pendingCreateAttempt) {
      return null;
    }
    if (pendingAutoSubmit.clientMessageId !== pendingCreateAttempt.clientMessageId) {
      return null;
    }
    return {
      clientMessageId: pendingCreateAttempt.clientMessageId,
      text: pendingCreateAttempt.text,
      timestamp: new Date(pendingCreateAttempt.timestamp),
      ...(pendingCreateAttempt.images && pendingCreateAttempt.images.length > 0
        ? { images: pendingCreateAttempt.images }
        : {}),
      ...(pendingCreateAttempt.attachments && pendingCreateAttempt.attachments.length > 0
        ? { attachments: pendingCreateAttempt.attachments }
        : {}),
    };
  }, [pendingAutoSubmit, pendingCreateAttempt]);
  const allowsEmptyAutoSubmit = pendingAutoSubmit?.allowEmptyText === true;
  const isCompactFormFactor = useIsCompactFormFactor();
  const { onLayout: onInputAreaLayout, isBelow: isCompactComposerLayout } = useContainerWidthBelow(
    COMPACT_FORM_FACTOR_WIDTH,
    { initialIsBelow: isCompactFormFactor },
  );
  const workspaceAttachmentScopeKey = useWorkspaceAttachmentScopeKey({
    serverId,
    cwd: composerState.workingDir,
    workspaceId,
  });
  const workspaceAttachments = useWorkspaceAttachments(workspaceAttachmentScopeKey);
  const openFileExplorerForCheckout = usePanelStore((state) => state.openFileExplorerForCheckout);
  const setExplorerTabForCheckout = usePanelStore((state) => state.setExplorerTabForCheckout);
  const handleOpenWorkspaceAttachment = useCallback(
    (attachment: WorkspaceComposerAttachment) => {
      if (attachment.kind !== "review") {
        return;
      }
      const checkout = {
        serverId,
        cwd: attachment.attachment.cwd,
        isGit: true,
      };
      openFileExplorerForCheckout({
        checkout,
        isCompact: isCompactFormFactor,
      });
      setExplorerTabForCheckout({
        ...checkout,
        tab: "changes",
      });
    },
    [isCompactFormFactor, openFileExplorerForCheckout, serverId, setExplorerTabForCheckout],
  );

  const {
    formErrorMessage,
    isSubmitting,
    optimisticStreamItems,
    draftAgent,
    handleCreateFromInput,
    continueCreateFromAttempt,
  } = useDraftAgentCreateFlow<Agent, AgentSnapshotPayload>({
    draftId,
    getPendingServerId: () => serverId,
    initialAttempt: initialCreateAttempt,
    allowEmptyText: allowsEmptyAutoSubmit,
    validateBeforeSubmit: ({ text }) =>
      validateDraftSubmission({
        text,
        allowsEmptyAutoSubmit,
        composerState,
        autoSubmitConfig,
        workspaceDirectory: draftWorkingDirectory,
        hasClient: Boolean(client),
      }),
    onBeforeSubmit: () => {
      void composerState.persistFormPreferences();
      if (isWeb) {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      Keyboard.dismiss();
    },
    buildDraftAgent: (attempt) =>
      buildDraftAgentSnapshot({
        attempt,
        serverId,
        tabId,
        workspaceDirectory: draftWorkingDirectory,
        projectGroupId: draftProjectGroupId,
        autoSubmitConfig,
        launchLabels,
        composerState,
      }),
    createRequest: async ({ attempt, text, images, attachments }) =>
      submitDraftCreateRequest({
        attempt,
        text,
        images,
        attachments,
        client,
        workspaceDirectory: draftWorkingDirectory,
        workspaceExecutionAuthority,
        projectGroupId: draftProjectGroupId,
        autoSubmitConfig,
        launchLabels,
        composerState,
      }),
    onCreateSuccess: ({ result }) => {
      clearDraftInput("sent");
      onCreated(result);
    },
  });

  const isReadyForPendingAutoSubmit = Boolean(
    pendingAutoSubmit &&
    draftInput.isHydrated &&
    draftWorkingDirectory &&
    client &&
    !composerState.isModelLoading,
  );
  const autoSubmitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isReadyForPendingAutoSubmit) {
      return;
    }
    const submitKey = `${serverId}:${workspaceId}:${draftId}`;
    if (autoSubmitKeyRef.current === submitKey) {
      return;
    }
    const submission = consumePendingAutoSubmit({ serverId, workspaceId, draftId });
    if (!submission) {
      return;
    }
    autoSubmitKeyRef.current = submitKey;
    setDraftText("");
    setDraftAttachments([]);
    const preparedAttempt =
      initialCreateAttempt?.clientMessageId === submission.clientMessageId
        ? initialCreateAttempt
        : null;
    const createPromise = preparedAttempt
      ? continueCreateFromAttempt({
          attempt: preparedAttempt,
          cwd: submission.cwd,
        })
      : handleCreateFromInput({
          text: submission.text,
          attachments: submission.attachments,
          cwd: submission.cwd,
        });
    void createPromise.catch(() => {
      setDraftText(submission.text);
      setDraftAttachments(composerWorkspaceAttachment.userAttachmentsOnly(submission.attachments));
      autoSubmitKeyRef.current = null;
    });
  }, [
    continueCreateFromAttempt,
    consumePendingAutoSubmit,
    draftId,
    handleCreateFromInput,
    initialCreateAttempt,
    isReadyForPendingAutoSubmit,
    serverId,
    setDraftAttachments,
    setDraftText,
    workspaceId,
  ]);

  const handleFilesDropped = useCallback((files: ImageAttachment[]) => {
    addImagesRef.current?.(files);
  }, []);

  const handleAddImagesCallback = useCallback((addImages: (images: ImageAttachment[]) => void) => {
    addImagesRef.current = addImages;
  }, []);

  const focusInputRef = useRef<(() => void) | null>(null);

  const handleFocusInputCallback = useCallback((focus: () => void) => {
    focusInputRef.current = focus;
  }, []);

  const handleProviderSelectWithFocus = useCallback(
    (provider: Parameters<typeof composerState.setProviderFromUser>[0]) => {
      composerState.setProviderFromUser(provider);
      focusInputRef.current?.();
    },
    [composerState],
  );

  const handleModeSelectWithFocus = useCallback(
    (modeId: string) => {
      composerState.setModeFromUser(modeId);
      focusInputRef.current?.();
    },
    [composerState],
  );

  const handleModelSelectWithFocus = useCallback(
    (modelId: string) => {
      composerState.setModelFromUser(modelId);
      focusInputRef.current?.();
    },
    [composerState],
  );

  const handleProviderAndModelSelectWithFocus = useCallback(
    (
      provider: Parameters<typeof composerState.setProviderAndModelFromUser>[0],
      modelId: string,
    ) => {
      composerState.setProviderAndModelFromUser(provider, modelId);
      focusInputRef.current?.();
    },
    [composerState],
  );

  const handleThinkingOptionSelectWithFocus = useCallback(
    (optionId: string) => {
      composerState.setThinkingOptionFromUser(optionId);
      focusInputRef.current?.();
    },
    [composerState],
  );

  const handleSetFeatureWithFocus = useCallback(
    (featureId: string, value: unknown) => {
      composerState.agentControls.onSetFeature?.(featureId, value);
      focusInputRef.current?.();
    },
    [composerState],
  );

  const { style: composerKeyboardStyle } = useKeyboardShiftStyle({
    mode: "translate",
  });

  const inputAreaWrapperStyle = useMemo(
    () => [styles.inputAreaWrapper, { paddingBottom: insets.bottom }, composerKeyboardStyle],
    [insets.bottom, composerKeyboardStyle],
  );

  const handleDropdownCloseFocus = useCallback(() => {
    focusInputRef.current?.();
  }, []);
  const importPillPress = resolveImportPillPress(onOpenImportSheet, isSubmitting);
  const composerAgentControls = useMemo(
    () => ({
      ...composerState.agentControls,
      onSelectProvider: handleProviderSelectWithFocus,
      onSelectMode: handleModeSelectWithFocus,
      onSelectModel: handleModelSelectWithFocus,
      onSelectProviderAndModel: handleProviderAndModelSelectWithFocus,
      onSelectThinkingOption: handleThinkingOptionSelectWithFocus,
      onSetFeature: handleSetFeatureWithFocus,
      onDropdownClose: handleDropdownCloseFocus,
      disabled: isSubmitting,
    }),
    [
      composerState.agentControls,
      handleProviderSelectWithFocus,
      handleModeSelectWithFocus,
      handleModelSelectWithFocus,
      handleProviderAndModelSelectWithFocus,
      handleThinkingOptionSelectWithFocus,
      handleSetFeatureWithFocus,
      handleDropdownCloseFocus,
      isSubmitting,
    ],
  );
  const composerFooter = useMemo(
    () =>
      isCompactComposerLayout ? (
        <DraftAgentModeControl
          placement="footer"
          {...composerAgentControls}
          isCompactLayout={isCompactComposerLayout}
        />
      ) : undefined,
    [isCompactComposerLayout, composerAgentControls],
  );
  const profileProviderOptions = useMemo(
    () =>
      composerState.providerDefinitions.map((provider) => ({
        value: provider.id,
        label: provider.label,
      })),
    [composerState.providerDefinitions],
  );
  const profileModelsByProvider = useMemo(
    () => buildProfileModelOptionsByProvider(composerState.allProviderModels),
    [composerState.allProviderModels],
  );
  const handleApplyProfile = useCallback(
    async (profile: ProjectAgentProfile, promptText: string | null) => {
      const provider = profile.provider?.trim();
      if (provider) {
        const model = profile.model?.trim();
        if (model) {
          composerState.setProviderAndModelFromUser(provider as AgentProvider, model);
        } else {
          composerState.setProviderFromUser(provider as AgentProvider);
        }
      }
      if (promptText !== null && draftInput.text.trim() !== promptText.trim()) {
        const hasExistingText = draftInput.text.trim().length > 0;
        const shouldReplace =
          !hasExistingText ||
          (await confirmDialog({
            title: "Replace draft prompt?",
            message: `${profile.name} has a saved Markdown prompt. Replace the current draft text with it?`,
            confirmLabel: "Replace",
          }));
        if (!shouldReplace) {
          return false;
        }
        setDraftText(promptText);
      }
      focusInputRef.current?.();
      return true;
    },
    [composerState, draftInput.text, setDraftText],
  );
  const handleProfilePacketCreated = useCallback(
    (entry: ProjectAgentProfileEntry, contextPacketPath: string) => {
      if (!draftProjectGroupId) {
        return;
      }
      setProfileLaunchLabels(
        buildProjectAgentProfileLaunchLabels({
          projectGroupId: draftProjectGroupId,
          profilePath: entry.path,
          contextPacketPath,
        }),
      );
    },
    [draftProjectGroupId],
  );

  return (
    <FileDropZone onFilesDropped={handleFilesDropped}>
      <View style={styles.container}>
        <View style={styles.contentContainer}>
          {isSubmitting && draftAgent ? (
            <View style={styles.streamContainer}>
              <AgentStreamView
                agentId={tabId}
                serverId={serverId}
                agent={draftAgent}
                streamItems={optimisticStreamItems}
                pendingPermissions={EMPTY_PENDING_PERMISSIONS}
                onOpenWorkspaceFile={onOpenWorkspaceFile}
                fullWidth
              />
            </View>
          ) : (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.configScrollContent}
            >
              <View style={styles.configSection}>
                <DraftAgentProfilesPanel
                  serverId={serverId}
                  projectGroupId={draftProjectGroupId}
                  client={client}
                  providerOptions={profileProviderOptions}
                  modelOptionsByProvider={profileModelsByProvider}
                  onApplyProfile={handleApplyProfile}
                  onProfilePacketCreated={handleProfilePacketCreated}
                />
                {formErrorMessage ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{formErrorMessage}</Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          )}
        </View>

        <ReanimatedAnimated.View style={inputAreaWrapperStyle} onLayout={onInputAreaLayout}>
          {importPillPress ? (
            <View style={styles.importPillRow}>
              <View style={styles.importPillContent}>
                <ComposerImportPill onPress={importPillPress} />
              </View>
            </View>
          ) : null}
          <Composer
            agentId={tabId}
            serverId={serverId}
            externalKeyboardShift
            isPaneFocused={isPaneFocused}
            onSubmitMessage={handleCreateFromInput}
            isSubmitLoading={isSubmitting}
            blurOnSubmit={true}
            value={draftInput.text}
            onChangeText={draftInput.setText}
            attachments={draftInput.attachments}
            workspaceAttachments={workspaceAttachments}
            onOpenWorkspaceAttachment={handleOpenWorkspaceAttachment}
            onChangeAttachments={draftInput.setAttachments}
            cwd={composerState.workingDir}
            clearDraft={draftInput.clear}
            autoFocus={shouldAutoFocusWorkspaceDraftComposer({ isPaneFocused, isSubmitting })}
            onAddImages={handleAddImagesCallback}
            onFocusInput={handleFocusInputCallback}
            commandDraftConfig={composerState.commandDraftConfig}
            agentControls={composerAgentControls}
            footer={composerFooter}
            isCompactLayout={isCompactComposerLayout}
            fullWidth
          />
        </ReanimatedAnimated.View>
      </View>
    </FileDropZone>
  );
}

const EMPTY_PROFILE_FORM = {
  id: "",
  name: "",
  provider: "",
  model: "",
  prompt: "prompts/project-manager.md",
  defaultTools: "",
};
type ProfileForm = typeof EMPTY_PROFILE_FORM;
type ProfileFormKey = keyof ProfileForm;
interface ProfileSelectOption {
  value: string;
  label: string;
}
const DEFAULT_TOOL_OPTIONS: ProfileSelectOption[] = [
  { value: "project-files", label: "Project files" },
  { value: "project-tasks", label: "Project tasks" },
  { value: "project-notes", label: "Project notes" },
  { value: "project-context-packets", label: "Context packets" },
];

function buildProfileModelOptionsByProvider(
  modelsByProvider: Map<string, AgentModelDefinition[]>,
): Map<string, ProfileSelectOption[]> {
  return new Map(
    [...modelsByProvider.entries()].map(([provider, models]) => [
      provider,
      models.map((model) => ({
        value: model.id,
        label: model.label,
      })),
    ]),
  );
}

function DraftAgentProfilesPanel({
  serverId,
  projectGroupId,
  client,
  providerOptions,
  modelOptionsByProvider,
  onApplyProfile,
  onProfilePacketCreated,
}: {
  serverId: string;
  projectGroupId: string | null;
  client: DaemonClient | null;
  providerOptions: ProfileSelectOption[];
  modelOptionsByProvider: Map<string, ProfileSelectOption[]>;
  onApplyProfile: (profile: ProjectAgentProfile, promptText: string | null) => Promise<boolean>;
  onProfilePacketCreated: (entry: ProjectAgentProfileEntry, contextPacketPath: string) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { groups } = useProjectGroups(serverId);
  const projectDirectory = useMemo(
    () => groups.find((group) => group.groupId === projectGroupId)?.cwd ?? null,
    [groups, projectGroupId],
  );
  const supported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.projectAgentProfiles === true,
  );
  const canCreateContextPacket = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.projectContextPacketCreate === true,
  );
  const queryKey = useMemo(
    () => ["project-agent-profiles", serverId, projectGroupId],
    [projectGroupId, serverId],
  );
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_PROFILE_FORM);
  const hasDraftProfile = form.id.length > 0 || form.name.length > 0 || editingPath !== null;

  const profilesQuery = useQuery({
    queryKey,
    enabled: Boolean(client && supported && projectGroupId),
    queryFn: async () =>
      client && projectGroupId ? client.projectAgentProfileList(projectGroupId) : [],
    staleTime: 2_000,
  });
  const promptsQuery = useQuery({
    queryKey: ["project-prompts", serverId, projectGroupId, projectDirectory],
    enabled: Boolean(client && supported && projectDirectory),
    queryFn: async () => {
      if (!client || !projectDirectory) {
        return [];
      }
      const directory = await client.listDirectory(projectDirectory, "prompts");
      return directory.entries
        .filter((entry) => entry.kind === "file" && entry.name.endsWith(".md"))
        .map((entry) => ({ value: `prompts/${entry.name}`, label: entry.name }));
    },
    staleTime: 10_000,
  });

  const invalidateProfiles = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const upsertProfile = useMutation({
    mutationFn: async (input: { path: string | null; profile: ProjectAgentProfile }) => {
      if (!client || !projectGroupId) {
        throw new Error("Project is not connected");
      }
      return client.projectAgentProfileUpsert({
        projectGroupId,
        ...(input.path ? { path: input.path } : {}),
        profile: input.profile,
      });
    },
    onSuccess: () => {
      setEditingPath(null);
      setForm(EMPTY_PROFILE_FORM);
      void invalidateProfiles();
      toast.show("Agent profile saved", { variant: "success" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to save agent profile"),
  });

  const deleteProfile = useMutation({
    mutationFn: async (path: string) => {
      if (!client || !projectGroupId) {
        throw new Error("Project is not connected");
      }
      return client.projectAgentProfileDelete({ projectGroupId, path });
    },
    onSuccess: () => {
      setEditingPath(null);
      setForm(EMPTY_PROFILE_FORM);
      void invalidateProfiles();
      toast.show("Agent profile deleted", { variant: "success" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to delete agent profile"),
  });

  const handleNewProfile = useCallback(() => {
    setEditingPath(null);
    setForm({ ...EMPTY_PROFILE_FORM, id: "implementation-agent", name: "Implementation Agent" });
  }, []);

  const handleCancel = useCallback(() => {
    setEditingPath(null);
    setForm(EMPTY_PROFILE_FORM);
  }, []);

  const handleFieldChange = useCallback((field: ProfileFormKey, value: string) => {
    setForm((current) => updateProfileFormField(current, field, value));
  }, []);

  const handleSave = useCallback(() => {
    const profile = formToProfile(form);
    if (!profile) {
      toast.error("Profile needs an id and name");
      return;
    }
    upsertProfile.mutate({ path: editingPath, profile });
  }, [editingPath, form, toast, upsertProfile]);

  const handleEditProfile = useCallback((entry: ProjectAgentProfileEntry) => {
    setEditingPath(entry.path);
    setForm(profileToForm(entry.profile));
  }, []);

  const handleUseProfile = useCallback(
    async (entry: ProjectAgentProfileEntry) => {
      let promptText: string | null = null;
      if (!client || !projectGroupId || !canCreateContextPacket) {
        toast.error("Update the host to use profile launch packets");
        return;
      }
      if (entry.profile.prompt) {
        if (!projectDirectory) {
          toast.error("Project prompt file is not available");
          return;
        }
        try {
          const promptFile = await client.readFile(projectDirectory, entry.profile.prompt);
          promptText = new TextDecoder().decode(promptFile.bytes);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to load profile prompt");
          return;
        }
      }
      const didApply = await onApplyProfile(entry.profile, promptText);
      if (didApply) {
        try {
          const packet = await client.projectContextPacketCreate({
            projectGroupId,
            launchReason: `Use profile: ${entry.profile.name}`,
            provider: entry.profile.provider,
            model: entry.profile.model,
            profile: entry.path,
            prompt: entry.profile.prompt,
            tools: entry.profile.defaultTools,
            folderGrants: entry.profile.folderGrants,
          });
          void queryClient.invalidateQueries({
            queryKey: ["project-context-packets", serverId, projectGroupId],
          });
          onProfilePacketCreated(entry, packet.path);
          toast.show(`Using ${entry.profile.name} · ${packet.path}`, { variant: "success" });
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Profile applied, but launch packet failed",
          );
        }
      }
    },
    [
      canCreateContextPacket,
      client,
      onApplyProfile,
      onProfilePacketCreated,
      projectDirectory,
      projectGroupId,
      queryClient,
      serverId,
      toast,
    ],
  );

  const handleDeleteProfile = useCallback(
    async (entry: ProjectAgentProfileEntry) => {
      const confirmed = await confirmDialog({
        title: "Delete agent profile?",
        message: `${entry.profile.name} will be removed from ${entry.path}. Existing agents are not changed.`,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (confirmed) {
        deleteProfile.mutate(entry.path);
      }
    },
    [deleteProfile],
  );

  const profiles = profilesQuery.data ?? [];
  const modelOptions = useMemo(() => {
    const selectedProvider = form.provider.trim();
    const options = selectedProvider ? (modelOptionsByProvider.get(selectedProvider) ?? []) : [];
    if (!form.model.trim() || options.some((option) => option.value === form.model)) {
      return options;
    }
    return [{ value: form.model, label: form.model }, ...options];
  }, [form.model, form.provider, modelOptionsByProvider]);
  const promptOptions = useMemo(() => {
    const options = promptsQuery.data ?? [];
    if (options.some((option) => option.value === form.prompt)) {
      return options;
    }
    return [{ value: form.prompt, label: form.prompt || "No prompt" }, ...options].filter(
      (option) => option.value,
    );
  }, [form.prompt, promptsQuery.data]);

  if (!projectGroupId) {
    return null;
  }
  let profilesContent;
  if (!supported) {
    profilesContent = (
      <Text style={styles.profileMuted}>Update the host to manage agent profiles.</Text>
    );
  } else if (profilesQuery.isError) {
    profilesContent = <Text style={styles.profileMuted}>Agent profiles could not be loaded.</Text>;
  } else if (profiles.length > 0) {
    profilesContent = (
      <View style={styles.profileList}>
        {profiles.map((entry) => (
          <DraftAgentProfileRow
            key={entry.path}
            entry={entry}
            onEdit={handleEditProfile}
            onUse={handleUseProfile}
            onDelete={handleDeleteProfile}
          />
        ))}
      </View>
    );
  } else {
    profilesContent = <Text style={styles.profileMuted}>No profiles yet.</Text>;
  }

  return (
    <View style={styles.profilePanel} testID="draft-agent-profiles-panel">
      <View style={styles.profileHeader}>
        <View style={styles.profileHeaderText}>
          <Text style={styles.profileTitle}>Agent profiles</Text>
          <Text style={styles.profileHint}>Reusable Project roles for new agents.</Text>
        </View>
        {supported ? (
          <Button
            variant="ghost"
            size="xs"
            onPress={handleNewProfile}
            testID="draft-agent-profile-new"
          >
            New profile
          </Button>
        ) : null}
      </View>

      {profilesContent}

      {hasDraftProfile ? (
        <View style={styles.profileEditor}>
          <View style={styles.profileEditorHeader}>
            <Text style={styles.profileEditorTitle}>
              {editingPath ? "Edit profile" : "New profile"}
            </Text>
            {editingPath ? <Text style={styles.profilePath}>{editingPath}</Text> : null}
          </View>
          <View style={styles.profileFormGrid}>
            <ProfileInput
              field="id"
              label="Id"
              value={form.id}
              placeholder="implementation-agent"
              onChangeField={handleFieldChange}
            />
            <ProfileInput
              field="name"
              label="Name"
              value={form.name}
              placeholder="Implementation Agent"
              onChangeField={handleFieldChange}
            />
            <ProfileInput
              field="provider"
              label="Provider"
              value={form.provider}
              placeholder="codex"
              onChangeField={handleFieldChange}
              options={providerOptions}
            />
            <ProfileInput
              field="model"
              label="Model"
              value={form.model}
              placeholder="default"
              onChangeField={handleFieldChange}
              options={modelOptions}
            />
            <ProfileInput
              field="prompt"
              label="Prompt"
              value={form.prompt}
              placeholder="prompts/project-manager.md"
              onChangeField={handleFieldChange}
              options={promptOptions}
            />
            <ProfileInput
              field="defaultTools"
              label="Tools"
              value={form.defaultTools}
              placeholder="project-tasks, project-notes"
              onChangeField={handleFieldChange}
              options={DEFAULT_TOOL_OPTIONS}
              multi
            />
          </View>
          <View style={styles.profileActions}>
            <Button variant="ghost" size="xs" onPress={handleCancel}>
              Cancel
            </Button>
            <Button
              variant="default"
              size="xs"
              onPress={handleSave}
              loading={upsertProfile.isPending}
            >
              Save profile
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function DraftAgentProfileRow({
  entry,
  onEdit,
  onUse,
  onDelete,
}: {
  entry: ProjectAgentProfileEntry;
  onEdit: (entry: ProjectAgentProfileEntry) => void;
  onUse: (entry: ProjectAgentProfileEntry) => Promise<void>;
  onDelete: (entry: ProjectAgentProfileEntry) => void;
}) {
  const handleEdit = useCallback(() => onEdit(entry), [entry, onEdit]);
  const handleUse = useCallback(() => {
    void onUse(entry);
  }, [entry, onUse]);
  const handleDelete = useCallback(() => onDelete(entry), [entry, onDelete]);
  const profile = entry.profile;
  const briefing = useMemo(
    () => buildProfileLaunchBriefing({ profile, path: entry.path }),
    [entry.path, profile],
  );
  const primaryDetails = briefing.items
    .filter((item) => item.label !== "Packet")
    .slice(0, 3)
    .map((item) => item.value);

  return (
    <View style={styles.profileRow}>
      <Pressable
        style={styles.profileRowMain}
        onPress={handleEdit}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${profile.name}`}
        testID={`draft-agent-profile-${profile.id}`}
      >
        <View style={styles.profileRowTitleLine}>
          <Text style={styles.profileRowTitle} numberOfLines={1}>
            {profile.name}
          </Text>
          <StatusBadge label={briefing.readinessLabel} variant={briefing.badgeVariant} />
        </View>
        <Text style={styles.profileRowHint} numberOfLines={1}>
          {primaryDetails.join(" - ")}
        </Text>
        {briefing.accessSummary.length ? (
          <Text style={styles.profileRowHint} numberOfLines={1}>
            Launch packet: {briefing.accessSummary.join(" - ")}
          </Text>
        ) : (
          <Text style={styles.profileRowHint} numberOfLines={1}>
            Launch packet: no tools or folder grants
          </Text>
        )}
        {briefing.warnings.length ? (
          <View style={styles.profileWarnings}>
            {briefing.warnings.map((warning) => (
              <Text key={warning} style={styles.profileWarningText} numberOfLines={1}>
                {warning}
              </Text>
            ))}
          </View>
        ) : null}
      </Pressable>
      <View style={styles.profileRowActions}>
        <Button variant="ghost" size="xs" onPress={handleUse}>
          Use
        </Button>
        <Button variant="ghost" size="xs" onPress={handleDelete}>
          Delete
        </Button>
      </View>
    </View>
  );
}

function ProfileInput({
  field,
  label,
  value,
  placeholder,
  onChangeField,
  options,
  multi,
}: {
  field: ProfileFormKey;
  label: string;
  value: string;
  placeholder: string;
  onChangeField: (field: ProfileFormKey, value: string) => void;
  options?: ProfileSelectOption[];
  multi?: boolean;
}) {
  const handleChangeText = useCallback(
    (nextValue: string) => onChangeField(field, nextValue),
    [field, onChangeField],
  );
  const handleClear = useCallback(() => onChangeField(field, ""), [field, onChangeField]);
  const selectedValues = useMemo(
    () =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [value],
  );
  const handleSelectOption = useCallback(
    (optionValue: string) => {
      if (!multi) {
        onChangeField(field, optionValue);
        return;
      }
      const nextValues = selectedValues.includes(optionValue)
        ? selectedValues.filter((item) => item !== optionValue)
        : [...selectedValues, optionValue];
      onChangeField(field, nextValues.join(", "));
    },
    [field, multi, onChangeField, selectedValues],
  );
  const displayValue = useMemo(() => {
    if (!value.trim()) {
      return placeholder;
    }
    if (!options?.length) {
      return value;
    }
    if (multi) {
      return selectedValues
        .map((selected) => options.find((option) => option.value === selected)?.label ?? selected)
        .join(", ");
    }
    return options.find((option) => option.value === value)?.label ?? value;
  }, [multi, options, placeholder, selectedValues, value]);

  if (options) {
    return (
      <View style={styles.profileField}>
        <Text style={styles.profileFieldLabel}>{label}</Text>
        <DropdownMenu>
          <DropdownMenuTrigger style={profileSelectTriggerStyle}>
            <Text
              style={value.trim() ? styles.profileSelectText : styles.profileSelectPlaceholder}
              numberOfLines={1}
            >
              {displayValue}
            </Text>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" minWidth={220}>
            {options.length > 0 ? (
              options.map((option) => (
                <ProfileOptionItem
                  key={option.value}
                  option={option}
                  selected={multi ? selectedValues.includes(option.value) : option.value === value}
                  closeOnSelect={!multi}
                  onSelect={handleSelectOption}
                />
              ))
            ) : (
              <DropdownMenuItem disabled>{placeholder}</DropdownMenuItem>
            )}
            {value.trim() ? (
              <DropdownMenuItem muted onSelect={handleClear}>
                Clear
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
    );
  }

  return (
    <View style={styles.profileField}>
      <Text style={styles.profileFieldLabel}>{label}</Text>
      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        onChangeText={handleChangeText}
        style={styles.profileInput}
        autoCapitalize="none"
      />
    </View>
  );
}

function ProfileOptionItem({
  option,
  selected,
  closeOnSelect,
  onSelect,
}: {
  option: ProfileSelectOption;
  selected: boolean;
  closeOnSelect: boolean;
  onSelect: (value: string) => void;
}) {
  const handleSelect = useCallback(() => onSelect(option.value), [onSelect, option.value]);
  return (
    <DropdownMenuItem
      selected={selected}
      showSelectedCheck
      closeOnSelect={closeOnSelect}
      onSelect={handleSelect}
    >
      {option.label}
    </DropdownMenuItem>
  );
}

function profileToForm(profile: ProjectAgentProfile): ProfileForm {
  return {
    id: profile.id,
    name: profile.name,
    provider: profile.provider ?? "",
    model: profile.model ?? "",
    prompt: profile.prompt ?? "",
    defaultTools: profile.defaultTools.join(", "),
  };
}

function formToProfile(form: ProfileForm): ProjectAgentProfile | null {
  const id = form.id.trim();
  const name = form.name.trim();
  if (!id || !name) {
    return null;
  }
  const prompt = form.prompt.trim();
  return {
    schemaVersion: 1,
    id,
    name,
    provider: emptyToNull(form.provider),
    model: emptyToNull(form.model),
    prompt: prompt.length > 0 ? prompt : null,
    defaultTools: form.defaultTools
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean),
    folderGrants: [],
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: theme.colors.surface0,
  },
  contentContainer: {
    flex: 1,
  },
  streamContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  configScrollContent: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[6],
  },
  configSection: {
    gap: theme.spacing[3],
  },
  profilePanel: {
    gap: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  profileHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  profileTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  profileHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  profileMuted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  profileList: {
    gap: theme.spacing[2],
  },
  profileRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  profileRowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  profileRowTitle: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  profileRowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  profileRowHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  profileWarnings: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  profileWarningText: {
    color: theme.colors.palette.amber[500],
    fontSize: theme.fontSize.xs,
  },
  profileRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  profileEditor: {
    gap: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing[3],
  },
  profileEditorHeader: {
    gap: 2,
  },
  profileEditorTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  profilePath: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  profileFormGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  profileField: {
    minWidth: 180,
    flexBasis: {
      xs: "100%",
      md: "31%",
    },
    flexGrow: 1,
    gap: theme.spacing[1],
  },
  profileFieldLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textTransform: "uppercase",
  },
  profileInput: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  profileSelectTrigger: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  profileSelectTriggerActive: {
    backgroundColor: theme.colors.surface2,
  },
  profileSelectText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  profileSelectPlaceholder: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  profileActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  inputAreaWrapper: {
    width: "100%",
    backgroundColor: theme.colors.surface0,
  },
  importPillRow: {
    width: "100%",
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    alignItems: "center",
  },
  importPillContent: {
    width: "100%",
    flexDirection: "row",
  },
  errorContainer: {
    marginTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.destructive,
  },
  errorText: {
    color: theme.colors.destructive,
  },
}));
