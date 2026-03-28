import process from "node:process";

async function main() {
  let workspaceBoard;

  try {
    workspaceBoard = await import("../scripts/shared/workspace-board.js");
  } catch (error) {
    throw new Error(
      `workspace board helpers are missing: ${error instanceof Error ? error.message : "unknown import error"}`,
    );
  }

  const {
    collectNearbyNodes,
    createBoardSnapshot,
    createBoardState,
    exportBoardToJsonCanvas,
    importJsonCanvasToBoardPayload,
  } = workspaceBoard;

  const board = createBoardState({
    boardKey: "verify",
    source: {
      title: "Verify Board",
      description: "Board used by regression tests.",
      camera: { x: 100, y: 80, z: 1 },
      nodes: [
        { id: "a", type: "text", x: 0, y: 0, w: 240, h: 120, content: "Alpha" },
        { id: "b", type: "text", x: 300, y: 0, w: 240, h: 120, content: "Beta" },
      ],
      connections: [{ from: "a", to: "b" }],
    },
    persisted: null,
    title: "Verify Board",
    description: "Board used by regression tests.",
    fallbackCamera: { x: 100, y: 80, z: 1 },
  });

  const snapshot = createBoardSnapshot(board);
  const exported = exportBoardToJsonCanvas(board);
  const imported = importJsonCanvasToBoardPayload({
    nodes: [
      { id: "group-1", type: "group", x: 10, y: 20, width: 480, height: 320, label: "Cluster" },
      { id: "note-1", type: "text", x: 40, y: 60, width: 220, height: 140, text: "Hello" },
    ],
    edges: [{ id: "edge-1", fromNode: "group-1", toNode: "note-1", fromSide: "right", toSide: "left" }],
  });
  const nearby = collectNearbyNodes(
    {
      nodes: [
        { id: "near", type: "text", x: 10, y: 10, w: 100, h: 60, content: "Near" },
        { id: "far", type: "text", x: 900, y: 900, w: 100, h: 60, content: "Far" },
      ],
    },
    { x: 70, y: 40 },
    2,
  );

  const checks = [
    {
      ok: Array.isArray(board.edges) && board.edges.length === 1,
      message: "Board creation should migrate legacy connections into edges.",
    },
    {
      ok: board.edges[0]?.from === "a" && board.edges[0]?.to === "b",
      message: "Migrated edges should preserve the original connection endpoints.",
    },
    {
      ok: Array.isArray(snapshot.edges) && snapshot.edges.length === 1,
      message: "Board snapshots should include edges for undo/redo and persistence.",
    },
    {
      ok: Array.isArray(exported.nodes) && Array.isArray(exported.edges),
      message: "Board helpers should export JSON Canvas-compatible nodes and edges arrays.",
    },
    {
      ok: exported.edges[0]?.fromNode === "a" && exported.edges[0]?.toNode === "b",
      message: "JSON Canvas export should map internal edge endpoints to fromNode/toNode.",
    },
    {
      ok: imported.nodes[0]?.type === "group" && imported.edges[0]?.id === "edge-1",
      message: "JSON Canvas import should keep group nodes and edge IDs intact.",
    },
    {
      ok: nearby[0]?.id === "near",
      message: "Nearby-node ranking should prioritize nodes closest to the pointer focus.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: workspace board model helpers are available.");
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
