import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { StyleSheet } from "react-native-unistyles";
import { Composer } from "@/composer";
import { splitComposerAttachmentsForSubmit } from "@/composer/attachments/submit";
import { useAgentInputDraft } from "@/composer/draft/input-draft";
import type { MessagePayload } from "@/composer/types";
import { BackHeader } from "@/components/headers/back-header";
import { MenuHeader } from "@/components/headers/menu-header";
import { useProjectGroups } from "@/hooks/use-project-groups";
import { useHostProjects } from "@/projects/host-projects";
import { buildProjectAgentProfileLaunchLabels } from "@/projects/project-agent-launch-labels";
import { resolveProjectLaunchTarget } from "@/projects/project-launch-target";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { encodeImages } from "@/utils/encode-images";
import { generateMessageId } from "@/types/stream";
import { normalizeAgentSnapshot } from "@/utils/agent-snapshots";
import { buildHostAgentDetailRoute, buildHostProjectRoute } from "@/utils/host-routes";
import { applyProjectAgentProfileToDraft } from "@/screens/new-project-agent-screen-core";

interface NewProjectAgentScreenProps {
  serverId: string;
  groupId: string;
  profilePath?: string | null;
}

export function NewProjectAgentScreen({
  serverId,
  groupId,
  profilePath = null,
}: NewProjectAgentScreenProps) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { groups, supported } = useProjectGroups(serverId);
  const projects = useHostProjects(serverId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileLaunchLabels, setProfileLaunchLabels] = useState<Record<string, string> | null>(
    null,
  );
  const queryClient = useQueryClient();
  const group = useMemo(
    () => groups.find((candidate) => candidate.groupId === groupId) ?? null,
    [groupId, groups],
  );
  const folders = useMemo(
    () => projects.filter((project) => project.projectGroupId === groupId),
    [projects, groupId],
  );
  const launchTarget = useMemo(
    () => (group ? resolveProjectLaunchTarget({ group, folders }) : null),
    [group, folders],
  );
  const cwd = launchTarget?.cwd ?? "";
  const projectDirectory = group?.cwd ?? null;
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
  const appliedProfileKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!client || !composerState || !projectDirectory || !profilePath) {
      return;
    }
    const applyKey = `${groupId}:${profilePath}`;
    if (appliedProfileKeyRef.current === applyKey) {
      return;
    }
    appliedProfileKeyRef.current = applyKey;
    let cancelled = false;
    const applyProfile = async () => {
      try {
        const packet = await applyProjectAgentProfileToDraft({
          client,
          composerState,
          projectGroupId: groupId,
          projectDirectory,
          profilePath,
          setText: (text) => {
            if (!cancelled) {
              draft.setText(text);
            }
          },
        });
        if (!cancelled) {
          setProfileLaunchLabels(
            buildProjectAgentProfileLaunchLabels({
              projectGroupId: groupId,
              profilePath,
              contextPacketPath: packet.path,
            }),
          );
          void queryClient.invalidateQueries({
            queryKey: ["project-context-packets", serverId, groupId],
          });
        }
      } catch (profileError) {
        if (!cancelled) {
          setError(profileError instanceof Error ? profileError.message : String(profileError));
          appliedProfileKeyRef.current = null;
        }
      }
    };
    void applyProfile();
    return () => {
      cancelled = true;
    };
  }, [client, composerState, draft, groupId, profilePath, projectDirectory, queryClient, serverId]);

  const handleBack = useCallback(() => {
    router.replace(buildHostProjectRoute(serverId, groupId));
  }, [groupId, serverId]);

  const handleSubmit = useCallback(
    async (payload: MessagePayload) => {
      if (!client || !isConnected || !group || !cwd || !composerState) {
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
          cwd,
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
          ...(profileLaunchLabels && Object.keys(profileLaunchLabels).length > 0
            ? { labels: profileLaunchLabels }
            : {}),
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
    [client, composerState, cwd, draft, group, isConnected, profileLaunchLabels, serverId],
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
        {launchTarget ? (
          <Text style={styles.launchTargetText} numberOfLines={1}>
            Launching in {launchTarget.label}
          </Text>
        ) : null}
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
  launchTargetText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
