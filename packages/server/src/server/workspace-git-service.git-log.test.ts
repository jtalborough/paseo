import { describe, expect, test, vi } from "vitest";
import { WorkspaceGitServiceImpl } from "./workspace-git-service.js";

const REPO_CWD = "/tmp/repo";
// git log emits fields separated by NUL (%x00 in the --format string); use an
// explicit escape here so this source file stays plain text.
const NUL = "\u0000";

function createLogger() {
  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
    child: () => logger,
  };
  return logger;
}

function gitResult(stdout: string) {
  return { stdout, stderr: "", truncated: false, exitCode: 0, signal: null };
}

function logRecord(fields: string[]) {
  return `${fields.join(NUL)}\n`;
}

function createService(overrides: Record<string, unknown>) {
  return new WorkspaceGitServiceImpl({
    logger: createLogger() as never,
    paseoHome: "/tmp/paseo-test",
    deps: overrides as never,
  });
}

describe("WorkspaceGitServiceImpl git log", () => {
  test("listGitLog parses NUL-delimited records and reports hasMore", async () => {
    const logOutput =
      logRecord([
        "abc123fullsha",
        "abc123",
        "Ada",
        "2026-01-02T03:04:05Z",
        "parent1 parent2",
        "HEAD -> main, origin/main, tag: v1.0",
        "Add feature",
      ]) +
      logRecord([
        "def456fullsha",
        "def456",
        "Grace",
        "2026-01-01T00:00:00Z",
        "",
        "",
        "Initial commit",
      ]);
    const runGitCommand = vi.fn(async () => gitResult(logOutput));
    const service = createService({ runGitCommand });

    const result = await service.listGitLog(REPO_CWD, { limit: 2, skip: 0 });

    expect(result.hasMore).toBe(true);
    expect(result.commits).toEqual([
      {
        sha: "abc123fullsha",
        shortSha: "abc123",
        author: "Ada",
        authoredAt: "2026-01-02T03:04:05Z",
        parents: ["parent1", "parent2"],
        refs: ["main", "origin/main", "v1.0"],
        subject: "Add feature",
      },
      {
        sha: "def456fullsha",
        shortSha: "def456",
        author: "Grace",
        authoredAt: "2026-01-01T00:00:00Z",
        parents: [],
        refs: [],
        subject: "Initial commit",
      },
    ]);

    service.dispose();
  });

  test("listGitLog reports hasMore=false when fewer rows than the limit return", async () => {
    const runGitCommand = vi.fn(async () =>
      gitResult(logRecord(["sha1", "sha1", "Ada", "2026-01-02T03:04:05Z", "", "", "Only commit"])),
    );
    const service = createService({ runGitCommand });

    const result = await service.listGitLog(REPO_CWD, { limit: 100, skip: 0 });

    expect(result.hasMore).toBe(false);
    expect(result.commits).toHaveLength(1);

    service.dispose();
  });

  test("getCommitDiff delegates to the diff dependency and returns structured files", async () => {
    const getCommitDiff = vi.fn(async () => ({
      diff: "diff",
      structured: [
        {
          path: "src/index.ts",
          isNew: false,
          isDeleted: false,
          additions: 3,
          deletions: 1,
          hunks: [],
        },
      ],
    }));
    const service = createService({ getCommitDiff });

    const result = await service.getCommitDiff(REPO_CWD, "abc123");

    expect(getCommitDiff).toHaveBeenCalledWith(
      REPO_CWD,
      "abc123",
      expect.objectContaining({ paseoHome: "/tmp/paseo-test" }),
    );
    expect(result.structured).toHaveLength(1);

    service.dispose();
  });
});
