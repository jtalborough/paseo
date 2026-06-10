#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  usage(0);
}

const paseoHome = args.paseoHome ?? process.env.PASEO_HOME ?? path.join(os.homedir(), ".paseo");
const projectsRoot = path.join(paseoHome, "projects");
const projectGroupIds = args.projectGroupId
  ? [args.projectGroupId]
  : await listProjectGroupIds(projectsRoot);
const results = [];

for (const projectGroupId of projectGroupIds) {
  const tasksDir = path.join(projectsRoot, projectGroupId, "tasks");
  const names = await readdir(tasksDir).catch(() => []);
  for (const name of names) {
    if (!name.endsWith(".md") || name === "README.md") continue;
    const file = path.join(tasksDir, name);
    const task = await readTask(file);
    if (task.sources.length > 0) {
      results.push({ projectGroupId, file, ...task });
    }
  }
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);

async function listProjectGroupIds(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("grp_"))
    .map((entry) => entry.name);
}

async function readTask(file) {
  const raw = await readFile(file, "utf8");
  const frontmatter = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return {
    id: scalar(frontmatter, "id"),
    title: scalar(frontmatter, "title"),
    actionState: scalar(frontmatter, "actionState"),
    sources: notionSources(frontmatter),
  };
}

function notionSources(frontmatter) {
  const lines = frontmatter.split("\n");
  const sources = [];
  let source = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "- kind: notion" || trimmed === "kind: notion") {
      source = { kind: "notion" };
      sources.push(source);
      continue;
    }
    if (!source) continue;
    const match = trimmed.match(
      /^(pageId|url|dataSourceId|database|importedAt|lastMirroredAt):\s*(.*)$/,
    );
    if (match) {
      source[match[1]] = normalizeScalar(match[2]);
    } else if (trimmed.startsWith("- kind:") || /^[a-zA-Z][\w-]*:/.test(trimmed)) {
      source = null;
    }
  }

  return sources;
}

function scalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${escapeRegExp(key)}:\\s*(.*)$`, "m"));
  return match ? normalizeScalar(match[1]) : null;
}

function normalizeScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "null" || trimmed === "~") return null;
  return trimmed.replace(/^["']|["']$/g, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--project-group-id") {
      parsed.projectGroupId = argv[++index];
    } else if (arg === "--paseo-home") {
      parsed.paseoHome = argv[++index];
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage(2);
    }
  }
  return parsed;
}

function usage(code) {
  console.error(`Usage:
  node list-notion-task-sources.mjs [--project-group-id grp_...] [--paseo-home ~/.paseo]`);
  process.exit(code);
}
