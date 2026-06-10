import { describe, expect, it } from "vitest";

import { remindersToText, textToReminders } from "./task-reminders";

describe("task reminder text mapping", () => {
  it("round-trips reminders as newline text", () => {
    expect(remindersToText(["-3d", "2026-06-14T09:00"])).toBe("-3d\n2026-06-14T09:00");
  });

  it("normalizes pasted reminder text", () => {
    expect(textToReminders(" -3d \n\n-1h\n-3d\n")).toEqual(["-3d", "-1h"]);
  });
});
