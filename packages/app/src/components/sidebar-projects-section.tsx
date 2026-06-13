import { type ReactElement, useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router, usePathname } from "expo-router";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { ProjectFolderPickerModal } from "@/components/project-folder-picker-modal";
import type { Theme } from "@/styles/theme";
import {
  groupSidebarProjects,
  type SidebarGroupEntry,
} from "@/hooks/sidebar-workspaces-view-model";
import { useProjectGroups } from "@/hooks/use-project-groups";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { DraggableList, type DraggableRenderItemInfo } from "@/components/draggable-list";
import { deriveProjectIconColor, PROJECT_ICON_COLORS } from "@/utils/project-icon-color";
import {
  buildHostOpenProjectRoute,
  buildHostProjectRoute,
  buildHostProjectTasksRoute,
} from "@/utils/host-routes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/contexts/toast-context";
import { confirmDialog } from "@/utils/confirm-dialog";
import { isNative } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import {
  FolderGlyphIconContext,
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
const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedPencil = withUnistyles(Pencil);
const ThemedPlus = withUnistyles(Plus);
const ThemedTrash2 = withUnistyles(Trash2);
const projectGroupKeyExtractor = (group: SidebarGroupEntry) => group.groupId;
const pencilLeadingIcon = <ThemedPencil size={16} uniProps={mutedColorMapping} />;
const trashLeadingIcon = <ThemedTrash2 size={16} uniProps={mutedColorMapping} />;

export function SidebarProjectsSection(props: SidebarWorkspaceListProps) {
  const pathname = usePathname();
  const toast = useToast();
  const {
    groups,
    supported,
    createGroup,
    updateGroup,
    reorderGroups,
    deleteGroup,
    canAddFromDisk,
    addFolderFromDisk,
    addFolderPath,
  } = useProjectGroups(props.serverId);
  const isLocalDaemon = useIsLocalDaemon(props.serverId ?? "");

  const handleSetColor = useCallback(
    (groupId: string, color: string) => {
      void updateGroup({ groupId, color });
    },
    [updateGroup],
  );

  const serverId = props.serverId;
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<string>>(() => new Set());
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [folderPickerGroupId, setFolderPickerGroupId] = useState<string | null>(null);

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

  const handleGroupDragEnd = useCallback(
    (nextGroups: SidebarGroupEntry[]) => {
      void reorderGroups(nextGroups.map((group) => group.groupId)).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to reorder Projects");
      });
    },
    [reorderGroups, toast],
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

  const handleDeleteGroup = useCallback(
    async (group: SidebarGroupEntry) => {
      const confirmed = await confirmDialog({
        title: "Remove Project?",
        message: `Archive "${group.displayName}" and remove it from the sidebar?\n\nChild folders will not be deleted. They will become ungrouped.`,
        confirmLabel: "Remove",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
      setDeletingGroupId(group.groupId);
      try {
        await deleteGroup(group.groupId);
        const projectRoute = buildHostProjectRoute(serverId ?? "", group.groupId);
        const isDeletedProjectOpen =
          pathname === projectRoute || pathname.startsWith(`${projectRoute}/`);
        if (isDeletedProjectOpen && serverId) {
          router.navigate(buildHostOpenProjectRoute(serverId));
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove Project");
      } finally {
        setDeletingGroupId(null);
      }
    },
    [deleteGroup, pathname, serverId, toast],
  );
  const renamingGroup = useMemo(
    () => grouped.groups.find((group) => group.groupId === renamingGroupId) ?? null,
    [grouped.groups, renamingGroupId],
  );
  const handleRenameGroup = useCallback((group: SidebarGroupEntry) => {
    setRenamingGroupId(group.groupId);
  }, []);
  const handleCloseRenameGroup = useCallback(() => setRenamingGroupId(null), []);
  const handleSubmitRenameGroup = useCallback(
    async (value: string) => {
      if (!renamingGroup) {
        return;
      }
      await updateGroup({ groupId: renamingGroup.groupId, displayName: value.trim() });
    },
    [renamingGroup, updateGroup],
  );
  const handleAddFolder = useCallback(
    async (groupId: string | null) => {
      if (isLocalDaemon && canAddFromDisk) {
        await addFolderFromDisk(groupId);
        return;
      }
      setFolderPickerGroupId(groupId);
    },
    [addFolderFromDisk, canAddFromDisk, isLocalDaemon],
  );
  const handleCloseFolderPicker = useCallback(() => setFolderPickerGroupId(null), []);
  const handleSelectFolderPath = useCallback(
    (path: string) => addFolderPath(path, folderPickerGroupId),
    [addFolderPath, folderPickerGroupId],
  );
  const validateRenameGroup = useCallback(
    (value: string): string | null => {
      const next = value.trim();
      if (next.length === 0) {
        return "Name is required";
      }
      const duplicate = groups.some(
        (group) =>
          group.groupId !== renamingGroupId &&
          group.displayName.trim().toLowerCase() === next.toLowerCase(),
      );
      return duplicate ? "A Project with this name already exists" : null;
    },
    [groups, renamingGroupId],
  );

  const createAffordance = useMemo(
    () =>
      isAddingGroup ? (
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
      ),
    [handleStartAddGroup, isAddingGroup, newGroupName, submitNewGroup],
  );

  const listHeader = useMemo(
    () =>
      grouped.ungrouped.length > 0 ? (
        <SidebarWorkspaceList
          {...props}
          projects={grouped.ungrouped}
          disableProjectReorder
          hideEmptyState
          scrollable={false}
          listFooterComponent={null}
        />
      ) : null,
    [grouped.ungrouped, props],
  );

  const listFooter = useMemo(
    () => (
      <>
        {createAffordance}
        {props.listFooterComponent}
      </>
    ),
    [createAffordance, props.listFooterComponent],
  );

  const renderGroup = useCallback(
    ({ item: group, drag, isActive }: DraggableRenderItemInfo<SidebarGroupEntry>) => (
      <GroupSection
        group={group}
        collapsed={collapsedGroupIds.has(group.groupId)}
        onToggle={toggleGroupCollapsed}
        listProps={props}
        canAddFromDisk={isLocalDaemon ? canAddFromDisk : true}
        onAddFromDisk={handleAddFolder}
        onSetColor={handleSetColor}
        onRename={handleRenameGroup}
        onDelete={handleDeleteGroup}
        deleteStatus={deletingGroupId === group.groupId ? "pending" : "idle"}
        pathname={pathname}
        serverId={serverId ?? ""}
        drag={drag}
        isDragging={isActive}
      />
    ),
    [
      canAddFromDisk,
      collapsedGroupIds,
      deletingGroupId,
      handleAddFolder,
      handleDeleteGroup,
      handleRenameGroup,
      handleSetColor,
      isLocalDaemon,
      pathname,
      props,
      serverId,
      toggleGroupCollapsed,
    ],
  );

  // Capability off entirely → unchanged flat list, no grouping affordances.
  if (!supported) {
    return <SidebarWorkspaceList {...props} />;
  }
  if (!serverId) {
    return <SidebarWorkspaceList {...props} />;
  }

  // Supported but no groups yet → keep the full flat, draggable list and surface
  // the create affordance as its footer (otherwise the first group is unreachable).
  if (groups.length === 0) {
    return <SidebarWorkspaceList {...props} listFooterComponent={listFooter} />;
  }

  return (
    // Folders inside the Projects tree render as plain folder glyphs (distinct from
    // the colored Project tiles); Projects keep their own ProjectGroupIcon.
    <FolderGlyphIconContext.Provider value={true}>
      <>
        <DraggableList
          data={grouped.groups}
          keyExtractor={projectGroupKeyExtractor}
          renderItem={renderGroup}
          onDragEnd={handleGroupDragEnd}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          testID="sidebar-projects-section-scroll"
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          nestable={isNative}
        />
        <AdaptiveRenameModal
          visible={Boolean(renamingGroup)}
          title="Rename Project"
          initialValue={renamingGroup?.displayName ?? ""}
          placeholder="Project name"
          submitLabel="Rename"
          validate={validateRenameGroup}
          onClose={handleCloseRenameGroup}
          onSubmit={handleSubmitRenameGroup}
          testID="sidebar-group-rename"
        />
        <ProjectFolderPickerModal
          visible={folderPickerGroupId !== null}
          serverId={serverId}
          title="Add folder to Project"
          onClose={handleCloseFolderPicker}
          onSelectPath={handleSelectFolderPath}
        />
      </>
    </FolderGlyphIconContext.Provider>
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
  onRename,
  onDelete,
  deleteStatus,
  pathname,
  serverId,
  drag,
  isDragging,
}: {
  group: SidebarGroupEntry;
  collapsed: boolean;
  onToggle: (groupId: string) => void;
  listProps: SidebarWorkspaceListProps;
  canAddFromDisk: boolean;
  onAddFromDisk: (groupId: string | null) => Promise<void>;
  onSetColor: (groupId: string, color: string) => void;
  onRename: (group: SidebarGroupEntry) => void;
  onDelete: (group: SidebarGroupEntry) => void;
  deleteStatus: "idle" | "pending";
  pathname: string;
  serverId: string;
  drag: () => void;
  isDragging: boolean;
}) {
  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const [isColorPicking, setIsColorPicking] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handlePress = useCallback(() => onToggle(group.groupId), [onToggle, group.groupId]);
  // The chevron collapses/expands; tapping the Project name selects it (makes it the
  // active context / opens its home).
  const projectRoute = buildHostProjectRoute(serverId, group.groupId);
  const projectTasksRoute = buildHostProjectTasksRoute(serverId, group.groupId);
  const handleSelect = useCallback(() => {
    router.navigate(projectTasksRoute);
  }, [projectTasksRoute]);
  const projectHomeSelected = pathname === projectRoute || pathname.startsWith(`${projectRoute}/`);
  const headerStyle = useMemo(
    () => [
      styles.groupHeader,
      isHovered && !projectHomeSelected && styles.groupHeaderHovered,
      projectHomeSelected && styles.groupHeaderSelected,
      isDragging && styles.groupHeaderDragging,
    ],
    [isHovered, projectHomeSelected, isDragging],
  );
  const showControls = isHovered || isNative || isCompact || isDragging;
  const addButtonStyle = useMemo(
    () => [styles.groupAddButton, !showControls && styles.groupControlHidden],
    [showControls],
  );
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
  const handleDelete = useCallback(() => onDelete(group), [group, onDelete]);
  const handleRename = useCallback(() => onRename(group), [group, onRename]);
  const handleDrag = useCallback(() => {
    drag();
  }, [drag]);

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
      <View
        style={headerStyle}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
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
        <Pressable
          style={styles.groupHeaderMain}
          onPress={handleSelect}
          onLongPress={handleDrag}
          delayLongPress={250}
          testID={`sidebar-group-select-${group.groupId}`}
        >
          <Text style={styles.groupName} numberOfLines={1}>
            {group.displayName}
          </Text>
          <Text style={styles.groupCount}>{group.projects.length}</Text>
        </Pressable>
        {canAddFromDisk ? (
          <Pressable
            style={addButtonStyle}
            pointerEvents={showControls ? "auto" : "none"}
            onPress={handleAddFromDisk}
            hitSlop={8}
            accessibilityLabel="Add folder from disk"
            testID={`sidebar-group-add-${group.groupId}`}
          >
            <ThemedPlus size={14} uniProps={mutedColorMapping} />
          </Pressable>
        ) : null}
        <ProjectActionsMenu
          groupId={group.groupId}
          deleteStatus={deleteStatus}
          visible={showControls}
          onRename={handleRename}
          onDelete={handleDelete}
        />
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

function ProjectActionsMenu({
  groupId,
  deleteStatus,
  visible,
  onRename,
  onDelete,
}: {
  groupId: string;
  deleteStatus: "idle" | "pending";
  visible: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  const triggerStyle = useMemo(
    () => [styles.groupActionButton, !visible && styles.groupControlHidden],
    [visible],
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        hitSlop={8}
        style={triggerStyle}
        pointerEvents={visible ? "auto" : "none"}
        accessibilityRole="button"
        accessibilityLabel="Project actions"
        testID={`sidebar-group-actions-${groupId}`}
      >
        <ThemedMoreVertical size={14} uniProps={mutedColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={240}>
        <DropdownMenuItem
          testID={`sidebar-group-rename-${groupId}`}
          leading={pencilLeadingIcon}
          onSelect={onRename}
        >
          Rename Project
        </DropdownMenuItem>
        <DropdownMenuItem
          testID={`sidebar-group-remove-${groupId}`}
          leading={trashLeadingIcon}
          destructive
          status={deleteStatus}
          pendingLabel="Removing..."
          onSelect={onDelete}
        >
          Remove Project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
    // Indent member folders so they sit clearly right of the Project's icon and
    // read as its children (the row content already has its own ~8px padding).
    paddingLeft: theme.spacing[6],
  },
  groupHeader: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  groupHeaderSelected: {
    backgroundColor: theme.colors.surface2,
  },
  groupHeaderHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  groupHeaderDragging: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    ...theme.shadow.md,
  },
  groupDragHandle: {
    width: 16,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  groupChevronButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  groupHeaderMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
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
  groupActionButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  groupControlHidden: {
    opacity: 0,
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
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
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
