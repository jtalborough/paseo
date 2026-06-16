import {
  Bot,
  Files,
  LayoutDashboard,
  ListTodo,
  NotebookText,
  ScrollText,
  Target,
  MessagesSquare,
} from "lucide-react-native";
import { View } from "react-native";
import { usePaneContext } from "@/panels/pane-context";
import type { PanelDescriptor, PanelRegistration } from "@/panels/panel-registry";
import { ProjectContextScreen } from "@/screens/project-context-screen";
import { ProjectFilesScreen } from "@/screens/project-files-screen";
import { ProjectAgentsScreen, ProjectHomeScreen } from "@/screens/project-home-screen";
import { ProjectTasksScreen } from "@/screens/project-tasks-screen";
import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";

type ProjectPanelKind = Extract<
  WorkspaceTabTarget["kind"],
  | "project-overview"
  | "tasks"
  | "notes"
  | "project-tasks"
  | "project-notes"
  | "project-goals"
  | "project-threads"
  | "project-agents"
  | "project-context"
  | "project-files"
>;

const projectPanelDescriptors: Record<ProjectPanelKind, PanelDescriptor> = {
  "project-overview": {
    label: "Overview",
    subtitle: "Project overview",
    titleState: "ready",
    icon: LayoutDashboard,
    statusBucket: null,
  },
  tasks: {
    label: "Tasks",
    subtitle: "Project tasks",
    titleState: "ready",
    icon: ListTodo,
    statusBucket: null,
  },
  notes: {
    label: "Notes",
    subtitle: "Project notes",
    titleState: "ready",
    icon: NotebookText,
    statusBucket: null,
  },
  "project-tasks": {
    label: "Tasks",
    subtitle: "Project tasks",
    titleState: "ready",
    icon: ListTodo,
    statusBucket: null,
  },
  "project-notes": {
    label: "Notes",
    subtitle: "Project notes",
    titleState: "ready",
    icon: NotebookText,
    statusBucket: null,
  },
  "project-goals": {
    label: "Goals",
    subtitle: "Project goals",
    titleState: "ready",
    icon: Target,
    statusBucket: null,
  },
  "project-threads": {
    label: "Threads",
    subtitle: "Project threads",
    titleState: "ready",
    icon: MessagesSquare,
    statusBucket: null,
  },
  "project-agents": {
    label: "Agents",
    subtitle: "Project agents",
    titleState: "ready",
    icon: Bot,
    statusBucket: null,
  },
  "project-context": {
    label: "Context",
    subtitle: "Context packets",
    titleState: "ready",
    icon: ScrollText,
    statusBucket: null,
  },
  "project-files": {
    label: "Files",
    subtitle: "Project files",
    titleState: "ready",
    icon: Files,
    statusBucket: null,
  },
};

function getProjectGroupIdFromTarget(target: WorkspaceTabTarget): string | null {
  if (
    target.kind === "project-overview" ||
    target.kind === "tasks" ||
    target.kind === "notes" ||
    target.kind === "project-tasks" ||
    target.kind === "project-notes" ||
    target.kind === "project-goals" ||
    target.kind === "project-threads" ||
    target.kind === "project-agents" ||
    target.kind === "project-context" ||
    target.kind === "project-files"
  ) {
    return target.groupId;
  }
  return null;
}

function ProjectOverviewPanel() {
  const { openTab, serverId, target } = usePaneContext();
  const groupId = getProjectGroupIdFromTarget(target);
  if (!groupId) {
    return <View />;
  }
  return <ProjectHomeScreen serverId={serverId} groupId={groupId} embedded onOpenTab={openTab} />;
}

function ProjectTasksPanel() {
  const { openTab, serverId, target } = usePaneContext();
  if (target.kind !== "tasks" && target.kind !== "project-tasks") {
    return <View />;
  }
  return (
    <ProjectTasksScreen serverId={serverId} groupId={target.groupId} embedded onOpenTab={openTab} />
  );
}

function ProjectNotesPanel() {
  const { serverId, target } = usePaneContext();
  if (target.kind !== "notes" && target.kind !== "project-notes") {
    return <View />;
  }
  return (
    <ProjectFilesScreen
      serverId={serverId}
      groupId={target.groupId}
      directory="notes"
      surfaceName="notes"
      emptySelectionLabel="Select a note file"
      emptySelectionDescription="Project notes are plain Markdown files. Pick one from the explorer, or create a Markdown file in the notes folder."
      selectedPath={target.selectedPath ?? null}
      embedded
    />
  );
}

function ProjectGoalsPanel() {
  const { serverId, target } = usePaneContext();
  if (target.kind !== "project-goals") {
    return <View />;
  }
  return (
    <ProjectFilesScreen
      serverId={serverId}
      groupId={target.groupId}
      directory="goals"
      surfaceName="goals"
      emptySelectionLabel="Select a goal file"
      emptySelectionDescription="Project goals are durable Markdown objectives. Pick one from the explorer, or create a Markdown file in the goals folder."
      selectedPath={target.selectedPath ?? null}
      embedded
    />
  );
}

function ProjectThreadsPanel() {
  const { serverId, target } = usePaneContext();
  if (target.kind !== "project-threads") {
    return <View />;
  }
  return (
    <ProjectFilesScreen
      serverId={serverId}
      groupId={target.groupId}
      directory="threads"
      surfaceName="threads"
      emptySelectionLabel="Select a thread file"
      emptySelectionDescription="Project threads are durable work trails linked to goals, tasks, agent runs, decisions, and evidence."
      selectedPath={target.selectedPath ?? null}
      embedded
    />
  );
}

function ProjectAgentsPanel() {
  const { openTab, serverId, target } = usePaneContext();
  const groupId = getProjectGroupIdFromTarget(target);
  if (!groupId) {
    return <View />;
  }
  return <ProjectAgentsScreen serverId={serverId} groupId={groupId} embedded onOpenTab={openTab} />;
}

function ProjectFilesPanel() {
  const { serverId, target } = usePaneContext();
  const groupId = getProjectGroupIdFromTarget(target);
  if (!groupId) {
    return <View />;
  }
  return (
    <ProjectFilesScreen
      serverId={serverId}
      groupId={groupId}
      selectedPath={target.kind === "project-files" ? (target.selectedPath ?? null) : null}
      embedded
    />
  );
}

function ProjectContextPanel() {
  const { serverId, target } = usePaneContext();
  if (target.kind !== "project-context") {
    return <View />;
  }
  return (
    <ProjectContextScreen
      serverId={serverId}
      groupId={target.groupId}
      embedded
      selectedPacketPath={target.packetPath ?? null}
    />
  );
}

function createProjectPanelRegistration<K extends ProjectPanelKind>(
  kind: K,
  component: PanelRegistration<K>["component"],
): PanelRegistration<K> {
  return {
    kind,
    component,
    useDescriptor: () => projectPanelDescriptors[kind],
  };
}

export const projectOverviewPanelRegistration = createProjectPanelRegistration(
  "project-overview",
  ProjectOverviewPanel,
);
export const tasksPanelRegistration = createProjectPanelRegistration("tasks", ProjectTasksPanel);
export const notesPanelRegistration = createProjectPanelRegistration("notes", ProjectNotesPanel);
export const projectTasksPanelRegistration = createProjectPanelRegistration(
  "project-tasks",
  ProjectTasksPanel,
);
export const projectNotesPanelRegistration = createProjectPanelRegistration(
  "project-notes",
  ProjectNotesPanel,
);
export const projectGoalsPanelRegistration = createProjectPanelRegistration(
  "project-goals",
  ProjectGoalsPanel,
);
export const projectThreadsPanelRegistration = createProjectPanelRegistration(
  "project-threads",
  ProjectThreadsPanel,
);
export const projectAgentsPanelRegistration = createProjectPanelRegistration(
  "project-agents",
  ProjectAgentsPanel,
);
export const projectContextPanelRegistration = createProjectPanelRegistration(
  "project-context",
  ProjectContextPanel,
);
export const projectFilesPanelRegistration = createProjectPanelRegistration(
  "project-files",
  ProjectFilesPanel,
);
