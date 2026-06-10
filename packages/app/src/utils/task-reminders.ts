export function remindersToText(reminders: string[]): string {
  return reminders.join("\n");
}

export function textToReminders(value: string): string[] {
  const seen = new Set<string>();
  const reminders: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    reminders.push(trimmed);
  }
  return reminders;
}
