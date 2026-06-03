import { describe, expect, test } from "vitest";
import { computeGitGraph } from "./git-graph";

describe("computeGitGraph", () => {
  test("linear history stays in a single lane", () => {
    const { rows, laneCount } = computeGitGraph([
      { sha: "c", parents: ["b"] },
      { sha: "b", parents: ["a"] },
      { sha: "a", parents: [] },
    ]);

    expect(laneCount).toBe(1);
    expect(rows.map((r) => r.nodeCol)).toEqual([0, 0, 0]);
    // Root commit has no parents, so no bottom-half segment leaves it.
    expect(rows[2].segments.some((s) => s.y2 === 1)).toBe(false);
  });

  test("a merge commit converges two lanes onto its node", () => {
    // m merges feature(b) into main(a); both descend from base(z).
    const { rows, laneCount } = computeGitGraph([
      { sha: "m", parents: ["a", "b"] },
      { sha: "a", parents: ["z"] },
      { sha: "b", parents: ["z"] },
      { sha: "z", parents: [] },
    ]);

    expect(laneCount).toBeGreaterThanOrEqual(2);
    // The merge node sits in lane 0 and forks a second lane for the 2nd parent.
    expect(rows[0].nodeCol).toBe(0);
    expect(rows[0].segments.some((s) => s.x1 === 0 && s.x2 === 1 && s.y2 === 1)).toBe(true);
    // z is reached by two lanes that converge (both draw into z's node from above).
    const zRow = rows[3];
    const incomingToZ = zRow.segments.filter((s) => s.y1 === 0 && s.x2 === zRow.nodeCol);
    expect(incomingToZ.length).toBeGreaterThanOrEqual(2);
  });

  test("every non-root commit emits an outgoing segment to a parent lane", () => {
    const { rows } = computeGitGraph([
      { sha: "c", parents: ["b"] },
      { sha: "b", parents: ["a"] },
      { sha: "a", parents: [] },
    ]);

    expect(rows[0].segments.some((s) => s.y1 === 0.5 && s.y2 === 1)).toBe(true);
    expect(rows[1].segments.some((s) => s.y1 === 0.5 && s.y2 === 1)).toBe(true);
  });
});
