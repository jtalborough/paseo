import { describe, expect, it } from "vitest";
import {
  buildProjectLineageFileName,
  buildProjectLineageTemplate,
} from "./project-files-screen-core";

describe("Project lineage file helpers", () => {
  it("builds stable markdown filenames from kind, time, and title", () => {
    expect(
      buildProjectLineageFileName({
        kind: "goal",
        now: new Date("2026-06-16T11:22:33.000Z"),
        title: "Ship Goals & Threads!",
      }),
    ).toBe("2026-06-16-112233-ship-goals-threads.md");
  });

  it("builds goal and thread templates with lineage frontmatter", () => {
    expect(
      buildProjectLineageTemplate("goal", {
        id: "goal_20260616",
        createdAt: "2026-06-16T11:22:33.000Z",
      }),
    ).toContain("relatedThreads: []");

    expect(
      buildProjectLineageTemplate("thread", {
        id: "thread_20260616",
        createdAt: "2026-06-16T11:22:33.000Z",
      }),
    ).toContain("taskIds: []");
  });
});
