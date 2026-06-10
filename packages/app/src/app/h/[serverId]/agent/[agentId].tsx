import { useEffect, useRef } from "react";
import { useLocalSearchParams, usePathname, useRouter, type Href } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { useResolveWorkspaceIdByCwd } from "@/stores/session-store-hooks";
import { useSessionStore } from "@/stores/session-store";
import { buildHostRootRoute } from "@/utils/host-routes";
import {
  navigateToPreparedProjectTab,
  navigateToPreparedWorkspaceTab,
} from "@/utils/workspace-navigation";

export default function HostAgentReadyRoute() {
  return (
    <HostRouteBootstrapBoundary>
      <HostAgentReadyRouteContent />
    </HostRouteBootstrapBoundary>
  );
}

function HostAgentReadyRouteContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ serverId?: string; agentId?: string }>();
  const redirectedRef = useRef(false);
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const agentId = typeof params.agentId === "string" ? params.agentId : "";
  const agentCwd = useSessionStore((state) =>
    serverId && agentId
      ? (state.sessions[serverId]?.agents?.get(agentId)?.cwd ??
        state.sessions[serverId]?.agentDetails?.get(agentId)?.cwd ??
        null)
      : null,
  );
  const projectGroupId = useSessionStore((state) =>
    serverId && agentId
      ? (state.sessions[serverId]?.agents?.get(agentId)?.projectGroupId ??
        state.sessions[serverId]?.agentDetails?.get(agentId)?.projectGroupId ??
        null)
      : null,
  );
  const hasKnownAgent = useSessionStore((state) =>
    serverId && agentId
      ? Boolean(
          state.sessions[serverId]?.agents?.has(agentId) ||
          state.sessions[serverId]?.agentDetails?.has(agentId),
        )
      : false,
  );
  const hasHydratedAgents = useSessionStore((state) =>
    serverId ? (state.sessions[serverId]?.hasHydratedAgents ?? false) : false,
  );
  const hasHydratedWorkspaces = useSessionStore((state) =>
    serverId ? (state.sessions[serverId]?.hasHydratedWorkspaces ?? false) : false,
  );
  const resolvedWorkspaceId = useResolveWorkspaceIdByCwd(serverId, agentCwd);
  const shouldRedirectToWorkspace = Boolean(resolvedWorkspaceId && !projectGroupId);
  const shouldRedirectToProject = Boolean(projectGroupId);

  useEffect(() => {
    if (!serverId || !agentId || redirectedRef.current) {
      return;
    }

    if (!hasKnownAgent && !hasHydratedAgents) {
      return;
    }

    if (projectGroupId && shouldRedirectToProject) {
      redirectedRef.current = true;
      navigateToPreparedProjectTab({
        serverId,
        groupId: projectGroupId,
        target: { kind: "agent", agentId },
        currentPathname: pathname,
      });
      return;
    }

    if (agentCwd?.trim() && !hasHydratedWorkspaces) {
      return;
    }

    if (resolvedWorkspaceId && shouldRedirectToWorkspace) {
      redirectedRef.current = true;
      navigateToPreparedWorkspaceTab({
        serverId,
        workspaceId: resolvedWorkspaceId,
        target: { kind: "agent", agentId },
        currentPathname: pathname,
      });
      return;
    }

    redirectedRef.current = true;
    router.replace(buildHostRootRoute(serverId) as Href);
  }, [
    agentId,
    agentCwd,
    hasHydratedAgents,
    hasHydratedWorkspaces,
    hasKnownAgent,
    pathname,
    projectGroupId,
    resolvedWorkspaceId,
    router,
    serverId,
    shouldRedirectToProject,
    shouldRedirectToWorkspace,
  ]);

  return null;
}
