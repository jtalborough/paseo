import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { ProjectContextPacketEntry } from "@getpaseo/client/internal/daemon-client";
import { StyleSheet } from "react-native-unistyles";
import { ProjectSurfaceHeader } from "@/components/project-surface-header";
import { useProjectGroups } from "@/hooks/use-project-groups";
import { useSessionStore } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";

interface ProjectContextScreenProps {
  serverId: string;
  groupId: string;
  embedded?: boolean;
}

export function ProjectContextScreen({
  serverId,
  groupId,
  embedded = false,
}: ProjectContextScreenProps) {
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const { groups, supported } = useProjectGroups(serverId);
  const group = useMemo(
    () => groups.find((candidate) => candidate.groupId === groupId) ?? null,
    [groupId, groups],
  );
  const query = useQuery({
    queryKey: ["project-context-packets", serverId, groupId],
    enabled: Boolean(client && group),
    queryFn: async () => (client ? client.projectContextPacketList(groupId) : []),
    staleTime: 2_000,
  });
  const packets = useMemo(
    () => [...(query.data ?? [])].sort(comparePacketEntriesDesc),
    [query.data],
  );

  if (!supported) {
    return (
      <View style={styles.container}>
        {embedded ? null : <ProjectSurfaceHeader title="Context" />}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Update the host to use Projects</Text>
        </View>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.container}>
        {embedded ? null : <ProjectSurfaceHeader title="Context" />}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Project not found</Text>
        </View>
      </View>
    );
  }

  if (query.isError) {
    return (
      <View style={styles.container}>
        {embedded ? null : <ProjectSurfaceHeader title="Context" />}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Update the host to view Project context packets</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {embedded ? null : <ProjectSurfaceHeader title="Context" />}
      <ScrollView style={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.headerBlock}>
            <Text style={settingsStyles.sectionHeaderTitle}>Context packets</Text>
            <Text style={styles.hint}>
              Review the launch bundles that explain what each agent was handed.
            </Text>
          </View>

          {packets.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No context packets yet</Text>
              <Text style={styles.emptyDescription}>
                Run a Project task or create a packet from an agent to start the audit trail.
              </Text>
            </View>
          ) : (
            <View style={styles.packetList}>
              {packets.map((entry) => (
                <ContextPacketCard key={entry.path} entry={entry} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function ContextPacketCard({ entry }: { entry: ProjectContextPacketEntry }) {
  const packet = entry.packet;
  const counts = [
    packet.files.length
      ? `${packet.files.length} file${packet.files.length === 1 ? "" : "s"}`
      : null,
    packet.notes.length
      ? `${packet.notes.length} note${packet.notes.length === 1 ? "" : "s"}`
      : null,
    packet.folderGrants.length
      ? `${packet.folderGrants.length} folder grant${packet.folderGrants.length === 1 ? "" : "s"}`
      : null,
    packet.browser.length
      ? `${packet.browser.length} browser state${packet.browser.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return (
    <View style={styles.packetCard}>
      <View style={styles.packetHeader}>
        <View style={styles.packetTitleBlock}>
          <Text style={styles.packetTitle}>{packet.launchReason ?? packet.id}</Text>
          <Text style={styles.packetPath}>{entry.path}</Text>
        </View>
        <Text style={styles.packetDate}>{formatDate(packet.createdAt)}</Text>
      </View>
      <View style={styles.metaGrid}>
        <Meta label="Task" value={packet.task} />
        <Meta label="Prompt" value={packet.prompt} />
        <Meta label="Created by" value={packet.createdByAgentId} />
        <Meta label="Agent" value={packet.launchedAgentId} />
      </View>
      {counts.length ? <Text style={styles.summary}>{counts.join(" · ")}</Text> : null}
      {packet.folderGrants.length ? (
        <View style={styles.grants}>
          {packet.folderGrants.map((grant) => (
            <Text key={`${grant.projectId}:${grant.path}:${grant.mode}`} style={styles.grant}>
              {grant.mode} {grant.projectId}:{grant.path}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return null;
  }
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function comparePacketEntriesDesc(
  left: ProjectContextPacketEntry,
  right: ProjectContextPacketEntry,
): number {
  return (
    (right.packet.createdAt ?? "").localeCompare(left.packet.createdAt ?? "") ||
    right.path.localeCompare(left.path)
  );
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: theme.spacing[6],
    padding: theme.spacing[6],
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[8],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  headerBlock: {
    gap: theme.spacing[1],
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  emptyCard: {
    gap: theme.spacing[1],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[6],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: "600",
  },
  emptyDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  packetList: {
    gap: theme.spacing[4],
  },
  packetCard: {
    gap: theme.spacing[4],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[4],
  },
  packetHeader: {
    flexDirection: "row",
    gap: theme.spacing[4],
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  packetTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  packetTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: "600",
  },
  packetPath: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  packetDate: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  metaItem: {
    minWidth: 160,
    maxWidth: 280,
    gap: 2,
  },
  metaLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textTransform: "uppercase",
  },
  metaValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  summary: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  grants: {
    gap: theme.spacing[1],
  },
  grant: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
