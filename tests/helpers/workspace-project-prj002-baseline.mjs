export function createProjectPrj002BaselineBoard() {
  return {
    key: "PRJ-002",
    projectId: "PRJ-002",
    title: "哈萨克斯坦电梯展 Canvas",
    description: "以 Lift Expo KZ 档案为核心的展位准备工作板。",
    camera: { x: 124, y: 92, z: 0.92 },
    nodes: [
      {
        id: "hero",
        type: "project",
        x: 180,
        y: 120,
        w: 440,
        h: "auto",
        title: "哈萨克斯坦电梯展",
        desc: "围绕 Lift Expo KZ 的展位档案整理，聚焦展位平面、展商手册、模型与产品配置清单。",
        tags: ["展位平面", "展商手册", "模型"],
        projectId: "PRJ-002",
      },
      {
        id: "sources",
        type: "text",
        x: 700,
        y: 130,
        w: 320,
        h: "auto",
        content:
          "Archive Sources\n\n- LiftExpoKZ-FLPLAN 2025.10.17.pdf\n- 2026年哈萨克斯坦展商手册.pdf\n- 沙特&哈萨克斯坦展清单.xlsx",
      },
      {
        id: "workflow",
        type: "text",
        x: 690,
        y: 430,
        w: 310,
        h: "auto",
        content:
          "Working Set\n\n- 模型1.skp\n- 沙特展第二版.skp\n- 人机产品配置清单\n- 中东参展轿厢设计(1).skp",
      },
      {
        id: "notes",
        type: "text",
        x: 180,
        y: 470,
        w: 360,
        h: "auto",
        content:
          "Archive Notes\n\n当前档案同时收纳了哈萨克斯坦与中东参展相关模型，因此这块板子强调的是展位准备流程，而不是单一成品页面。",
      },
    ],
    edges: [
      {
        id: "edge-hero-sources",
        from: "hero",
        to: "sources",
        fromSide: "right",
        toSide: "left",
        fromEnd: "none",
        toEnd: "arrow",
        label: "",
      },
      {
        id: "edge-sources-workflow",
        from: "sources",
        to: "workflow",
        fromSide: "bottom",
        toSide: "top",
        fromEnd: "none",
        toEnd: "arrow",
        label: "",
      },
      {
        id: "edge-hero-notes",
        from: "hero",
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

export async function putProjectPrj002Board(port, board = createProjectPrj002BaselineBoard()) {
  await fetch(`http://127.0.0.1:${port}/api/boards/PRJ-002`, {
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
