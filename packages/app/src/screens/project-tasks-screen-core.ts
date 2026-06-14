import type { ProjectAgentProfileEntry } from "@getpaseo/client/internal/daemon-client";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import type { StoredTask } from "@getpaseo/protocol/task/types";
import type { SelectOption } from "@/components/task-select";

export function upsertTaskInList(
  current: StoredTask[] | undefined,
  task: StoredTask,
): StoredTask[] {
  const tasks = current ?? [];
  const index = tasks.findIndex((candidate) => candidate.metadata.id === task.metadata.id);
  if (index === -1) {
    return [...tasks, task];
  }
  return tasks.map((candidate, candidateIndex) => (candidateIndex === index ? task : candidate));
}

export function upsertScheduleInList(
  current: ScheduleSummary[] | undefined,
  schedule: ScheduleSummary,
): ScheduleSummary[] {
  const schedules = current ?? [];
  const index = schedules.findIndex((candidate) => candidate.id === schedule.id);
  if (index === -1) {
    return [...schedules, schedule];
  }
  return schedules.map((candidate, candidateIndex) =>
    candidateIndex === index ? schedule : candidate,
  );
}

export function buildTaskAgentOptions(input: {
  providerEntries: ProviderSnapshotEntry[];
  profiles: ProjectAgentProfileEntry[];
  tasks: StoredTask[];
}): SelectOption[] {
  const options: SelectOption[] = [];
  for (const entry of input.profiles) {
    const value = formatProviderModelValue(entry.profile.provider, entry.profile.model);
    if (value) {
      options.push({
        value,
        label: `${entry.profile.name} - ${value}`,
      });
    }
  }
  for (const entry of input.providerEntries) {
    if (entry.status !== "ready") {
      continue;
    }
    const providerLabel = entry.label ?? entry.provider;
    const models = entry.models ?? [];
    if (models.length === 0) {
      options.push({ value: entry.provider, label: `${providerLabel} default` });
      continue;
    }
    for (const model of models) {
      const value = formatProviderModelValue(entry.provider, model.id);
      if (value) {
        options.push({
          value,
          label: `${providerLabel} / ${model.label ?? model.id}`,
        });
      }
    }
  }
  for (const task of input.tasks) {
    const value = task.metadata.provider?.trim();
    if (value) {
      options.push({ value, label: value });
    }
  }
  return dedupeSelectOptions(options);
}

function formatProviderModelValue(provider?: string | null, model?: string | null): string | null {
  const normalizedProvider = provider?.trim();
  const normalizedModel = model?.trim();
  if (!normalizedProvider) {
    return null;
  }
  if (!normalizedModel || normalizedModel === "default") {
    return normalizedProvider;
  }
  return `${normalizedProvider}/${normalizedModel}`;
}

function dedupeSelectOptions(options: SelectOption[]): SelectOption[] {
  const seen = new Set<string>();
  const deduped: SelectOption[] = [];
  for (const option of options) {
    if (!seen.has(option.value)) {
      seen.add(option.value);
      deduped.push(option);
    }
  }
  return deduped;
}
