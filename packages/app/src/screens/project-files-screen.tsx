import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { FileExplorerPane } from "@/components/file-explorer-pane";
import { FilePane } from "@/components/file-pane";
import { ProjectSurfaceHeader } from "@/components/project-surface-header";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useProjectGroups } from "@/hooks/use-project-groups";
import { buildHostProjectRoute } from "@/utils/host-routes";

interface ProjectFilesScreenProps {
  serverId: string;
  groupId: string;
  directory?: string;
  surfaceName?: string;
  emptySelectionLabel?: string;
  emptySelectionDescription?: string;
  embedded?: boolean;
}

export function ProjectFilesScreen({
  serverId,
  groupId,
  directory,
  surfaceName = "files",
  emptySelectionLabel = "Select a Project file",
  emptySelectionDescription = "Pick a file from the explorer to preview or edit it here.",
  embedded = false,
}: ProjectFilesScreenProps) {
  const isCompact = useIsCompactFormFactor();
  const { groups, supported } = useProjectGroups(serverId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const group = useMemo(
    () => groups.find((candidate) => candidate.groupId === groupId) ?? null,
    [groupId, groups],
  );
  const selectedLocation = useMemo(
    () => (selectedPath ? { path: selectedPath } : null),
    [selectedPath],
  );
  const workspaceRoot = useMemo(() => {
    if (!group?.cwd) {
      return "";
    }
    return directory ? `${group.cwd.replace(/[\\/]+$/, "")}/${directory}` : group.cwd;
  }, [directory, group?.cwd]);

  const handleBack = useCallback(() => {
    if (isCompact && selectedPath) {
      setSelectedPath(null);
      return;
    }
    router.replace(buildHostProjectRoute(serverId, groupId));
  }, [groupId, isCompact, selectedPath, serverId]);

  const handleOpenFile = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  if (!supported || !group?.cwd) {
    return <ProjectFilesUnavailable embedded={embedded} supported={supported} />;
  }

  const title = selectedPath && isCompact ? selectedPath : `${group.displayName} ${surfaceName}`;

  return (
    <View style={styles.container}>
      <ProjectFilesHeader
        title={title}
        embedded={embedded}
        showBack={isCompact && Boolean(selectedPath)}
        onBack={handleBack}
      />
      {embedded && isCompact && selectedPath ? (
        <Pressable onPress={handleBack} style={styles.embeddedBackButton}>
          <Text style={styles.embeddedBackText}>Back to {surfaceName}</Text>
        </Pressable>
      ) : null}
      <ProjectFilesContent
        serverId={serverId}
        workspaceRoot={workspaceRoot}
        selectedLocation={selectedLocation}
        showExplorer={!isCompact || !selectedPath}
        showPreview={!isCompact || Boolean(selectedPath)}
        emptySelectionLabel={emptySelectionLabel}
        emptySelectionDescription={emptySelectionDescription}
        onOpenFile={handleOpenFile}
      />
    </View>
  );
}

function ProjectFilesUnavailable({
  embedded,
  supported,
}: {
  embedded: boolean;
  supported: boolean;
}) {
  return (
    <View style={styles.container}>
      <ProjectFilesHeader title="Project" embedded={embedded} />
      <View style={styles.centered}>
        <Text style={styles.emptyText}>
          {supported ? "Project not found" : "Update the host to use Projects"}
        </Text>
      </View>
    </View>
  );
}

function ProjectFilesHeader({
  title,
  embedded,
  showBack = false,
  onBack,
}: {
  title: string;
  embedded: boolean;
  showBack?: boolean;
  onBack?: () => void;
}) {
  if (embedded) {
    return null;
  }
  return <ProjectSurfaceHeader title={title} onBack={showBack ? onBack : undefined} />;
}

function ProjectFilesContent({
  serverId,
  workspaceRoot,
  selectedLocation,
  showExplorer,
  showPreview,
  emptySelectionLabel,
  emptySelectionDescription,
  onOpenFile,
}: {
  serverId: string;
  workspaceRoot: string;
  selectedLocation: { path: string } | null;
  showExplorer: boolean;
  showPreview: boolean;
  emptySelectionLabel: string;
  emptySelectionDescription: string;
  onOpenFile: (path: string) => void;
}) {
  return (
    <View style={styles.content}>
      {showExplorer ? (
        <View style={styles.explorer}>
          <FileExplorerPane
            serverId={serverId}
            workspaceRoot={workspaceRoot}
            onOpenFile={onOpenFile}
          />
        </View>
      ) : null}
      {showPreview ? (
        <View style={styles.preview}>
          {selectedLocation ? (
            <FilePane
              serverId={serverId}
              workspaceRoot={workspaceRoot}
              location={selectedLocation}
            />
          ) : (
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>{emptySelectionLabel}</Text>
              <Text style={styles.emptyDescription}>{emptySelectionDescription}</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  content: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
  },
  explorer: {
    width: {
      xs: "100%",
      md: 300,
    },
    minHeight: 0,
    borderRightWidth: {
      xs: 0,
      md: theme.borderWidth[1],
    },
    borderRightColor: theme.colors.border,
  },
  preview: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
    gap: theme.spacing[2],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  emptyDescription: {
    maxWidth: 360,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
    textAlign: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  embeddedBackButton: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  embeddedBackText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
