import { useLocalSearchParams } from "expo-router";
import { NewProjectAgentScreen } from "@/screens/new-project-agent-screen";

export default function HostNewProjectAgentRoute() {
  const params = useLocalSearchParams<{ serverId?: string; groupId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const groupId = typeof params.groupId === "string" ? params.groupId : "";
  return <NewProjectAgentScreen serverId={serverId} groupId={groupId} />;
}
