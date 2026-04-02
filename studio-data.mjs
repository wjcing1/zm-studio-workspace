const projects = [
  {
    id: "PRJ-001",
    name: "迪拜2026电梯展",
    client: "西奥电梯",
    budget: "档案未标注",
    status: "Archived",
    manager: "ZM",
    year: "2026",
    location: "中东区域档案",
    summary:
      "以电梯展参展方案为核心的项目档案，包含方案汇报 PDF、InDesign 排版、展品清单、模型文件与效果图。",
    deliverables: [
      "方案汇报 PDF",
      "InDesign 排版文件",
      "展品清单",
      "模型与效果图",
    ],
    website: "https://drive.google.com/drive/folders/1L6i9uF-nci00uGuI_bRLiH2JrSUEXlox",
    team: [
      { name: "方案", role: "PDF / INDD" },
      { name: "展品", role: "清单与参考整理" },
    ],
  },
  {
    id: "PRJ-002",
    name: "哈萨克斯坦电梯展",
    client: "Lift Expo KZ 档案",
    budget: "档案未标注",
    status: "Archived",
    manager: "ZM",
    year: "2026",
    location: "哈萨克斯坦",
    summary:
      "围绕 Lift Expo KZ 的展位档案，保留了展位平面 PDF、展商手册、SketchUp 模型以及人机产品配置清单。",
    deliverables: [
      "展位平面",
      "展商手册",
      "SketchUp 模型",
      "产品配置清单",
    ],
    website: "https://drive.google.com/drive/folders/1UsN2i0iZI0uL94-TVAC50uTKxC3fOhDB",
    team: [
      { name: "平面", role: "Floor plan / Manual" },
      { name: "模型", role: "SketchUp / 清单" },
    ],
  },
  {
    id: "PRJ-003",
    name: "草药展",
    client: "BSH",
    budget: "档案未标注",
    status: "Archived",
    manager: "ZM",
    year: "2026",
    location: "档案未标注",
    summary:
      "草药展概念方案档案，包含多版 SketchUp 模型、presentation PDF、Enscape 渲染与 BSH 标识稿。",
    deliverables: [
      "SketchUp 模型",
      "方案演示 PDF",
      "Enscape 效果图",
      "品牌标识稿",
    ],
    website: "https://drive.google.com/drive/folders/1ADL3V7dY7UbK2bWIhTfLtPS8QgwWc2QW",
    team: [
      { name: "渲染", role: "Enscape" },
      { name: "标识", role: "Logo assets" },
    ],
  },
  {
    id: "PRJ-004",
    name: "舒勇SHOW ROOM",
    client: "舒勇",
    budget: "档案未标注",
    status: "Archived",
    manager: "ZM",
    year: "2025",
    location: "档案未标注",
    summary:
      "SHOW ROOM 提案档案，包含 InDesign 方案、PDF 提案、效果图与 SHUYONG 参考资料。",
    deliverables: [
      "InDesign 提案",
      "方案 PDF",
      "效果图",
      "参考资料整理",
    ],
    website: "https://drive.google.com/drive/folders/1mIUro8nmHoycCBxhGeBiczDujXIJHbPO",
    team: [
      { name: "提案", role: "InDesign / PDF" },
      { name: "效果", role: "Render archive" },
    ],
  },
  {
    id: "PRJ-005",
    name: "MIDO 26 - Conant",
    client: "Conant",
    budget: "档案未标注",
    status: "Archived",
    manager: "ZM",
    year: "2026",
    location: "档案未标注",
    summary:
      "Conant 展位项目档案，当前可确认的核心视觉资料为多组 T1 / T2 渲染图，适合作为视觉案例库使用。",
    deliverables: [
      "RENDERS 效果图",
      "展位空间渲染",
      "方案视角整理",
      "展位概念呈现",
    ],
    website: "https://drive.google.com/drive/folders/1Iuf2J4Ud_m0xt5U9qxk3Fi2THbKt_yUH",
    team: [
      { name: "渲染", role: "T1 / T2 renders" },
      { name: "空间", role: "Booth concept archive" },
    ],
  },
];

const projectCanvasMap = {
  "PRJ-001": {
    title: "迪拜2026电梯展 Canvas",
    description: "围绕方案汇报、展品清单、模型与效果图整理出的参展档案工作板。",
    camera: { x: 116, y: 96, z: 0.88 },
    nodes: [
      {
        id: "hero",
        type: "project",
        x: 160,
        y: 150,
        w: 430,
        h: "auto",
        title: "迪拜2026电梯展",
        desc: "围绕电梯展提案文件组织出的项目档案，核心材料包括方案汇报、展品清单、模型文件和效果图。",
        tags: ["方案汇报", "展品清单", "效果图"],
      },
      {
        id: "sources",
        type: "text",
        x: 700,
        y: 140,
        w: 300,
        h: "auto",
        content:
          "Archive Sources\n\n- 方案.indd\n- 西奥-利雅得电梯展-汇报方案(0120).pdf\n- 展品清单.xlsx\n- 人机界面配件清单.xlsx",
      },
      {
        id: "workflow",
        type: "text",
        x: 1060,
        y: 350,
        w: 320,
        h: "auto",
        content:
          "Working Set\n\n- 模型文件\n- 效果图\n- 展位图\n- 电梯与轿厢部件参考",
      },
      {
        id: "notes",
        type: "text",
        x: 160,
        y: 470,
        w: 360,
        h: "auto",
        content:
          "Archive Notes\n\n文件夹名为“迪拜2026电梯展”，但现有资料同时出现利雅得 / 沙特电梯展相关文件名，因此这块工作板只保留档案中能直接确认的事实。",
      },
    ],
    connections: [
      { from: "hero", to: "sources" },
      { from: "sources", to: "workflow" },
      { from: "hero", to: "notes" },
    ],
  },
  "PRJ-002": {
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
    connections: [
      { from: "hero", to: "sources" },
      { from: "sources", to: "workflow" },
      { from: "hero", to: "notes" },
    ],
  },
  "PRJ-003": {
    title: "草药展 Canvas",
    description: "围绕多版方案、渲染和标识稿整理出的草药展概念板。",
    camera: { x: 102, y: 84, z: 0.86 },
    nodes: [
      {
        id: "hero",
        type: "project",
        x: 150,
        y: 140,
        w: 430,
        h: "auto",
        title: "草药展",
        desc: "以多版 SketchUp 模型、presentation PDF、Enscape 渲染和 BSH 标识稿为核心的展会概念档案。",
        tags: ["SketchUp", "Presentation", "Enscape"],
      },
      {
        id: "sources",
        type: "text",
        x: 670,
        y: 120,
        w: 320,
        h: "auto",
        content:
          "Archive Sources\n\n- 第二版.skp / 第二版.skb\n- presentation.pdf / presentation2.pdf / presentation3.pdf\n- BSH LOGO NOIR (1).png / .dwg / .jpg",
      },
      {
        id: "workflow",
        type: "text",
        x: 670,
        y: 430,
        w: 320,
        h: "auto",
        content:
          "Working Set\n\n- 多轮 Enscape 方案渲染\n- W2 FRONT 立面文件夹\n- 第一版 / 第二版模型迭代\n- 品牌标识稿整理",
      },
      {
        id: "notes",
        type: "text",
        x: 160,
        y: 500,
        w: 340,
        h: "auto",
        content:
          "Archive Notes\n\n档案中没有直接标注地点和预算，因此项目页只保留方案形态与文件类型，不扩写客户背景。",
      },
    ],
    connections: [
      { from: "hero", to: "sources" },
      { from: "sources", to: "workflow" },
      { from: "hero", to: "notes" },
    ],
  },
  "PRJ-004": {
    title: "舒勇SHOW ROOM Canvas",
    description: "围绕 SHOW ROOM 提案、效果图和参考资料整理出的展示空间工作板。",
    camera: { x: 108, y: 88, z: 0.9 },
    nodes: [
      {
        id: "hero",
        type: "project",
        x: 170,
        y: 130,
        w: 450,
        h: "auto",
        title: "舒勇SHOW ROOM",
        desc: "以 InDesign 方案、PDF 提案、效果图和 SHUYONG 参考文件夹为主线的展厅提案档案。",
        tags: ["提案", "效果图", "Showroom"],
      },
      {
        id: "sources",
        type: "text",
        x: 700,
        y: 120,
        w: 320,
        h: "auto",
        content:
          "Archive Sources\n\n- 方案1.indd\n- 方案1.pdf\n- 效果图\n- SHUYONG",
      },
      {
        id: "workflow",
        type: "text",
        x: 690,
        y: 460,
        w: 330,
        h: "auto",
        content:
          "Working Set\n\n- 提案排版稿\n- 提案 PDF 导出稿\n- 效果图文件夹\n- SHOW ROOM 参考资料整理",
      },
      {
        id: "notes",
        type: "text",
        x: 170,
        y: 500,
        w: 360,
        h: "auto",
        content:
          "Archive Notes\n\n当前资料能直接确认的是提案链路与效果图输出，地点和预算没有明确标注，因此页面文案保持保守。",
      },
    ],
    connections: [
      { from: "hero", to: "sources" },
      { from: "sources", to: "workflow" },
      { from: "hero", to: "notes" },
    ],
  },
  "PRJ-005": {
    title: "MIDO 26 - Conant Canvas",
    description: "围绕 Conant 展位渲染图整理出的视觉案例工作板。",
    camera: { x: 112, y: 90, z: 0.88 },
    nodes: [
      {
        id: "hero",
        type: "project",
        x: 170,
        y: 130,
        w: 450,
        h: "auto",
        title: "MIDO 26 - Conant",
        desc: "以 T1 / T2 渲染图为主线整理出的展位视觉档案，重点是不同空间视角和 booth 方案呈现。",
        tags: ["Renders", "Booth", "Concept"],
      },
      {
        id: "sources",
        type: "text",
        x: 700,
        y: 120,
        w: 320,
        h: "auto",
        content:
          "Archive Sources\n\n- RENDERS / T1.*.png\n- RENDERS / T2.*.png\n- 项目文件 / MIDO 26 - Conant",
      },
      {
        id: "workflow",
        type: "text",
        x: 700,
        y: 450,
        w: 320,
        h: "auto",
        content:
          "Working Set\n\n- 展位外部视角\n- 展位入口视角\n- 会客区与洽谈区\n- booth branding 变化",
      },
      {
        id: "notes",
        type: "text",
        x: 170,
        y: 500,
        w: 350,
        h: "auto",
        content:
          "Archive Notes\n\n当前档案最明确的是渲染成果，而地点、预算和更完整的项目背景没有直接标注，因此页面文案以视觉资料本身为准。",
      },
    ],
    connections: [
      { from: "hero", to: "sources" },
      { from: "sources", to: "workflow" },
      { from: "hero", to: "notes" },
    ],
  },
};

const projectsWithCanvas = projects.map((project) => ({
  ...project,
  canvas: projectCanvasMap[project.id],
}));

function padAssetNumber(value) {
  return String(value).padStart(2, "0");
}

function createRenderSeries({
  assetIdStart,
  projectId,
  titlePrefix,
  groupName,
  sourceLabelPrefix,
  fileUrl,
  basePath,
  count,
  featuredCount = 2,
  searchText,
  meta,
}) {
  return Array.from({ length: count }, (_, index) => {
    const number = padAssetNumber(index + 1);
    return {
      id: `AST-${String(assetIdStart + index).padStart(3, "0")}`,
      title: `${titlePrefix} ${number}`,
      category: "Render",
      format: "JPG",
      size: "Archive preview",
      url: `${basePath}/render-${number}.jpg`,
      projectId,
      groupName,
      sourceLabel: `${sourceLabelPrefix} ${number}`,
      fileUrl,
      actionLabel: "Open render folder",
      isFeatured: index < featuredCount,
      searchText: `${searchText} render ${number} render-${number}`,
      meta: {
        ...meta,
        keywords: [...meta.keywords, `render ${number}`, `render-${number}`],
      },
    };
  });
}

const assets = [
  ...createRenderSeries({
    assetIdStart: 1,
    projectId: "PRJ-001",
    titlePrefix: "迪拜电梯展渲染",
    groupName: "Effect renders",
    sourceLabelPrefix: "Dubai effect render",
    fileUrl: "https://drive.google.com/drive/folders/1Heac_86lSl8HjT5FL1rNveTjRKG4ZrF5",
    basePath: "./media/assets/dubai-2026-elevator",
    count: 10,
    searchText:
      "迪拜 电梯展 sword elevator expo booth exhibition stand render interior warm neutral signage hospitality counter",
    meta: {
      spaceType: "expo booth",
      shotType: "render perspective",
      viewAngle: "booth-wide perspective",
      style: "trade show minimal",
      colorMood: "warm neutral",
      materials: ["lightbox", "painted wall", "metal", "screen"],
      keywords: ["迪拜", "电梯展", "SWORD", "booth", "expo", "render", "展台"],
    },
  }),
  ...createRenderSeries({
    assetIdStart: 11,
    projectId: "PRJ-003",
    titlePrefix: "草药展 Enscape",
    groupName: "Enscape renders",
    sourceLabelPrefix: "Herb Enscape",
    fileUrl: "https://drive.google.com/drive/folders/1ADL3V7dY7UbK2bWIhTfLtPS8QgwWc2QW",
    basePath: "./media/assets/herb-expo",
    count: 10,
    searchText:
      "草药展 herb expo enscape render green botanical wellness retail ingredients shelves certification booth interior",
    meta: {
      spaceType: "expo installation",
      shotType: "interior render",
      viewAngle: "corner perspective",
      style: "organic exhibition",
      colorMood: "green natural",
      materials: ["graphic panel", "display shelf", "white laminate", "plant imagery"],
      keywords: ["草药展", "herb", "Enscape", "render", "botanical", "绿色", "展览"],
    },
  }),
  ...createRenderSeries({
    assetIdStart: 21,
    projectId: "PRJ-004",
    titlePrefix: "舒勇 SHOW ROOM",
    groupName: "Showroom renders",
    sourceLabelPrefix: "Showroom render",
    fileUrl: "https://drive.google.com/drive/folders/1isk1WrEeBLzjturYmMQWVr7YJaF33vwK",
    basePath: "./media/assets/shuyong-showroom",
    count: 10,
    searchText:
      "舒勇 showroom render gallery exhibition interior product display white grey minimal lighting perspective",
    meta: {
      spaceType: "showroom",
      shotType: "detail render",
      viewAngle: "interior perspective",
      style: "gallery minimal",
      colorMood: "soft neutral",
      materials: ["painted wall", "display table", "track light", "acrylic"],
      keywords: ["舒勇", "showroom", "gallery", "render", "interior", "展示空间"],
    },
  }),
  ...createRenderSeries({
    assetIdStart: 31,
    projectId: "PRJ-005",
    titlePrefix: "MIDO 26 - Conant",
    groupName: "Render studies",
    sourceLabelPrefix: "MIDO render",
    fileUrl: "https://drive.google.com/drive/folders/1YXFJvppFoi22DyvrT7cBpifgRufvHrF_",
    basePath: "./media/assets/mido-26-conant",
    count: 10,
    searchText:
      "MIDO Conant render booth eyewear trade show pavilion meeting area hospitality corner neutral grey white perspective",
    meta: {
      spaceType: "expo booth",
      shotType: "concept render",
      viewAngle: "booth perspective",
      style: "modular trade show",
      colorMood: "neutral grey",
      materials: ["lightbox", "aluminum frame", "graphic panel", "seating"],
      keywords: ["MIDO", "Conant", "booth", "render", "trade show", "neutral", "展台"],
    },
  }),
];

const overviewNodes = [
  {
    id: "intro",
    type: "text",
    x: 150,
    y: 120,
    w: 360,
    h: "auto",
    content:
      "Projects and canvases are now connected.\n\n- click any project card to open its board\n- or jump in from the Projects table\n- double click anywhere to add a note",
  },
  {
    id: "projects-cta",
    type: "text",
    x: 160,
    y: 470,
    w: 330,
    h: "auto",
    content:
      "How to Use This Board\n\nCanvas keeps the spatial overview.\nProjects acts as the ledger.\nAssets stores reusable materials.\n\nEach project has its own canvas now.",
  },
  {
    id: "media",
    type: "image",
    x: 1120,
    y: 520,
    w: 330,
    h: 230,
    content:
      "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?q=80&w=1200&auto=format&fit=crop",
  },
  ...projectsWithCanvas.map((project, index) => {
    const positions = [
      { x: 610, y: 120 },
      { x: 1080, y: 150 },
      { x: 690, y: 470 },
      { x: 1180, y: 820 },
      { x: 670, y: 860 },
    ];
    const position = positions[index] || { x: 700 + index * 120, y: 220 + index * 120 };
    return {
      id: `overview-${project.id}`,
      type: "project",
      projectId: project.id,
      x: position.x,
      y: position.y,
      w: 360,
      h: "auto",
      title: project.name,
      desc: `${project.location} • ${project.status}\n${project.summary}`,
      tags: project.deliverables.slice(0, 3),
    };
  }),
];

const overviewConnections = [
  { from: "intro", to: "overview-PRJ-001" },
  { from: "intro", to: "overview-PRJ-002" },
  { from: "intro", to: "overview-PRJ-003" },
  { from: "projects-cta", to: "overview-PRJ-003" },
  { from: "overview-PRJ-001", to: "overview-PRJ-004" },
  { from: "overview-PRJ-002", to: "media" },
  { from: "overview-PRJ-003", to: "overview-PRJ-004" },
  { from: "overview-PRJ-004", to: "overview-PRJ-005" },
];

export const studioData = {
  studio: {
    name: "ZM Studio",
    base: "Rome, Italy",
    description:
      "ZM Studio 当前项目库以展会、展厅、空间提案和方案档案为主，强调从模型、渲染、清单到汇报文件的一体化工作流。",
    focus: [
      "展会与展厅方案",
      "SketchUp 与 Enscape 工作流",
      "提案排版与汇报文件",
      "空间叙事与项目归档",
    ],
  },
  assistant: {
    greeting:
      "你好，我是 ZM Studio 的 AI 助手。你可以问我目前归档了哪些真实项目、每个项目里有哪些方案文件、模型和效果图，或者哪个档案最适合作为案例展示。",
    starters: [
      "你都做过什么项目？",
      "这些项目档案里都有什么文件？",
      "哪个项目最适合作为案例展示？",
    ],
  },
  canvas: {
    overview: {
      title: "Studio Canvas",
      description:
        "A spatial snapshot of the studio's current body of work. Each project node opens its own dedicated board.",
      camera: { x: 96, y: 84, z: 0.82 },
      nodes: overviewNodes,
      connections: overviewConnections,
    },
  },
  projects: projectsWithCanvas,
  assets,
};
