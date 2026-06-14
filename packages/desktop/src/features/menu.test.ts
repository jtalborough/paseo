import { describe, expect, it, vi } from "vitest";

import { buildApplicationMenuTemplate } from "./menu";

vi.mock("electron", () => ({
  app: { name: "Paseo" },
  BrowserWindow: { getFocusedWindow: vi.fn() },
  ipcMain: { handle: vi.fn() },
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
}));

vi.mock("./browser-webviews.js", () => ({
  getWorkspaceActivePaseoBrowserWebContents: vi.fn(() => null),
}));

function findMenuItem(
  template: Electron.MenuItemConstructorOptions[],
  label: string,
): Electron.MenuItemConstructorOptions | null {
  for (const item of template) {
    if (item.label === label) {
      return item;
    }
    const submenu = item.submenu;
    if (Array.isArray(submenu)) {
      const match = findMenuItem(submenu, label);
      if (match) {
        return match;
      }
    }
  }
  return null;
}

describe("desktop application menu", () => {
  it("exposes an enabled New Window command when a window factory is provided", () => {
    const createWindow = vi.fn();
    const template = buildApplicationMenuTemplate({ createWindow });
    const item = findMenuItem(template, "New Window");

    expect(item).toMatchObject({
      label: "New Window",
      accelerator: "CmdOrCtrl+Shift+N",
      enabled: true,
    });

    item?.click?.({} as Electron.MenuItem, undefined, {} as KeyboardEvent);

    expect(createWindow).toHaveBeenCalledTimes(1);
  });

  it("keeps New Window disabled when the desktop cannot create another window", () => {
    const template = buildApplicationMenuTemplate();
    const item = findMenuItem(template, "New Window");

    expect(item).toMatchObject({
      label: "New Window",
      enabled: false,
    });
  });
});
