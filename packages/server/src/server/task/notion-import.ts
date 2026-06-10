import type {
  ActionState,
  CreateTaskInput,
  Recurrence,
  TaskAttention,
  TaskPriority,
} from "@getpaseo/protocol/task/types";

type WeeklyWeekday = Extract<Recurrence, { kind: "weekly" }>["weekdays"][number];

export interface NotionTaskImportInput {
  projectGroupId: string;
  title?: string | null;
  task?: string | null;
  status?: string | null;
  actionState?: string | null;
  doDate?: string | null;
  recurrence?: string[] | string | null;
  priority?: string | null;
  attention?: string | null;
  people?: string[];
  location?: string | null;
  type?: string | null;
  agents?: string[];
  url: string;
  pageId?: string | null;
  dataSourceId?: string | null;
  body?: string | null;
  links?: string[];
  github?: string | null;
  importedAt?: string | null;
}

const WEEKDAY_BY_LABEL: Record<string, WeeklyWeekday> = {
  mon: "mon",
  monday: "mon",
  tue: "tue",
  tues: "tue",
  tuesday: "tue",
  wed: "wed",
  wednesday: "wed",
  thu: "thu",
  thur: "thu",
  thurs: "thu",
  thursday: "thu",
  fri: "fri",
  friday: "fri",
  sat: "sat",
  saturday: "sat",
  sun: "sun",
  sunday: "sun",
};

export function createTaskInputFromNotion(input: NotionTaskImportInput): CreateTaskInput {
  const title = firstNonEmpty(input.title, input.task);
  if (!title) {
    throw new Error("Notion task import requires a title or task name");
  }

  const provider = normalizeProvider(input.agents);
  const links = [...(input.links ?? [])];
  if (!links.includes(input.url)) {
    links.push(input.url);
  }

  return {
    projectGroupId: input.projectGroupId,
    title,
    actionState: normalizeActionState(input.actionState ?? input.status),
    priority: normalizePriority(input.priority),
    attention: normalizeAttention(input.attention),
    doDate: normalizeNullable(input.doDate),
    recurrence: normalizeRecurrence(input.recurrence),
    people: input.people ?? [],
    context: normalizeNullable(input.location),
    type: normalizeNullable(input.type),
    provider,
    links,
    github: normalizeNullable(input.github),
    body: input.body ?? undefined,
    sources: [
      {
        kind: "notion",
        pageId: normalizeNullable(input.pageId),
        url: input.url,
        dataSourceId: normalizeNullable(input.dataSourceId),
        database: "tasks",
        importedAt: input.importedAt ?? new Date().toISOString(),
        lastMirroredAt: null,
      },
    ],
  };
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeNullable(value);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeNullable(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[_/]+/g, "-").replace(/\s+/g, "-");
}

function normalizeActionState(value: string | null | undefined): ActionState {
  const token = value ? normalizeToken(value) : "";
  switch (token) {
    case "waiting":
    case "on-hold":
    case "hold":
      return "waiting";
    case "review":
    case "info":
    case "idea":
    case "needs-j-decision":
      return "info";
    case "schedule":
    case "park":
    case "someday":
    case "someday-maybe":
      return "someday";
    case "dropped":
    case "drop":
      return "dropped";
    case "done":
    case "drop-done":
    case "complete":
      return "done";
    default:
      return "todo";
  }
}

function normalizePriority(value: string | null | undefined): TaskPriority | null {
  const token = value ? normalizeToken(value) : "";
  if (token === "now" || token === "high") return "high";
  if (token === "medium") return "medium";
  if (token === "low") return "low";
  return null;
}

function normalizeAttention(value: string | null | undefined): TaskAttention | null {
  const token = value ? normalizeToken(value) : "";
  if (token === "full") return "full";
  if (token === "medium") return "medium";
  if (token === "minimal") return "minimal";
  return null;
}

function normalizeProvider(values: string[] | undefined): string | null {
  const first = values?.map(normalizeNullable).find(Boolean) ?? null;
  if (!first) return null;
  const token = normalizeToken(first);
  if (token.includes("codex")) return "codex";
  if (token.includes("claude")) return "claude";
  if (token.includes("opencode")) return "opencode";
  if (token.includes("copilot")) return "copilot";
  return first;
}

function normalizeRecurrence(value: string[] | string | null | undefined): Recurrence | null {
  let labels: string[] = [];
  if (Array.isArray(value)) {
    labels = value;
  } else if (value) {
    labels = [value];
  }
  const tokens = labels.map(normalizeToken).filter(Boolean);
  const weekdays = Array.from(
    new Set(
      tokens
        .map((token) => token.match(/(?:^|-)weekly-([a-z]+)$/)?.[1] ?? token)
        .map((token) => WEEKDAY_BY_LABEL[token])
        .filter(isWeeklyWeekday),
    ),
  );
  if (weekdays.length > 0) {
    return { kind: "weekly", weekdays };
  }

  for (const token of tokens) {
    const parsed = parseRelativeRecurrence(token);
    if (parsed) return parsed;
  }

  return null;
}

function isWeeklyWeekday(value: WeeklyWeekday | undefined): value is WeeklyWeekday {
  return Boolean(value);
}

function parseRelativeRecurrence(token: string): Recurrence | null {
  const match = token.match(/(?:^|-)rec(?:urring)?(?:-relative)?-(\d+)([dwmy])$/);
  if (!match) return null;
  const every = Number(match[1]);
  const unitToken = match[2];
  if (!Number.isInteger(every) || every <= 0) return null;
  const unit = parseRelativeUnit(unitToken);
  return { kind: "relative", every, unit, from: "scheduled" };
}

function parseRelativeUnit(token: string): Extract<Recurrence, { kind: "relative" }>["unit"] {
  switch (token) {
    case "d":
      return "day";
    case "w":
      return "week";
    case "m":
      return "month";
    default:
      return "year";
  }
}
