import { describe, expect, it } from "vitest";
import {
  buildRemoteFolderBreadcrumbSegments,
  buildRemoteFolderBrowseRoots,
  buildRemoteFolderBrowserRows,
} from "./project-folder-browser-core";

describe("buildRemoteFolderBrowseRoots", () => {
  it("includes stable roots and de-duplicated recommended paths", () => {
    expect(
      buildRemoteFolderBrowseRoots({
        recommendedPaths: [
          "/srv/projects/paseo",
          "  /opt/workspaces/  ",
          "/",
          "/srv/projects/paseo",
        ],
      }),
    ).toEqual([
      { id: "home", label: "Home", root: "~" },
      { id: "filesystem", label: "Filesystem", root: "/" },
      {
        id: "recommended:/srv/projects/paseo",
        label: "paseo",
        root: "/srv/projects/paseo",
      },
      {
        id: "recommended:/opt/workspaces/",
        label: "workspaces",
        root: "/opt/workspaces/",
      },
    ]);
  });
});

describe("buildRemoteFolderBreadcrumbSegments", () => {
  it("builds segments relative to the selected root", () => {
    expect(
      buildRemoteFolderBreadcrumbSegments({
        rootLabel: "Home",
        rootPath: "/Users/jta",
        currentPath: "/Users/jta/projects/paseo",
      }),
    ).toEqual([
      { label: "Home", path: "/Users/jta" },
      { label: "projects", path: "/Users/jta/projects" },
      { label: "paseo", path: "/Users/jta/projects/paseo" },
    ]);
  });

  it("uses filesystem root as the first segment", () => {
    expect(
      buildRemoteFolderBreadcrumbSegments({
        rootLabel: "Filesystem",
        rootPath: "/",
        currentPath: "/opt/paseo",
      }),
    ).toEqual([
      { label: "/", path: "/" },
      { label: "opt", path: "/opt" },
      { label: "paseo", path: "/opt/paseo" },
    ]);
  });

  it("falls back to the current path when it is outside the selected root", () => {
    expect(
      buildRemoteFolderBreadcrumbSegments({
        rootLabel: "Project",
        rootPath: "/srv/project",
        currentPath: "/tmp/outside",
      }),
    ).toEqual([{ label: "/tmp/outside", path: "/tmp/outside" }]);
  });
});

describe("buildRemoteFolderBrowserRows", () => {
  it("builds select-current, parent, and child rows", () => {
    expect(
      buildRemoteFolderBrowserRows({
        currentPath: "/home/jta",
        parentPath: "/home",
        entries: [
          { name: "projects", path: "/home/jta/projects" },
          { name: "Downloads", path: "/home/jta/Downloads" },
        ],
      }),
    ).toEqual([
      { kind: "current", label: "Select /home/jta", path: "/home/jta" },
      { kind: "parent", label: "Parent directory", path: "/home" },
      { kind: "child", label: "projects", path: "/home/jta/projects" },
      { kind: "child", label: "Downloads", path: "/home/jta/Downloads" },
    ]);
  });

  it("omits parent navigation at the browse root", () => {
    expect(
      buildRemoteFolderBrowserRows({
        currentPath: "/",
        parentPath: null,
        entries: [],
      }),
    ).toEqual([{ kind: "current", label: "Select /", path: "/" }]);
  });
});
