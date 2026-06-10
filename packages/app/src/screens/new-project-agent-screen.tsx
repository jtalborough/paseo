import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { Composer } from "@/composer";
import { splitComposerAttachmentsForSubmit } from "@/composer/attachments/submit";
import { useAgentInputDraft } from "@/composer/draft/input-draft";
import type { MessagePayload } from "@/composer/types";
import { BackHeader } from "@/components/headers/back-header";
import { MenuHeader } from "@/components/headers/menu-header";
import { useProjectGroups } from "@/hooks/use-project-groups";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { encodeImages } from "@/utils/encode-images";
import { generateMessageId } from "@/types/stream";
import { normalizeAgentSnapshot } from "@/utils/agent-snapshots";
import { buildHostAgentDetailRoute, buildHostProjectRoute } from "@/utils/host-routes";

interface NewProjectAgentScreenProps {
  serverId: string;
  groupId: string;
}

export function NewProjectAgentScreen({ serverId, groupId }: NewProjectAgentScreenProps) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { groups, supported } = useProjectGroups(serverId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const group = useMemo(
    () => groups.find((candidate) => candidate.groupId === groupId) ?? null,
    [groupId, groups],
  );
  const cwd = group?.cwd ?? "";
  const draft = useAgentInputDraft({
    draftKey: `new-project-agent:${serverId}:${groupId}`,
    composer: {
      initialServerId: serverId || null,
      initialValues: cwd ? { workingDir: cwd } : undefined,
      isVisible: true,
      onlineServerIds: isConnected && serverId ? [serverId] : [],
      lockedWorkingDir: cwd || undefined,
    },
  });
  const composerState = draft.composerState;
  const agentControls = useMemo(
    () => (composerState ? { ...composerState.agentControls, disabled: isSubmitting } : undefined),
    [composerState, isSubmitting],
  );

  const handleBack = useCallback(() => {
    router.replace(buildHostProjectRoute(serverId, groupId));
  }, [groupId, serverId]);

  const handleSubmit = useCallback(
    async (payload: MessagePayload) => {
      if (!client || !isConnected || !group?.cwd || !composerState) {
        return;
      }
      const provider = composerState.selectedProvider;
      if (!provider) {
        setError("Select a model");
        return;
      }

      setIsSubmitting(true);
      setError(null);
      try {
        const wirePayload = splitComposerAttachmentsForSubmit(payload.attachments);
        const images = await encodeImages(wirePayload.images);
        const result = await client.createAgent({
          provider,
          cwd: group.cwd,
          projectGroupId: group.groupId,
          initialPrompt: payload.text,
          clientMessageId: generateMessageId(),
          ...(composerState.modeOptions.length > 0 && composerState.selectedMode
            ? { modeId: composerState.selectedMode }
            : {}),
          ...(composerState.effectiveModelId ? { model: composerState.effectiveModelId } : {}),
          ...(composerState.effectiveThinkingOptionId
            ? { thinkingOptionId: composerState.effectiveThinkingOptionId }
            : {}),
          ...(composerState.featureValues ? { featureValues: composerState.featureValues } : {}),
          ...(images && images.length > 0 ? { images } : {}),
          ...(wirePayload.attachments.length > 0 ? { attachments: wirePayload.attachments } : {}),
        });
        const normalized = normalizeAgentSnapshot(result, serverId);
        useSessionStore.getState().setAgents(serverId, (previous) => {
          const next = new Map(previous);
          next.set(normalized.id, normalized);
          return next;
        });
        draft.clear("sent");
        router.replace(buildHostAgentDetailRoute(serverId, result.id));
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : String(submitError));
        setIsSubmitting(false);
      }
    },
    [client, composerState, draft, group, isConnected, serverId],
  );

  const handleClear = useCallback(() => {
    draft.clear("sent");
  }, [draft]);

  if (!supported || !group) {
    return (
      <View style={styles.container}>
        <MenuHeader title="New Project agent" />
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {supported ? "Project not found" : "Update the host to use Projects"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackHeader title={`New agent - ${group.displayName}`} onBack={handleBack} />
      <View style={styles.centered}>
        <Composer
          agentId={`new-project-agent:${groupId}`}
          serverId={serverId}
          isPaneFocused={true}
          onSubmitMessage={handleSubmit}
          submitButtonAccessibilityLabel="Create agent"
          submitIcon="return"
          isSubmitLoading={isSubmitting}
          submitBehavior="preserve-and-lock"
          value={draft.text}
          onChangeText={draft.setText}
          attachments={draft.attachments}
          onChangeAttachments={draft.setAttachments}
          cwd={cwd}
          clearDraft={handleClear}
          autoFocus
          commandDraftConfig={composerState?.commandDraftConfig}
          agentControls={agentControls}
          fullWidth
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  centered: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
