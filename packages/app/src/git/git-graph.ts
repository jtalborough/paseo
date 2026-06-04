// Commit-graph (DAG) lane layout. Given commits in git-log order (newest first),
// each carrying its parent shas, assign every commit to a column ("lane") and
// emit the line segments needed to draw the graph — straight verticals for lanes
// passing through a row, and curves where a branch forks or a merge converges.
//
// The algorithm keeps a mutable array of lanes; each slot holds the sha of the
// commit that lane is currently waiting to reach. Lane indices are stable (never
// compacted) which keeps the layout simple and the lines from jittering.

export interface GraphCommitInput {
  sha: string;
  parents: string[];
}

export interface GraphSegment {
  // Lane-space x (column index, may be fractional only at endpoints) and
  // normalized y within the row: 0 = top edge, 0.5 = node center, 1 = bottom edge.
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface GraphRow {
  nodeCol: number;
  nodeColor: string;
  segments: GraphSegment[];
}

export interface GitGraphLayout {
  rows: GraphRow[];
  laneCount: number;
}

// Distinct, readable lane colors. Index-based assignment (lane N → palette[N]).
export const GIT_GRAPH_LANE_COLORS = [
  "#4e9bff",
  "#f5a623",
  "#7ed321",
  "#bd10e0",
  "#e0518a",
  "#50e3c2",
  "#b8e986",
  "#f8e71c",
];

function colorForLane(lane: number): string {
  return GIT_GRAPH_LANE_COLORS[lane % GIT_GRAPH_LANE_COLORS.length];
}

function firstFreeLane(lanes: (string | null)[]): number {
  const idx = lanes.indexOf(null);
  if (idx !== -1) {
    return idx;
  }
  lanes.push(null);
  return lanes.length - 1;
}

export function computeGitGraph(commits: GraphCommitInput[]): GitGraphLayout {
  const lanes: (string | null)[] = [];
  const rows: GraphRow[] = [];
  let laneCount = 0;

  for (const commit of commits) {
    const lanesIn = lanes.slice();

    // Lanes already pointing at this commit converge on its node.
    const incoming: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === commit.sha) {
        incoming.push(i);
      }
    }

    const nodeCol = incoming.length > 0 ? incoming[0] : firstFreeLane(lanes);

    // Free every incoming lane; the node reabsorbs them.
    for (const i of incoming) {
      lanes[i] = null;
    }

    // Route the commit's parents into lanes. First parent continues the node's
    // lane; extra parents (a merge) fork into existing or fresh lanes.
    const outgoing = new Set<number>();
    if (commit.parents.length > 0) {
      lanes[nodeCol] = commit.parents[0];
      outgoing.add(nodeCol);
      for (let p = 1; p < commit.parents.length; p++) {
        const parent = commit.parents[p];
        let lane = lanes.indexOf(parent);
        if (lane === -1) {
          lane = firstFreeLane(lanes);
          lanes[lane] = parent;
        }
        outgoing.add(lane);
      }
    }

    const lanesOut = lanes.slice();
    const segments: GraphSegment[] = [];

    // Top half: connections entering this row from above.
    for (let i = 0; i < lanesIn.length; i++) {
      const value = lanesIn[i];
      if (value === null) {
        continue;
      }
      if (value === commit.sha) {
        segments.push({ x1: i, y1: 0, x2: nodeCol, y2: 0.5, color: colorForLane(i) });
      } else {
        segments.push({ x1: i, y1: 0, x2: i, y2: 0.5, color: colorForLane(i) });
      }
    }

    // Bottom half: connections leaving this row toward the next.
    for (let i = 0; i < lanesOut.length; i++) {
      const value = lanesOut[i];
      if (value === null) {
        continue;
      }
      if (outgoing.has(i)) {
        segments.push({ x1: nodeCol, y1: 0.5, x2: i, y2: 1, color: colorForLane(i) });
      } else {
        segments.push({ x1: i, y1: 0.5, x2: i, y2: 1, color: colorForLane(i) });
      }
    }

    rows.push({ nodeCol, nodeColor: colorForLane(nodeCol), segments });
    laneCount = Math.max(laneCount, lanesIn.length, lanesOut.length);
  }

  return { rows, laneCount };
}
