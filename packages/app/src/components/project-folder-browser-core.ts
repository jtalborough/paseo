export interface RemoteFolderBrowseRoot {
  id: string;
  label: string;
  root: string;
}

export interface RemoteFolderBrowseEntry {
  name: string;
  path: string;
}

export type RemoteFolderBrowserRow =
  | {
      kind: "current";
      label: string;
      path: string;
    }
  | {
      kind: "parent";
      label: string;
      path: string;
    }
  | {
      kind: "child";
      label: string;
      path: string;
    };

export function buildRemoteFolderBrowseRoots(input: {
  recommendedPaths: readonly string[];
}): RemoteFolderBrowseRoot[] {
  const roots: RemoteFolderBrowseRoot[] = [
    { id: "home", label: "Home", root: "~" },
    { id: "filesystem", label: "Filesystem", root: "/" },
  ];
  const seen = new Set(roots.map((root) => root.root));
  for (const path of input.recommendedPaths) {
    const trimmed = path.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    roots.push({
      id: `recommended:${trimmed}`,
      label: basename(trimmed),
      root: trimmed,
    });
  }
  return roots;
}

export function buildRemoteFolderBrowserRows(input: {
  currentPath: string | null;
  parentPath: string | null;
  entries: readonly RemoteFolderBrowseEntry[];
}): RemoteFolderBrowserRow[] {
  const rows: RemoteFolderBrowserRow[] = [];
  if (input.currentPath) {
    rows.push({
      kind: "current",
      label: `Select ${input.currentPath}`,
      path: input.currentPath,
    });
  }
  if (input.parentPath) {
    rows.push({
      kind: "parent",
      label: "Parent directory",
      path: input.parentPath,
    });
  }
  for (const entry of input.entries) {
    rows.push({
      kind: "child",
      label: entry.name,
      path: entry.path,
    });
  }
  return rows;
}

function basename(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  const name = lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
  return name || path;
}
