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
  const params = useLocalSearchParams<{ serverId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";

  return <TasksScreen serverId={serverId} />;
}
