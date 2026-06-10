import { useLocalSearchParams } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { TasksScreen } from "@/screens/tasks-screen";

export default function HostTasksRoute() {
  return (
    <HostRouteBootstrapBoundary>
      <HostTasksRouteContent />
    </HostRouteBootstrapBoundary>
  );
}

function HostTasksRouteContent() {
  const params = useLocalSearchParams<{
    serverId?: string;
    taskId?: string;
    taskProjectGroupId?: string;
  }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const taskId = typeof params.taskId === "string" ? params.taskId : null;
  const taskProjectGroupId =
    typeof params.taskProjectGroupId === "string" ? params.taskProjectGroupId : null;
  return (
    <TasksScreen
      serverId={serverId}
      initialTaskId={taskId}
      initialTaskProjectGroupId={taskProjectGroupId}
    />
  );
}
