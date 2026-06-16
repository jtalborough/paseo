export type ProjectLineageTemplateKind = "goal" | "thread";

interface ProjectLineageTemplateInput {
  id: string;
  createdAt: string;
}

function slugifyFilePart(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "untitled"
  );
}

export function buildProjectLineageFileName(input: {
  kind: ProjectLineageTemplateKind;
  now: Date;
  title?: string | null;
}): string {
  const datePart = input.now.toISOString().slice(0, 10);
  const timePart = input.now.toISOString().slice(11, 19).replace(/:/g, "");
  const titlePart = slugifyFilePart(input.title ?? input.kind);
  return `${datePart}-${timePart}-${titlePart}.md`;
}

export function buildProjectLineageTemplate(
  kind: ProjectLineageTemplateKind,
  input: ProjectLineageTemplateInput,
): string {
  return kind === "goal" ? buildGoalTemplate(input) : buildThreadTemplate(input);
}

function buildGoalTemplate(input: ProjectLineageTemplateInput): string {
  return `---
id: ${input.id}
status: active
owner: ""
createdAt: ${input.createdAt}
relatedThreads: []
---

# New Goal

## Outcome


## Acceptance Criteria

- [ ] 

## Threads

- 

## Evidence

- 
`;
}

function buildThreadTemplate(input: ProjectLineageTemplateInput): string {
  return `---
id: ${input.id}
goalId: ""
status: active
taskIds: []
agentRunIds: []
decisionIds: []
evidenceIds: []
createdAt: ${input.createdAt}
---

# New Thread

## Context


## Work Trail

- ${input.createdAt}: Thread created.

## Decisions

- 

## Evidence

- 

## Role Memory Updates

- 
`;
}
