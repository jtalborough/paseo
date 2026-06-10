import { useLocalSearchParams } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { ProjectSurfaceScreen } from "@/screens/project-surface-screen";

export default function HostProjectContextRoute() {
  return (
    <HostRouteBootstrapBoundary>
      <HostProjectContextRouteContent />
    </HostRouteBootstrapBoundary>
  );
}

function HostProjectContextRouteContent() {
  const params = useLocalSearchParams<{ serverId?: string; groupId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const groupId = typeof params.groupId === "string" ? params.groupId : "";

  return <ProjectSurfaceScreen serverId={serverId} groupId={groupId} initialTab="context" />;
}
