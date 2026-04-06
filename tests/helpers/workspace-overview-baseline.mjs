export function createOverviewBaselineBoard() {
  return {
    key: "overview",
    projectId: null,
    title: "Studio Canvas",
    description: "Workspace test baseline",
    camera: { x: 112, y: 92, z: 0.92 },
    nodes: [
      {
        id: "north-star",
        type: "text",
        x: 160,
        y: 140,
        w: 340,
        h: "auto",
        content: "Studio Direction\n\n- spatial systems\n- AI workflow tooling\n- delivery sequencing",
      },
      {
        id: "project-kz",
        type: "project",
        x: 620,
        y: 130,
        w: 420,
        h: 250,
        title: "Kazakhstan Expo",
        desc: "Current exhibition planning board with layout, handbook, and model references.",
        tags: ["layout", "handbook", "model"],
        projectId: "PRJ-002",
      },
      {
        id: "references",
        type: "link",
        x: 1140,
        y: 170,
        w: 320,
        h: 170,
        title: "Vendor brief",
        url: "https://example.com/vendor-brief",
        content: "https://example.com/vendor-brief",
      },
      {
        id: "notes",
        type: "text",
        x: 660,
        y: 460,
        w: 320,
        h: "auto",
        content: "Follow-up Notes\n\n- confirm freight timing\n- align handoff owners\n- finalize travel deck",
      },
    ],
    edges: [
      {
        id: "edge-1",
        from: "north-star",
        to: "project-kz",
        fromSide: "right",
        toSide: "left",
        fromEnd: "none",
        toEnd: "arrow",
        label: "",
      },
      {
        id: "edge-2",
        from: "project-kz",
        to: "references",
        fromSide: "right",
        toSide: "left",
        fromEnd: "none",
        toEnd: "arrow",
        label: "",
      },
      {
        id: "edge-3",
        from: "project-kz",
        to: "notes",
        fromSide: "bottom",
        toSide: "top",
        fromEnd: "none",
        toEnd: "arrow",
        label: "",
      },
    ],
  };
}

export async function putOverviewBoard(port, board = createOverviewBaselineBoard()) {
  await fetch(`http://127.0.0.1:${port}/api/boards/overview`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      board,
    }),
  });
}
