import { ListTodo } from "lucide-react-native";
import invariant from "tiny-invariant";
import { TasksPane } from "@/components/tasks-pane";
import { usePaneContext } from "@/panels/pane-context";
import type { PanelRegistration } from "@/panels/panel-registry";

function useTasksPanelDescriptor() {
  return {
    label: "Tasks",
    subtitle: "Project tasks",
    titleState: "ready" as const,
    icon: ListTodo,
    statusBucket: null,
  };
}

function TasksPanel() {
  const { serverId, workspaceId, target } = usePaneContext();
  invariant(target.kind === "tasks", "TasksPanel requires tasks target");
  return <TasksPane serverId={serverId} workspaceId={workspaceId} />;
}

export const tasksPanelRegistration: PanelRegistration<"tasks"> = {
  kind: "tasks",
  component: TasksPanel,
  useDescriptor: useTasksPanelDescriptor,
};
