import { ipcMain } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerWindowManager } from "./window-manager";

vi.mock("electron", () => ({
  app: { setBadgeCount: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn() },
  clipboard: {},
  ipcMain: { handle: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
  nativeTheme: { shouldUseDarkColors: true },
  shell: {},
}));

function getRegisteredHandler(channel: string): (...args: unknown[]) => unknown {
  const handler = vi.mocked(ipcMain.handle).mock.calls.find(([candidate]) => {
    return candidate === channel;
  })?.[1];
  if (typeof handler !== "function") {
    throw new Error(`${channel} handler was not registered`);
  }
  return handler as (...args: unknown[]) => unknown;
}

describe("window-manager IPC", () => {
  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockReset();
  });

  it("routes renderer new-window requests through the supplied window factory", async () => {
    const createWindow = vi.fn();
    registerWindowManager({ createWindow });

    await getRegisteredHandler("paseo:window:create")({});

    expect(createWindow).toHaveBeenCalledTimes(1);
  });
});
