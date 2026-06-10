import { expect, test, vi } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";
import { createAgentCommand } from "./create.js";
import type { ManagedAgent } from "../agent-manager.js";

test("session create forwards clientMessageId to the initial prompt run options", async () => {
  const snapshot = {
    id: "agent-1",
    provider: "codex",
    cwd: "/tmp/paseo-create-test",
    runtimeInfo: null,
  } as ManagedAgent;
  const streamAgent = vi.fn(() => (async function* noop() {})());
  const dependencies: Parameters<typeof createAgentCommand>[0] = {
    agentManager: {
      createAgent: vi.fn(async () => snapshot),
      getAgent: vi.fn(() => snapshot),
      tryRunOutOfBand: vi.fn(() => false),
      hasInFlightRun: vi.fn(() => false),
      streamAgent,
      waitForAgentRunStart: vi.fn(async () => undefined),
    } as unknown as Parameters<typeof createAgentCommand>[0]["agentManager"],
    agentStorage: {} as Parameters<typeof createAgentCommand>[0]["agentStorage"],
    logger: createTestLogger(),
    providerSnapshotManager: {} as Parameters<
      typeof createAgentCommand
    >[0]["providerSnapshotManager"],
  };

  await createAgentCommand(dependencies, {
    kind: "session",
    config: { provider: "codex", cwd: "/tmp/paseo-create-test" },
    initialPrompt: "hello from create",
    clientMessageId: "msg-create-1",
    labels: {},
    provisionalTitle: null,
    explicitTitle: "Explicit title",
    firstAgentContext: { attachments: [] },
    buildSessionConfig: async (config) => ({ sessionConfig: config }),
    resolveWorkspace: async () => ({ workspaceId: "workspace-1" }),
  });

  expect(streamAgent).toHaveBeenCalledWith("agent-1", "hello from create", {
    messageId: "msg-create-1",
  });
});

test("MCP child creation inherits Project placement even when detached", async () => {
  const parent = {
    id: "parent-agent",
    provider: "codex",
    cwd: "/tmp/project",
    config: { provider: "codex", cwd: "/tmp/project" },
  } as ManagedAgent;
  const child = {
    id: "child-agent",
    provider: "codex",
    cwd: "/tmp/project",
    runtimeInfo: null,
  } as ManagedAgent;
  const createAgent = vi.fn(async () => child);
  const dependencies: Parameters<typeof createAgentCommand>[0] = {
    agentManager: {
      createAgent,
      getAgent: vi.fn((agentId) => (agentId === parent.id ? parent : child)),
      tryRunOutOfBand: vi.fn(() => false),
      hasInFlightRun: vi.fn(() => false),
      streamAgent: vi.fn(() => (async function* noop() {})()),
      waitForAgentRunStart: vi.fn(async () => undefined),
    } as unknown as Parameters<typeof createAgentCommand>[0]["agentManager"],
    agentStorage: {
      get: vi.fn(async (agentId) =>
        agentId === parent.id ? { projectGroupId: "grp_product" } : null,
      ),
    } as unknown as Parameters<typeof createAgentCommand>[0]["agentStorage"],
    logger: createTestLogger(),
    providerSnapshotManager: {
      resolveCreateConfig: vi.fn(async () => ({ modeId: undefined, featureValues: undefined })),
    } as unknown as Parameters<typeof createAgentCommand>[0]["providerSnapshotManager"],
  };

  await createAgentCommand(dependencies, {
    kind: "mcp",
    provider: "codex/gpt-test",
    title: "Detached child",
    initialPrompt: "",
    background: true,
    notifyOnFinish: false,
    detached: true,
    callerAgentId: parent.id,
  });

  expect(createAgent).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "codex", cwd: parent.cwd }),
    undefined,
    { projectGroupId: "grp_product" },
  );
});
