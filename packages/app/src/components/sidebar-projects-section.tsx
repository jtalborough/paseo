import { type ReactElement, useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ChevronDown, ChevronRight, FolderPlus } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import {
  groupSidebarProjects,
  type SidebarGroupEntry,
} from "@/hooks/sidebar-workspaces-view-model";
import { useProjectGroups } from "@/hooks/use-project-groups";
import {
  SidebarWorkspaceList,
  type SidebarWorkspaceListProps,
} from "@/components/sidebar-workspace-list";

// COMPAT(projectGroups): orchestrates the Project (group) → Folder → Workspace
// sidebar tree. When the daemon advertises projectGroups and at least one group
// exists, renders collapsible group sections (each a non-draggable
// SidebarWorkspaceList) plus an ungrouped section, under a single outer scroll.
// Otherwise falls back to the flat, fully-draggable list — identical to before.
// "Project" = the group; "Folder" = a repo/dir row (Option A naming).

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedFolderPlus = withUnistyles(FolderPlus);

export function SidebarProjectsSection(props: SidebarWorkspaceListProps) {
  const { groups, supported, createGroup } = useProjectGroups(props.serverId);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<string>>(() => new Set());
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const toggleGroupCollapsed = useCallback((groupId: string) => {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const grouped = useMemo(
    () => groupSidebarProjects({ projects: props.projects, groups }),
    [props.projects, groups],
  );

  const handleStartAddGroup = useCallback(() => setIsAddingGroup(true), []);

  const submitNewGroup = useCallback(async () => {
    const name = newGroupName.trim();
    setNewGroupName("");
    setIsAddingGroup(false);
    if (name.length === 0) {
      return;
    }
    await createGroup({ displayName: name });
  }, [newGroupName, createGroup]);

  // Capability off entirely → unchanged flat list, no grouping affordances.
  if (!supported) {
    return <SidebarWorkspaceList {...props} />;
  }

  const createAffordance = isAddingGroup ? (
    <View style={styles.addGroupRow}>
      <TextInput
        style={styles.addGroupInput}
        value={newGroupName}
        onChangeText={setNewGroupName}
        placeholder="Project name"
        autoFocus
        onSubmitEditing={submitNewGroup}
        onBlur={submitNewGroup}
        returnKeyType="done"
        testID="sidebar-new-group-input"
      />
    </View>
  ) : (
    <Pressable
      style={styles.newGroupButton}
      onPress={handleStartAddGroup}
      testID="sidebar-new-group-button"
    >
      <ThemedFolderPlus size={16} uniProps={mutedColorMapping} />
      <Text style={styles.newGroupLabel}>New Project</Text>
    </Pressable>
  );

  // Supported but no groups yet → keep the full flat, draggable list and surface
  // the create affordance as its footer (otherwise the first group is unreachable).
  if (groups.length === 0) {
    return (
      <SidebarWorkspaceList
        {...props}
        listFooterComponent={
          <>
            {createAffordance}
            {props.listFooterComponent}
          </>
        }
      />
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      testID="sidebar-projects-section-scroll"
    >
      {grouped.ungrouped.length > 0 ? (
        <SidebarWorkspaceList
          {...props}
          projects={grouped.ungrouped}
          disableProjectReorder
          hideEmptyState
          scrollable={false}
          listFooterComponent={null}
        />
      ) : null}

      {grouped.groups.map((group) => (
        <GroupSection
          key={group.groupId}
          group={group}
          collapsed={collapsedGroupIds.has(group.groupId)}
          onToggle={toggleGroupCollapsed}
          listProps={props}
        />
      ))}

      {createAffordance}

      {props.listFooterComponent}
    </ScrollView>
  );
}

function GroupSection({
  group,
  collapsed,
  onToggle,
  listProps,
}: {
  group: SidebarGroupEntry;
  collapsed: boolean;
  onToggle: (groupId: string) => void;
  listProps: SidebarWorkspaceListProps;
}) {
  const handlePress = useCallback(() => onToggle(group.groupId), [onToggle, group.groupId]);
  const colorDotStyle = useMemo(
    () => [styles.groupColorDot, { backgroundColor: group.color ?? "transparent" }],
    [group.color],
  );

  let body: ReactElement | null = null;
  if (!collapsed) {
    body =
      group.projects.length > 0 ? (
        <SidebarWorkspaceList
          {...listProps}
          projects={group.projects}
          disableProjectReorder
          hideEmptyState
          scrollable={false}
          listFooterComponent={null}
        />
      ) : (
        <Text style={styles.groupEmpty}>No folders yet</Text>
      );
  }

  return (
    <View style={styles.groupSection}>
      <Pressable
        style={styles.groupHeader}
        onPress={handlePress}
        testID={`sidebar-group-header-${group.groupId}`}
      >
        {collapsed ? (
          <ThemedChevronRight size={14} uniProps={mutedColorMapping} />
        ) : (
          <ThemedChevronDown size={14} uniProps={mutedColorMapping} />
        )}
        {group.color ? <View style={colorDotStyle} /> : null}
        <Text style={styles.groupName} numberOfLines={1}>
          {group.displayName}
        </Text>
        <Text style={styles.groupCount}>{group.projects.length}</Text>
      </Pressable>

      {body}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing[4],
  },
  groupSection: {
    marginTop: theme.spacing[1],
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    gap: theme.spacing[1],
  },
  groupColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  groupName: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  groupCount: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  groupEmpty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  newGroupButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  newGroupLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  addGroupRow: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  addGroupInput: {
    color: theme.colors.foreground,
    backgroundColor: theme.colors.muted,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    fontSize: theme.fontSize.sm,
  },
}));
