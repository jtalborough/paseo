import { useLocalSearchParams } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { ProjectSurfaceScreen } from "@/screens/project-surface-screen";

export default function HostProjectThreadsRoute() {
  return (
    <HostRouteBootstrapBoundary>
      <HostProjectThreadsRouteContent />
    </HostRouteBootstrapBoundary>
  );
}

function HostProjectThreadsRouteContent() {
  const params = useLocalSearchParams<{ serverId?: string; groupId?: string; file?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const groupId = typeof params.groupId === "string" ? params.groupId : "";
  const selectedPath = typeof params.file === "string" ? params.file : null;

  return (
    <ProjectSurfaceScreen
      serverId={serverId}
      groupId={groupId}
      initialTab="threads"
      initialSelectedFilePath={selectedPath}
    />
  );
}
