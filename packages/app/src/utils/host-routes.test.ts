import { describe, expect, it } from "vitest";
import {
  buildHostAgentDetailRoute,
  buildHostNewWorkspaceRoute,
  buildHostNewProjectAgentRoute,
  buildHostProjectAgentsRoute,
  buildHostProjectContextRoute,
  buildHostProjectGoalsRoute,
  buildHostProjectNotesRoute,
  buildHostProjectFilesRoute,
  buildHostProjectRoute,
  buildHostProjectTasksRoute,
  buildHostProjectThreadsRoute,
  buildHostRootRoute,
  buildHostTaskRoute,
  buildHostWorkspaceOpenRoute,
  buildHostWorkspaceRoute,
  buildHostTasksRoute,
  buildWorkspaceOpenIntentForTarget,
  withWorkspaceOpenIntentForTarget,
  buildProjectSettingsRoute,
  buildProjectsSettingsRoute,
  decodeFilePathFromPathSegment,
  decodeWorkspaceIdFromPathSegment,
  encodeFilePathForPathSegment,
  encodeWorkspaceIdForPathSegment,
  mapPathnameToServer,
  normalizeHostSectionSlug,
  parseHostAgentRouteFromPathname,
  parseHostWorkspaceOpenIntentFromPathname,
  parseHostWorkspaceRouteFromPathname,
  parseWorkspaceOpenIntent,
} from "./host-routes";

describe("parseHostAgentRouteFromPathname", () => {
  it("continues parsing detail routes", () => {
    expect(parseHostAgentRouteFromPathname("/h/local/agent/abc123")).toEqual({
      serverId: "local",
      agentId: "abc123",
    });
  });
});

describe("workspace route parsing", () => {
  it("keeps URL-safe workspace IDs unencoded", () => {
    expect(encodeWorkspaceIdForPathSegment("164")).toBe("164");
    expect(decodeWorkspaceIdFromPathSegment("164")).toBe("164");
  });

  it("encodes non-URL-safe workspace IDs as base64url", () => {
    expect(encodeWorkspaceIdForPathSegment("/tmp/repo")).toBe("b64_L3RtcC9yZXBv");
    expect(decodeWorkspaceIdFromPathSegment("L3RtcC9yZXBv")).toBe("/tmp/repo");
  });

  it("decodes non-canonical base64url workspace IDs used by older links", () => {
    expect(decodeWorkspaceIdFromPathSegment("L1VzZXJzL21vYm91ZHJhL2Rldi9wYXNlby")).toBe(
      "/Users/moboudra/dev/paseo",
    );
  });

  it("encodes file paths as base64url (no padding)", () => {
    const encoded = encodeFilePathForPathSegment("src/index.ts");
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFilePathFromPathSegment(encoded)).toBe("src/index.ts");
  });

  it("parses workspace route with a plain workspace id", () => {
    expect(parseHostWorkspaceRouteFromPathname("/h/local/workspace/164")).toEqual({
      serverId: "local",
      workspaceId: "164",
    });
  });

  it("parses workspace route with legacy base64 path", () => {
    expect(parseHostWorkspaceRouteFromPathname("/h/local/workspace/L3RtcC9yZXBv")).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
    });
  });

  it("does not treat /tab routes as valid workspace routes", () => {
    expect(
      parseHostWorkspaceRouteFromPathname("/h/local/workspace/L3RtcC9yZXBv/tab/draft_abc123"),
    ).toBeNull();
  });

  it("builds plain workspace routes for URL-safe ids", () => {
    expect(buildHostWorkspaceRoute("local", "164")).toBe("/h/local/workspace/164");
  });

  it("builds base64url workspace routes for legacy paths", () => {
    expect(buildHostWorkspaceRoute("local", "/tmp/repo")).toBe(
      "/h/local/workspace/b64_L3RtcC9yZXBv",
    );
  });

  it("builds host root routes", () => {
    expect(buildHostRootRoute("local")).toBe("/h/local");
  });

  it("parses workspace open intent from pathname query", () => {
    expect(
      parseHostWorkspaceOpenIntentFromPathname("/h/local/workspace/164?open=agent%3Aagent-1"),
    ).toEqual({
      kind: "agent",
      agentId: "agent-1",
    });
    expect(parseWorkspaceOpenIntent("terminal:term-1")).toEqual({
      kind: "terminal",
      terminalId: "term-1",
    });
    expect(parseWorkspaceOpenIntent("draft:new")).toEqual({
      kind: "draft",
      draftId: "new",
    });
    expect(parseWorkspaceOpenIntent("file:c3JjL2luZGV4LnRz")).toEqual({
      kind: "file",
      path: "src/index.ts",
    });
    expect(parseWorkspaceOpenIntent("setup:L3RtcC9yZXBv")).toEqual({
      kind: "setup",
      workspaceId: "/tmp/repo",
    });
  });

  it("uses the plain workspace route when workspace context is provided", () => {
    expect(buildHostAgentDetailRoute("local", "agent-1", "164")).toBe(
      "/h/local/workspace/164?open=agent%3Aagent-1",
    );
  });

  it("builds workspace routes with a one-shot open intent", () => {
    expect(buildHostWorkspaceOpenRoute("local", "164", "draft:new")).toBe(
      "/h/local/workspace/164?open=draft%3Anew",
    );
  });

  it("builds workspace open intents for tab targets", () => {
    expect(buildWorkspaceOpenIntentForTarget({ kind: "agent", agentId: "agent-1" })).toBe(
      "agent:agent-1",
    );
    expect(buildWorkspaceOpenIntentForTarget({ kind: "terminal", terminalId: "term-1" })).toBe(
      "terminal:term-1",
    );
    expect(buildWorkspaceOpenIntentForTarget({ kind: "draft", draftId: "draft-1" })).toBe(
      "draft:draft-1",
    );
    expect(buildWorkspaceOpenIntentForTarget({ kind: "file", path: "src/index.ts" })).toBe(
      "file:c3JjL2luZGV4LnRz",
    );
    expect(buildWorkspaceOpenIntentForTarget({ kind: "setup", workspaceId: "/tmp/repo" })).toBe(
      "setup:b64_L3RtcC9yZXBv",
    );
  });

  it("does not build open intents for project tabs yet", () => {
    expect(
      buildWorkspaceOpenIntentForTarget({ kind: "project-overview", groupId: "grp_1" }),
    ).toBeNull();
  });

  it("adds a tab open intent to an existing workspace route path", () => {
    expect(
      withWorkspaceOpenIntentForTarget({
        routePath: "/h/local/workspace/164?view=wide#bottom",
        target: { kind: "agent", agentId: "agent-1" },
      }),
    ).toBe("/h/local/workspace/164?view=wide&open=agent%3Aagent-1#bottom");
  });

  it("replaces stale open intents when building a tab-specific new-window route", () => {
    expect(
      withWorkspaceOpenIntentForTarget({
        routePath: "/h/local/workspace/164?open=terminal%3Aold",
        target: { kind: "terminal", terminalId: "term-1" },
      }),
    ).toBe("/h/local/workspace/164?open=terminal%3Aterm-1");
  });

  it("leaves the route unchanged for unsupported tab targets", () => {
    expect(
      withWorkspaceOpenIntentForTarget({
        routePath: "/h/local/project/grp_1",
        target: { kind: "project-overview", groupId: "grp_1" },
      }),
    ).toBe("/h/local/project/grp_1");
  });

  it("builds a global new workspace route without a source directory", () => {
    expect(buildHostNewWorkspaceRoute("local")).toBe("/h/local/new");
  });

  it("builds the host Tasks route", () => {
    expect(buildHostTasksRoute("local")).toBe("/h/local/tasks");
    expect(buildHostTaskRoute("local", "grp_123", "task one")).toBe(
      "/h/local/tasks?taskProjectGroupId=grp_123&taskId=task%20one",
    );
  });

  it("builds a project shortcut new workspace route with initial project context", () => {
    expect(
      buildHostNewWorkspaceRoute("local", "/repo/project", {
        displayName: "Project",
        projectId: "project-1",
      }),
    ).toBe("/h/local/new?dir=%2Frepo%2Fproject&name=Project&projectId=project-1");
  });

  it("builds host Project home routes", () => {
    expect(buildHostProjectRoute("local", "grp_1")).toBe("/h/local/project/grp_1");
    expect(buildHostProjectFilesRoute("local", "grp_1")).toBe("/h/local/project/grp_1/files");
    expect(buildHostProjectFilesRoute("local", "grp_1", { selectedPath: "roadmap.md" })).toBe(
      "/h/local/project/grp_1/files?file=roadmap.md",
    );
    expect(
      buildHostProjectFilesRoute("local", "grp_1", { selectedPath: "workflows/intake.md" }),
    ).toBe("/h/local/project/grp_1/files?file=workflows%2Fintake.md");
    expect(buildHostProjectTasksRoute("local", "grp_1")).toBe("/h/local/project/grp_1/tasks");
    expect(buildHostProjectNotesRoute("local", "grp_1")).toBe("/h/local/project/grp_1/notes");
    expect(buildHostProjectNotesRoute("local", "grp_1", { selectedPath: "decisions.md" })).toBe(
      "/h/local/project/grp_1/notes?file=decisions.md",
    );
    expect(buildHostProjectGoalsRoute("local", "grp_1")).toBe("/h/local/project/grp_1/goals");
    expect(buildHostProjectGoalsRoute("local", "grp_1", { selectedPath: "README.md" })).toBe(
      "/h/local/project/grp_1/goals?file=README.md",
    );
    expect(buildHostProjectThreadsRoute("local", "grp_1")).toBe("/h/local/project/grp_1/threads");
    expect(
      buildHostProjectThreadsRoute("local", "grp_1", { selectedPath: "2026-06-16-intake.md" }),
    ).toBe("/h/local/project/grp_1/threads?file=2026-06-16-intake.md");
    expect(buildHostProjectContextRoute("local", "grp_1")).toBe("/h/local/project/grp_1/context");
    expect(
      buildHostProjectContextRoute("local", "grp_1", {
        packetPath: "context/packets/scheduled-run.yaml",
      }),
    ).toBe("/h/local/project/grp_1/context?packet=context%2Fpackets%2Fscheduled-run.yaml");
    expect(buildHostProjectAgentsRoute("local", "grp_1")).toBe("/h/local/project/grp_1/agents");
    expect(buildHostNewProjectAgentRoute("local", "grp_1")).toBe(
      "/h/local/project/grp_1/new-agent",
    );
    expect(
      buildHostNewProjectAgentRoute("local", "grp_1", {
        profilePath: "agents/qa-tester.yaml",
      }),
    ).toBe("/h/local/project/grp_1/new-agent?profilePath=agents%2Fqa-tester.yaml");
  });

  it("maps host Project home routes to another host", () => {
    expect(mapPathnameToServer("/h/local/project/grp_1", "remote")).toBe("/h/remote/project/grp_1");
  });

  it("round-trips URL-safe IDs through encode/decode", () => {
    const ids = ["1", "40", "164", "9999", "workspace-1", "opaque_id.v2~test"];
    for (const id of ids) {
      const encoded = encodeWorkspaceIdForPathSegment(id);
      const decoded = decodeWorkspaceIdFromPathSegment(encoded);
      expect(decoded).toBe(id);
    }
  });

  it("round-trips opaque IDs with reserved characters through base64 encoding", () => {
    const id = "  team/setup:id#1  ";
    const encoded = encodeWorkspaceIdForPathSegment(id);
    expect(encoded).toBe("b64_dGVhbS9zZXR1cDppZCMx");
    expect(decodeWorkspaceIdFromPathSegment(encoded)).toBe("team/setup:id#1");
  });
});

describe("projects settings routes", () => {
  it("buildProjectsSettingsRoute returns /settings/projects", () => {
    expect(buildProjectsSettingsRoute()).toBe("/settings/projects");
  });

  it("buildProjectSettingsRoute encodes a remote project key as a single segment", () => {
    expect(buildProjectSettingsRoute("remote:github.com/acme/app")).toBe(
      "/settings/projects/remote%3Agithub.com%2Facme%2Fapp",
    );
  });

  it("buildProjectSettingsRoute encodes a local repo-root key", () => {
    expect(buildProjectSettingsRoute("/Users/me/dev/paseo")).toBe(
      "/settings/projects/%2FUsers%2Fme%2Fdev%2Fpaseo",
    );
  });

  it("project keys round-trip through decodeURIComponent", () => {
    const projectKey = "remote:github.com/acme/app";
    const route = buildProjectSettingsRoute(projectKey);
    const segment = route.slice("/settings/projects/".length);
    expect(decodeURIComponent(segment)).toBe(projectKey);
  });
});

describe("host settings section slugs", () => {
  it("keeps current host settings sections", () => {
    expect(normalizeHostSectionSlug("connections")).toBe("connections");
    expect(normalizeHostSectionSlug("agents")).toBe("agents");
    expect(normalizeHostSectionSlug("workspaces")).toBe("workspaces");
    expect(normalizeHostSectionSlug("providers")).toBe("providers");
    expect(normalizeHostSectionSlug("host")).toBe("host");
  });

  it("maps old host settings sections to their new names", () => {
    expect(normalizeHostSectionSlug("orchestration")).toBe("agents");
    expect(normalizeHostSectionSlug("daemon")).toBe("host");
  });
});
