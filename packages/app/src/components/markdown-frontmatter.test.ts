import { describe, expect, it } from "vitest";
import { joinFrontmatter, splitFrontmatter } from "@/components/markdown-frontmatter";

describe("splitFrontmatter", () => {
  it("splits a YAML frontmatter block off the body", () => {
    const content = "---\ntitle: Hello\ntags: [a, b]\n---\n\n# Body\n\ntext\n";
    const { frontmatter, body } = splitFrontmatter(content);
    expect(frontmatter).toBe("---\ntitle: Hello\ntags: [a, b]\n---\n");
    expect(body).toBe("\n# Body\n\ntext\n");
  });

  it("splits a TOML (+++) frontmatter block", () => {
    const content = "+++\ntitle = 'Hi'\n+++\nbody";
    const { frontmatter, body } = splitFrontmatter(content);
    expect(frontmatter).toBe("+++\ntitle = 'Hi'\n+++\n");
    expect(body).toBe("body");
  });

  it("handles an empty frontmatter block", () => {
    const { frontmatter, body } = splitFrontmatter("---\n---\nbody");
    expect(frontmatter).toBe("---\n---\n");
    expect(body).toBe("body");
  });

  it("tolerates a leading BOM", () => {
    const { frontmatter, body } = splitFrontmatter("﻿---\na: 1\n---\nx");
    expect(frontmatter).toBe("﻿---\na: 1\n---\n");
    expect(body).toBe("x");
  });

  it("returns no frontmatter when there is none", () => {
    const content = "# Just a heading\n\nbody\n";
    expect(splitFrontmatter(content)).toEqual({ frontmatter: "", body: content });
  });

  it("does not swallow an unterminated opening fence", () => {
    const content = "---\ntitle: no close\n\n# body";
    expect(splitFrontmatter(content)).toEqual({ frontmatter: "", body: content });
  });

  it("does not treat a mid-document rule as frontmatter", () => {
    const content = "intro\n\n---\n\nmore";
    expect(splitFrontmatter(content)).toEqual({ frontmatter: "", body: content });
  });

  it("does not close a +++ block with a --- fence", () => {
    // `---` is a thematic break inside a TOML block, not a closing fence.
    const content = "+++\na = 1\n+++\nbody\n---\nafter";
    const { frontmatter } = splitFrontmatter(content);
    expect(frontmatter).toBe("+++\na = 1\n+++\n");
  });

  it("round-trips via joinFrontmatter", () => {
    const content = "---\nk: v\n---\n\n# Title\n\nbody\n";
    const { frontmatter, body } = splitFrontmatter(content);
    expect(joinFrontmatter(frontmatter, body)).toBe(content);
  });
});
