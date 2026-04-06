import process from "node:process";

async function main() {
  let adapter;

  try {
    adapter = await import("../scripts/shared/workspace-tldraw-adapter.mjs");
  } catch (error) {
    throw new Error(
      `workspace tldraw adapter is missing: ${error instanceof Error ? error.message : "unknown import error"}`,
    );
  }

  const {
    boardPayloadToTldrawSnapshot,
    tldrawSnapshotToBoardPayload,
  } = adapter;

  if (typeof boardPayloadToTldrawSnapshot !== "function") {
    throw new Error("workspace tldraw adapter should export boardPayloadToTldrawSnapshot().");
  }

  if (typeof tldrawSnapshotToBoardPayload !== "function") {
    throw new Error("workspace tldraw adapter should export tldrawSnapshotToBoardPayload().");
  }

  const board = {
    key: "overview",
    title: "Workspace",
    description: "Adapter roundtrip board",
    camera: { x: 144, y: 112, z: 0.92 },
    nodes: [
      { id: "note-1", type: "text", x: 0, y: 0, w: 280, h: 160, content: "Intro note" },
      { id: "project-1", type: "project", x: 340, y: 20, w: 360, h: 220, title: "Project", desc: "Summary", tags: ["A"] },
      { id: "link-1", type: "link", x: 760, y: 20, w: 260, h: 150, title: "Reference", url: "https://example.com" },
      {
        id: "file-1",
        type: "file",
        x: 80,
        y: 320,
        w: 320,
        h: 260,
        file: "/.data/uploads/overview/moodboard.svg",
        content: "/.data/uploads/overview/moodboard.svg",
        title: "moodboard.svg",
        mimeType: "image/svg+xml",
        fileKind: "image",
      },
      { id: "group-1", type: "group", x: 520, y: 300, w: 420, h: 300, label: "Cluster" },
    ],
    edges: [
      { id: "edge-1", from: "note-1", to: "project-1", fromSide: "right", toSide: "left", fromEnd: "none", toEnd: "arrow" },
      { id: "edge-2", from: "project-1", to: "link-1", fromSide: "right", toSide: "left", fromEnd: "none", toEnd: "arrow" },
    ],
  };

  const snapshot = boardPayloadToTldrawSnapshot(board);
  const roundTrip = tldrawSnapshotToBoardPayload(snapshot, {
    key: board.key,
    title: board.title,
    description: board.description,
  });

  const checks = [
    {
      ok: snapshot && typeof snapshot === "object",
      message: "boardPayloadToTldrawSnapshot() should return an object snapshot.",
    },
    {
      ok: snapshot && typeof snapshot.records === "object" && Object.keys(snapshot.records).length >= 7,
      message: "tldraw snapshot should contain shape and arrow records for the source board.",
    },
    {
      ok: roundTrip?.camera?.z === board.camera.z,
      message: "Adapter roundtrip should preserve camera zoom.",
    },
    {
      ok: Array.isArray(roundTrip?.nodes) && roundTrip.nodes.length === board.nodes.length,
      message: "Adapter roundtrip should preserve the number of board nodes.",
    },
    {
      ok: Array.isArray(roundTrip?.edges) && roundTrip.edges.length === board.edges.length,
      message: "Adapter roundtrip should preserve the number of board edges.",
    },
    {
      ok: roundTrip.nodes.some((node) => node.id === "file-1" && node.type === "file" && node.fileKind === "image"),
      message: "Adapter roundtrip should preserve file nodes and their fileKind metadata.",
    },
    {
      ok: roundTrip.nodes.some((node) => node.id === "project-1" && node.type === "project"),
      message: "Adapter roundtrip should preserve project nodes.",
    },
    {
      ok: roundTrip.nodes.some((node) => node.id === "group-1" && node.type === "group"),
      message: "Adapter roundtrip should preserve group nodes.",
    },
    {
      ok: roundTrip.edges.some((edge) => edge.id === "edge-1" && edge.from === "note-1" && edge.to === "project-1"),
      message: "Adapter roundtrip should preserve stable edge ids and endpoints.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: workspace tldraw adapter roundtrip is valid.");
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
