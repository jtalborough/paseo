import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { ProjectContextPacketEntry } from "@getpaseo/client/internal/daemon-client";
import { StyleSheet } from "react-native-unistyles";
import { ProjectSurfaceHeader } from "@/components/project-surface-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { useProjectGroups } from "@/hooks/use-project-groups";
import { useHostProjects, type HostProjectListItem } from "@/projects/host-projects";
import {
  buildPacketLaunchBriefing,
  formatFolderGrantDisplay,
} from "@/projects/project-launch-briefing";
import { useSessionStore } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";

interface ProjectContextScreenProps {
  serverId: string;
  groupId: string;
  embedded?: boolean;
  selectedPacketPath?: string | null;
}

export function ProjectContextScreen({
  serverId,
  groupId,
  embedded = false,
  selectedPacketPath = null,
}: ProjectContextScreenProps) {
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const { groups, supported } = useProjectGroups(serverId);
  const folders = useHostProjects(serverId);
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
                <ContextPacketCard
                  key={entry.path}
                  entry={entry}
                  folders={folders}
                  selected={entry.path === selectedPacketPath}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function ContextPacketCard({
  entry,
  folders,
  selected,
}: {
  entry: ProjectContextPacketEntry;
  folders: HostProjectListItem[];
  selected: boolean;
}) {
  const packet = entry.packet;
  const briefing = useMemo(
    () => buildPacketLaunchBriefing({ packet, path: entry.path }),
    [entry.path, packet],
  );
  const packetCardStyle = useMemo(
    () => [styles.packetCard, selected ? styles.packetCardSelected : null],
    [selected],
  );

  return (
    <View style={packetCardStyle}>
      <View style={styles.packetHeader}>
        <View style={styles.packetTitleBlock}>
          <View style={styles.packetTitleRow}>
            <Text style={styles.packetTitle} numberOfLines={1}>
              {briefing.title}
            </Text>
            <StatusBadge label={briefing.readinessLabel} variant={briefing.badgeVariant} />
          </View>
          <Text style={styles.packetPath}>{entry.path}</Text>
        </View>
        <Text style={styles.packetDate}>{formatDate(packet.createdAt)}</Text>
      </View>
      {briefing.warnings.length ? (
        <View style={styles.packetWarnings}>
          {briefing.warnings.map((warning) => (
            <Text key={warning} style={styles.packetWarningText}>
              {warning}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.metaGrid}>
        {briefing.items.map((item) => (
          <Meta key={item.label} label={item.label} value={item.value} />
        ))}
      </View>
      {packet.tools.length ? (
        <Text style={styles.summary}>Tools: {packet.tools.join(", ")}</Text>
      ) : null}
      {briefing.accessSummary.length ? (
        <Text style={styles.summary}>{briefing.accessSummary.join(" - ")}</Text>
      ) : null}
      {packet.folderGrants.length ? (
        <View style={styles.grants}>
          {packet.folderGrants.map((grant) => {
            const display = formatFolderGrantDisplay({ grant, folders });
            return (
              <View key={`${grant.projectId}:${grant.path}:${grant.mode}`} style={styles.grantRow}>
                <Text style={styles.grantTitle} numberOfLines={1}>
                  {display.title}
                </Text>
                <Text style={styles.grantDetail} numberOfLines={1}>
                  {display.detail}
                </Text>
              </View>
            );
          })}
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
  packetCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface1,
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
  packetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  packetTitle: {
    flexShrink: 1,
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
  packetWarnings: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  packetWarningText: {
    color: theme.colors.palette.amber[500],
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
  grantRow: {
    gap: 2,
  },
  grantTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  grantDetail: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
