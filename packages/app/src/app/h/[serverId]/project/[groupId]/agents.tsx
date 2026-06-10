import { useLocalSearchParams } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { ProjectSurfaceScreen } from "@/screens/project-surface-screen";

export default function HostProjectAgentsRoute() {
  return (
    <HostRouteBootstrapBoundary>
      <HostProjectAgentsRouteContent />
    </HostRouteBootstrapBoundary>
  );
}

function HostProjectAgentsRouteContent() {
  const params = useLocalSearchParams<{ serverId?: string; groupId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const groupId = typeof params.groupId === "string" ? params.groupId : "";

  return <ProjectSurfaceScreen serverId={serverId} groupId={groupId} initialTab="agents" />;
}
