import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  type CreateTaskInput,
  DEFAULT_TASK_CONTEXTS,
  DEFAULT_TASK_TYPES,
  type StoredTask,
  type TaskConfig,
  TaskConfigSchema,
  type TaskFrontmatter,
  TaskFrontmatterSchema,
  type UpdateTaskInput,
} from "@getpaseo/protocol/task/types";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { computeNextDoDate } from "./recurrence.js";

const MAX_COMPLETIONS = 20;

const FRONTMATTER_FENCE = "---";

/** Error thrown when a task file exists but its frontmatter cannot be parsed. */
export class TaskParseError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly cause: unknown,
  ) {
    super(`Failed to parse task file: ${filePath}`);
    this.name = "TaskParseError";
  }
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "task";
}

/**
 * Split a markdown document into its YAML frontmatter and body. Returns the raw
 * frontmatter object (unvalidated) and the remaining markdown.
 */
function splitFrontmatter(content: string): { frontmatter: unknown; body: string } {
  // Normalize CRLF so the fence regex is platform-independent.
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith(`${FRONTMATTER_FENCE}\n`)) {
    return { frontmatter: {}, body: normalized };
  }
  const closingIndex = normalized.indexOf(`\n${FRONTMATTER_FENCE}`, FRONTMATTER_FENCE.length);
  if (closingIndex === -1) {
    return { frontmatter: {}, body: normalized };
  }
  const yamlText = normalized.slice(FRONTMATTER_FENCE.length + 1, closingIndex);
  // Skip the closing fence line plus the conventional blank separator line(s)
  // between the frontmatter and the body.
  const afterFence = normalized.slice(closingIndex + 1 + FRONTMATTER_FENCE.length);
  const body = afterFence.replace(/^\n+/, "");
  return { frontmatter: parseYaml(yamlText) ?? {}, body };
}

/** Serialize a task back into a markdown document with YAML frontmatter. */
function serializeTask(task: StoredTask): string {
  const yamlText = stringifyYaml(task.metadata).trimEnd();
  const body = task.body.length > 0 ? `${task.body.replace(/\s+$/, "")}\n` : "";
  return `${FRONTMATTER_FENCE}\n${yamlText}\n${FRONTMATTER_FENCE}\n\n${body}`;
}

/**
 * File-backed store for Task primitives. One markdown file per task under
 * `$PASEO_HOME/projects/<projectId>/tasks/<id>.md`. The file is the source of
 * truth; the frontmatter is validated with Zod on every read and write.
 */
export class TaskStore {
  constructor(private readonly paseoHome: string) {}

  private tasksDir(projectId: string): string {
    return path.join(this.paseoHome, "projects", projectId, "tasks");
  }

  private filePath(projectId: string, id: string): string {
    return path.join(this.tasksDir(projectId), `${id}.md`);
  }

  private async ensureDir(projectId: string): Promise<void> {
    await mkdir(this.tasksDir(projectId), { recursive: true });
  }

  async list(projectId: string): Promise<StoredTask[]> {
    const dir = this.tasksDir(projectId);
    let entries: string[];
    try {
      entries = (await readdir(dir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
    const tasks = await Promise.all(entries.map((name) => this.readFile(path.join(dir, name))));
    return tasks.sort((left, right) =>
      left.metadata.createdAt.localeCompare(right.metadata.createdAt),
    );
  }

  async get(projectId: string, id: string): Promise<StoredTask | null> {
    try {
      return await this.readFile(this.filePath(projectId, id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async create(input: CreateTaskInput): Promise<StoredTask> {
    const now = new Date().toISOString();
    const id = await this.allocateId(input.project, input.title, now);
    const metadata: TaskFrontmatter = TaskFrontmatterSchema.parse({
      id,
      project: input.project,
      title: input.title,
      actionState: input.actionState ?? "todo",
      run: input.run ?? "self",
      priority: input.priority ?? null,
      type: input.type ?? null,
      people: input.people ?? [],
      context: input.context ?? null,
      attention: input.attention ?? null,
      doDate: input.doDate ?? null,
      recurrence: input.recurrence ?? null,
      remind: input.remind ?? [],
      provider: input.provider ?? null,
      links: input.links ?? [],
      github: input.github ?? null,
      createdAt: now,
      updatedAt: now,
    });
    const task: StoredTask = { metadata, body: input.body ?? "" };
    await this.write(task);
    return task;
  }

  /**
   * Patch a task. Metadata-only updates preserve the markdown body; the body is
   * only rewritten when `body` is explicitly provided.
   */
  async update(projectId: string, id: string, patch: UpdateTaskInput): Promise<StoredTask> {
    const existing = await this.get(projectId, id);
    if (!existing) {
      throw new Error(`Task not found: ${projectId}/${id}`);
    }
    const now = new Date().toISOString();
    let metadata: TaskFrontmatter = TaskFrontmatterSchema.parse({
      ...existing.metadata,
      ...stripUndefined({
        title: patch.title,
        actionState: patch.actionState,
        run: patch.run,
        priority: patch.priority,
        type: patch.type,
        people: patch.people,
        context: patch.context,
        attention: patch.attention,
        doDate: patch.doDate,
        recurrence: patch.recurrence,
        remind: patch.remind,
        provider: patch.provider,
        links: patch.links,
        github: patch.github,
        agentId: patch.agentId,
        worktree: patch.worktree,
        lastRunAt: patch.lastRunAt,
        result: patch.result,
        lastCompletedAt: patch.lastCompletedAt,
        completions: patch.completions,
      }),
      updatedAt: now,
    });

    // Recurring task completed → reschedule in place (reset to ToDo, advance
    // doDate) and record the completion. The daemon owns this so it is
    // consistent across the UI, mobile, scripts, and agents.
    const justCompleted =
      existing.metadata.actionState !== "done" && metadata.actionState === "done";
    if (justCompleted && metadata.recurrence) {
      const nextDoDate = computeNextDoDate(metadata.recurrence, {
        doDate: existing.metadata.doDate,
        completedAt: now,
      });
      metadata = TaskFrontmatterSchema.parse({
        ...metadata,
        actionState: "todo",
        doDate: nextDoDate,
        lastCompletedAt: now,
        completions: [...existing.metadata.completions, now].slice(-MAX_COMPLETIONS),
      });
    }

    const task: StoredTask = {
      metadata,
      body: patch.body ?? existing.body,
    };
    await this.write(task);
    return task;
  }

  async delete(projectId: string, id: string): Promise<void> {
    await rm(this.filePath(projectId, id), { force: true });
  }

  private configPath(projectId: string): string {
    return path.join(this.tasksDir(projectId), "task-config.json");
  }

  /** Editable Type/People option lists for a project; defaults when absent. */
  async getConfig(projectId: string): Promise<TaskConfig> {
    try {
      const content = await readFile(this.configPath(projectId), "utf-8");
      return TaskConfigSchema.parse(JSON.parse(content));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { types: [...DEFAULT_TASK_TYPES], people: [], contexts: [...DEFAULT_TASK_CONTEXTS] };
      }
      throw error;
    }
  }

  async updateConfig(projectId: string, config: TaskConfig): Promise<TaskConfig> {
    const parsed = TaskConfigSchema.parse(config);
    await this.ensureDir(projectId);
    const target = this.configPath(projectId);
    const tempPath = path.join(
      path.dirname(target),
      `.task-config.tmp-${process.pid}-${randomBytes(6).toString("hex")}`,
    );
    await writeFile(tempPath, JSON.stringify(parsed, null, 2), "utf-8");
    await rename(tempPath, target);
    return parsed;
  }

  private async readFile(filePath: string): Promise<StoredTask> {
    const content = await readFile(filePath, "utf-8");
    const { frontmatter, body } = splitFrontmatter(content);
    try {
      const metadata = TaskFrontmatterSchema.parse(frontmatter);
      return { metadata, body };
    } catch (error) {
      throw new TaskParseError(filePath, error);
    }
  }

  private async write(task: StoredTask): Promise<void> {
    await this.ensureDir(task.metadata.project);
    const target = this.filePath(task.metadata.project, task.metadata.id);
    const tempPath = path.join(
      path.dirname(target),
      `.task.tmp-${process.pid}-${randomBytes(6).toString("hex")}`,
    );
    await writeFile(tempPath, serializeTask(task), "utf-8");
    await rename(tempPath, target);
  }

  /** Produce a unique `<YYYY-MM-DD>-<slug>` id, suffixing on collision. */
  private async allocateId(projectId: string, title: string, nowIso: string): Promise<string> {
    const datePrefix = nowIso.slice(0, 10);
    const base = `${datePrefix}-${slugify(title)}`;
    if (!(await this.get(projectId, base))) {
      return base;
    }
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = `${base}-${randomBytes(2).toString("hex")}`;
      if (!(await this.get(projectId, candidate))) {
        return candidate;
      }
    }
    throw new Error(`Could not allocate a unique task id for "${title}"`);
  }
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key as keyof T] = entry as T[keyof T];
    }
  }
  return result;
}
