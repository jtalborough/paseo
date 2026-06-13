import { useLocalSearchParams } from "expo-router";
import { NewProjectAgentScreen } from "@/screens/new-project-agent-screen";

export default function HostNewProjectAgentRoute() {
  const params = useLocalSearchParams<{
    serverId?: string;
    groupId?: string;
    profilePath?: string | string[];
  }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const groupId = typeof params.groupId === "string" ? params.groupId : "";
  const profilePath = typeof params.profilePath === "string" ? params.profilePath : null;
  return <NewProjectAgentScreen serverId={serverId} groupId={groupId} profilePath={profilePath} />;
}
