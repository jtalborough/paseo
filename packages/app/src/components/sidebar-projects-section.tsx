import { type ReactElement, useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ChevronDown, ChevronRight, FolderPlus, Plus } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import {
  groupSidebarProjects,
  type SidebarGroupEntry,
} from "@/hooks/sidebar-workspaces-view-model";
import { useProjectGroups } from "@/hooks/use-project-groups";
import { deriveProjectIconColor, PROJECT_ICON_COLORS } from "@/utils/project-icon-color";
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
const ThemedPlus = withUnistyles(Plus);

export function SidebarProjectsSection(props: SidebarWorkspaceListProps) {
  const { groups, supported, createGroup, updateGroup, canAddFromDisk, addFolderFromDisk } =
    useProjectGroups(props.serverId);

  const handleSetColor = useCallback(
    (groupId: string, color: string) => {
      void updateGroup({ groupId, color });
    },
    [updateGroup],
  );
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
          canAddFromDisk={canAddFromDisk}
          onAddFromDisk={addFolderFromDisk}
          onSetColor={handleSetColor}
        />
      ))}

      {createAffordance}

      {props.listFooterComponent}
    </ScrollView>
  );
}

// Project icon — mirrors the folder icon (colored rounded square + white initial,
// `project-icon-view`). Honors the group's `color` field when set, else derives a
// stable distinct color from the groupId so every Project is visually distinct.
function ProjectGroupIcon({ group }: { group: SidebarGroupEntry }) {
  const initial = (group.displayName.trim()[0] ?? "?").toUpperCase();
  const fillStyle = useMemo(
    () => [
      styles.projectIconFill,
      { backgroundColor: group.color ?? deriveProjectIconColor(group.groupId) },
    ],
    [group.color, group.groupId],
  );
  return (
    <View style={styles.projectIconSlot}>
      <View style={fillStyle}>
        <Text style={styles.projectIconText}>{initial}</Text>
      </View>
    </View>
  );
}

function ColorSwatch({ color, onPick }: { color: string; onPick: (color: string) => void }) {
  const handlePress = useCallback(() => onPick(color), [onPick, color]);
  const swatchStyle = useMemo(() => [styles.colorSwatch, { backgroundColor: color }], [color]);
  return (
    <Pressable style={swatchStyle} onPress={handlePress} accessibilityLabel={`Color ${color}`} />
  );
}

function GroupSection({
  group,
  collapsed,
  onToggle,
  listProps,
  canAddFromDisk,
  onAddFromDisk,
  onSetColor,
}: {
  group: SidebarGroupEntry;
  collapsed: boolean;
  onToggle: (groupId: string) => void;
  listProps: SidebarWorkspaceListProps;
  canAddFromDisk: boolean;
  onAddFromDisk: (groupId: string | null) => Promise<void>;
  onSetColor: (groupId: string, color: string) => void;
}) {
  const [isColorPicking, setIsColorPicking] = useState(false);
  const handlePress = useCallback(() => onToggle(group.groupId), [onToggle, group.groupId]);
  // "+" is a direct disk picker: add ANY folder (git or non-git) into this Project
  // in one step. (Assigning already-registered folders is intentionally not offered.)
  const handleAddFromDisk = useCallback(() => {
    void onAddFromDisk(group.groupId);
  }, [onAddFromDisk, group.groupId]);
  // Tap the Project icon to recolor it (the Project's "icon").
  const handleToggleColorPicker = useCallback(() => setIsColorPicking((current) => !current), []);
  const handlePickColor = useCallback(
    (color: string) => {
      setIsColorPicking(false);
      onSetColor(group.groupId, color);
    },
    [onSetColor, group.groupId],
  );

  let body: ReactElement | null = null;
  if (!collapsed) {
    body =
      group.projects.length > 0 ? (
        // Indent folders so they read as members of the Project above them.
        <View style={styles.groupFolders}>
          <SidebarWorkspaceList
            {...listProps}
            projects={group.projects}
            disableProjectReorder
            hideEmptyState
            scrollable={false}
            listFooterComponent={null}
          />
        </View>
      ) : (
        <Text style={styles.groupEmpty}>No folders yet</Text>
      );
  }

  return (
    <View style={styles.groupSection}>
      <View style={styles.groupHeader}>
        <Pressable
          style={styles.groupChevronButton}
          onPress={handlePress}
          hitSlop={6}
          testID={`sidebar-group-header-${group.groupId}`}
        >
          {collapsed ? (
            <ThemedChevronRight size={14} uniProps={mutedColorMapping} />
          ) : (
            <ThemedChevronDown size={14} uniProps={mutedColorMapping} />
          )}
        </Pressable>
        <Pressable
          onPress={handleToggleColorPicker}
          hitSlop={6}
          accessibilityLabel="Set Project color"
          testID={`sidebar-group-icon-${group.groupId}`}
        >
          <ProjectGroupIcon group={group} />
        </Pressable>
        <Pressable style={styles.groupHeaderMain} onPress={handlePress}>
          <Text style={styles.groupName} numberOfLines={1}>
            {group.displayName}
          </Text>
          <Text style={styles.groupCount}>{group.projects.length}</Text>
        </Pressable>
        {canAddFromDisk ? (
          <Pressable
            style={styles.groupAddButton}
            onPress={handleAddFromDisk}
            hitSlop={8}
            accessibilityLabel="Add folder from disk"
            testID={`sidebar-group-add-${group.groupId}`}
          >
            <ThemedPlus size={14} uniProps={mutedColorMapping} />
          </Pressable>
        ) : null}
      </View>

      {isColorPicking ? (
        <View style={styles.colorPickerRow}>
          {PROJECT_ICON_COLORS.map((color) => (
            <ColorSwatch key={color} color={color} onPick={handlePickColor} />
          ))}
        </View>
      ) : null}

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
  groupFolders: {
    // Indent member folders so the Project → Folder hierarchy reads visually.
    paddingLeft: theme.spacing[3],
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[2],
  },
  groupChevronButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  groupHeaderMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing[1],
    gap: theme.spacing[1],
  },
  colorPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1],
    paddingLeft: theme.spacing[3],
    paddingRight: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  colorSwatch: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.sm,
  },
  groupAddButton: {
    padding: theme.spacing[1],
  },
  projectIconSlot: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  projectIconFill: {
    width: "100%",
    height: "100%",
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  projectIconText: {
    fontSize: 9,
    color: "#ffffff",
    fontWeight: "600",
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
