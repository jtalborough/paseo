import { describe, expect, it } from "vitest";

import { linksToText, textToLinks } from "./task-links";

describe("task link text mapping", () => {
  it("round-trips links as newline text", () => {
    expect(linksToText(["./docs/spec.md", "https://github.com/org/repo/issues/1"])).toBe(
      "./docs/spec.md\nhttps://github.com/org/repo/issues/1",
    );
  });

  it("normalizes pasted link text", () => {
    expect(textToLinks(" ./docs/spec.md \n\nhttps://example.com\n./docs/spec.md\n")).toEqual([
      "./docs/spec.md",
      "https://example.com",
    ]);
  });
});
