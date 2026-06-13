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
  const params = useLocalSearchParams<{ serverId?: string; groupId?: string; packet?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const groupId = typeof params.groupId === "string" ? params.groupId : "";
  const packetPath = typeof params.packet === "string" ? params.packet : null;

  return (
    <ProjectSurfaceScreen
      serverId={serverId}
      groupId={groupId}
      initialTab="context"
      initialContextPacketPath={packetPath}
    />
  );
}
