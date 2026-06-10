import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getAgentsSkillsDir,
  getBundledSkillsDir,
  getClaudeSkillsDir,
  getCodexSkillsDir,
} from "./paths.js";
import { listFilesRecursive, removeSkill, syncSkills } from "./sync.js";

export type SkillsState = "not-installed" | "up-to-date" | "drift";

export type SkillOp =
  | { kind: "add"; name: string }
  | { kind: "update"; name: string }
  | { kind: "delete"; name: string };

export interface SkillsStatus {
  state: SkillsState;
  ops: SkillOp[];
}

export interface SkillTargets {
  sourceDir: string;
  agentsDir: string;
  claudeDir: string;
  codexDir: string;
}

// Skills we used to ship and want gone from disk if a prior install left them.
// The active set is discovered by scanning the bundle (see managedSkillNames),
// so adding a new skill folder auto-registers it — no edit here. Tombstones only
// cover renamed/removed skills that a directory scan can no longer see.
export const RETIRED_PASEO_SKILL_NAMES = ["paseo-chat", "paseo-orchestrator"] as const;

/** Skill folders in `sourceDir` (a dir is a skill iff it contains SKILL.md). */
async function discoverBundledSkillNames(sourceDir: string): Promise<string[]> {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true }).catch(() => []);
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const hasSkillMd = await fs
      .access(path.join(sourceDir, entry.name, "SKILL.md"))
      .then(() => true)
      .catch(() => false);
    if (hasSkillMd) names.push(entry.name);
  }
  return names;
}

/**
 * The full set of names this installer is allowed to touch: the currently
 * bundled skills plus retired tombstones. Anything outside this set (third-party
 * skills the user dropped into ~/.claude/skills etc.) is never read or removed.
 */
async function managedSkillNames(sourceDir: string): Promise<string[]> {
  const discovered = await discoverBundledSkillNames(sourceDir);
  return [...new Set([...discovered, ...RETIRED_PASEO_SKILL_NAMES])].sort(compareStrings);
}

type SkillFiles = Map<string, string>;
type TargetSkills = Map<string, SkillFiles>;

function resolveSkillTargets(): SkillTargets {
  return {
    sourceDir: getBundledSkillsDir(),
    agentsDir: getAgentsSkillsDir(),
    claudeDir: getClaudeSkillsDir(),
    codexDir: getCodexSkillsDir(),
  };
}

async function hashSkillDir(skillDir: string): Promise<SkillFiles | null> {
  const stat = await fs.stat(skillDir).catch(() => null);
  if (!stat?.isDirectory()) return null;

  const rels = await listFilesRecursive(skillDir);
  const files: SkillFiles = new Map();
  for (const rel of rels) {
    const buf = await fs.readFile(path.join(skillDir, rel));
    const sha = createHash("sha256").update(buf).digest("hex");
    files.set(toPosix(rel), sha);
  }
  return files;
}

async function hashSkills(
  rootDir: string,
  names: readonly string[],
): Promise<Map<string, SkillFiles>> {
  const out = new Map<string, SkillFiles>();
  for (const name of names) {
    const files = await hashSkillDir(path.join(rootDir, name));
    if (files !== null) out.set(name, files);
  }
  return out;
}

function diff(
  bundle: TargetSkills,
  disks: readonly TargetSkills[],
  names: readonly string[],
): SkillOp[] {
  const ops: SkillOp[] = [];
  for (const name of names) {
    const b = bundle.get(name);
    const targetFiles = disks.map((disk) => disk.get(name));
    const installedTargets = targetFiles.filter(
      (files): files is SkillFiles => files !== undefined,
    );
    if (b) {
      const missingTargets = installedTargets.length < disks.length;
      const changedTargets = installedTargets.some((files) => !bundleFilesMatch(b, files));
      if (missingTargets) ops.push({ kind: "add", name });
      else if (changedTargets) ops.push({ kind: "update", name });
    } else if (installedTargets.length > 0) {
      ops.push({ kind: "delete", name });
    }
  }
  ops.sort((a, b) => compareStrings(a.name, b.name));
  return ops;
}

function hasInstalledPaseoSkill(disks: readonly TargetSkills[]): boolean {
  return disks.some((disk) => disk.size > 0);
}

function bundleFilesMatch(bundle: SkillFiles, disk: SkillFiles): boolean {
  for (const [rel, sha] of bundle) {
    if (disk.get(rel) !== sha) return false;
  }
  return true;
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export async function getSkillsStatus(targets?: SkillTargets): Promise<SkillsStatus> {
  const t = targets ?? resolveSkillTargets();
  const names = await managedSkillNames(t.sourceDir);
  const [bundle, agentsDisk, claudeDisk, codexDisk] = await Promise.all([
    hashSkills(t.sourceDir, names),
    hashSkills(t.agentsDir, names),
    hashSkills(t.claudeDir, names),
    hashSkills(t.codexDir, names),
  ]);
  const disks = [agentsDisk, claudeDisk, codexDisk];
  const ops = diff(bundle, disks, names);

  if (!hasInstalledPaseoSkill(disks)) return { state: "not-installed", ops };
  if (ops.length === 0) return { state: "up-to-date", ops };
  return { state: "drift", ops };
}

async function applySkills(
  targets: SkillTargets,
  initialStatus?: SkillsStatus,
): Promise<SkillsStatus> {
  const status = initialStatus ?? (await getSkillsStatus(targets));

  const writes = status.ops
    .filter((op) => op.kind === "add" || op.kind === "update")
    .map((op) => op.name);
  if (writes.length > 0) {
    await syncSkills({
      sourceDir: targets.sourceDir,
      agentsDir: targets.agentsDir,
      claudeDir: targets.claudeDir,
      codexDir: targets.codexDir,
      skillNames: writes,
    });
  }

  for (const op of status.ops) {
    if (op.kind !== "delete") continue;
    await removeSkill(op.name, {
      agentsDir: targets.agentsDir,
      claudeDir: targets.claudeDir,
      codexDir: targets.codexDir,
    });
  }

  return getSkillsStatus(targets);
}

export async function installSkills(targets?: SkillTargets): Promise<SkillsStatus> {
  return applySkills(targets ?? resolveSkillTargets());
}

export async function updateSkills(targets?: SkillTargets): Promise<SkillsStatus> {
  return applySkills(targets ?? resolveSkillTargets());
}

export async function autoUpdateInstalledSkills(targets?: SkillTargets): Promise<SkillsStatus> {
  const t = targets ?? resolveSkillTargets();
  const status = await getSkillsStatus(t);
  if (status.state !== "drift") return status;
  return applySkills(t, status);
}

export async function uninstallSkills(targets?: SkillTargets): Promise<SkillsStatus> {
  const t = targets ?? resolveSkillTargets();
  for (const name of await managedSkillNames(t.sourceDir)) {
    await removeSkill(name, {
      agentsDir: t.agentsDir,
      claudeDir: t.claudeDir,
      codexDir: t.codexDir,
    });
  }
  return getSkillsStatus(t);
}
