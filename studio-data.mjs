const projects = [
  {
    id: "PRJ-001",
    name: "Neon Genesis Rebrand",
    client: "Nerv Tech Ltd.",
    budget: "¥ 450,000",
    status: "In Progress",
    manager: "ZM",
    year: "2026",
    location: "Tokyo, Japan",
    summary:
      "A full rebrand for a robotics and sensing company, combining a sharper visual identity with a cinematic launch site and motion language.",
    deliverables: [
      "Brand system",
      "Launch microsite",
      "3D motion direction",
      "Campaign assets",
    ],
    website: "https://portfolio.zm-studio.example/neon-genesis",
    team: [
      { name: "Alex", role: "Frontend" },
      { name: "Sarah", role: "3D Motion" },
    ],
  },
  {
    id: "PRJ-002",
    name: "Dark Matter E-commerce",
    client: "Void Supply Co.",
    budget: "¥ 280,000",
    status: "Completed",
    manager: "ZM",
    year: "2025",
    location: "Milan, Italy",
    summary:
      "A minimal commerce experience built around typography, dramatic pacing, and restrained product storytelling for a fashion-tech label.",
    deliverables: [
      "E-commerce UX",
      "Visual system",
      "Content direction",
      "Launch support",
    ],
    website: "https://portfolio.zm-studio.example/dark-matter",
    team: [
      { name: "Mike", role: "Backend" },
      { name: "Elena", role: "UI/UX" },
    ],
  },
  {
    id: "PRJ-003",
    name: "Spatial OS Prototype",
    client: "Internal R&D",
    budget: "¥ 150,000",
    status: "On Hold",
    manager: "ZM",
    year: "2025",
    location: "Remote, based in Rome",
    summary:
      "An internal exploration into canvas-native portfolio interfaces, experimental navigation, and data-dense storytelling for the web.",
    deliverables: [
      "Product concept",
      "Interaction prototype",
      "WebGL studies",
      "UX research",
    ],
    website: "https://portfolio.zm-studio.example/spatial-os",
    team: [
      { name: "ZM", role: "Lead Arch" },
      { name: "David", role: "WebGL" },
    ],
  },
  {
    id: "PRJ-004",
    name: "Lumina Data Viz",
    client: "Stark Industries",
    budget: "¥ 620,000",
    status: "In Progress",
    manager: "ZM",
    year: "2026",
    location: "New York, USA",
    summary:
      "A premium data-visualization platform and stakeholder demo system for executive storytelling, real-time dashboards, and investor presentations.",
    deliverables: [
      "Dashboard UX",
      "Data visualization system",
      "Presentation mode",
      "Design QA",
    ],
    website: "https://portfolio.zm-studio.example/lumina",
    team: [
      { name: "Chloe", role: "Data Eng" },
      { name: "Alex", role: "Frontend" },
      { name: "Sam", role: "QA" },
    ],
  },
];

const projectCanvasMap = {
  "PRJ-001": {
    title: "Neon Genesis Rebrand Canvas",
    description: "Brand system, launch narrative, and motion production mapped as one working board.",
    camera: { x: 116, y: 96, z: 0.88 },
    nodes: [
      {
        id: "hero",
        type: "project",
        x: 160,
        y: 150,
        w: 430,
        h: "auto",
        title: "Neon Genesis Rebrand",
        desc: "Robotics brand refresh with a sharper identity system and a launch site built to feel cinematic rather than corporate.",
        tags: ["Brand System", "Launch Site", "Motion"],
      },
      {
        id: "strategy",
        type: "text",
        x: 700,
        y: 140,
        w: 300,
        h: "auto",
        content:
          "Strategy\n\nShift the brand away from lab-tech stiffness and toward precise, energetic confidence.\n\nKey move:\n- high-contrast palette\n- modular logo system\n- motion as product proof",
      },
      {
        id: "deliverables",
        type: "text",
        x: 1060,
        y: 350,
        w: 320,
        h: "auto",
        content:
          "Deliverables\n\n- Brand system\n- Launch microsite\n- 3D motion direction\n- Campaign assets",
      },
      {
        id: "visual",
        type: "image",
        x: 650,
        y: 420,
        w: 340,
        h: 240,
        content:
          "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop",
      },
      {
        id: "launch",
        type: "text",
        x: 160,
        y: 470,
        w: 360,
        h: "auto",
        content:
          "Launch Notes\n\nTokyo, 2026\n\nThe microsite needs to explain sensing hardware without feeling like investor decks.\n\nOpen question:\nHow much product detail lives on the homepage vs deep pages?",
      },
    ],
    connections: [
      { from: "hero", to: "strategy" },
      { from: "strategy", to: "deliverables" },
      { from: "hero", to: "launch" },
      { from: "strategy", to: "visual" },
    ],
  },
  "PRJ-002": {
    title: "Dark Matter E-commerce Canvas",
    description: "A commerce story board focused on editorial pacing, product framing, and restrained luxury.",
    camera: { x: 124, y: 92, z: 0.92 },
    nodes: [
      {
        id: "hero",
        type: "project",
        x: 180,
        y: 120,
        w: 440,
        h: "auto",
        title: "Dark Matter E-commerce",
        desc: "A fashion-tech commerce experience built around typography, negative space, and a deliberately slower product story.",
        tags: ["Commerce", "Editorial", "Launch"],
      },
      {
        id: "story",
        type: "text",
        x: 700,
        y: 130,
        w: 320,
        h: "auto",
        content:
          "Story Arc\n\nMilan, 2025\n\nThe site moves from atmosphere to detail:\n- collection mood\n- product thesis\n- conversion moments\n- launch support",
      },
      {
        id: "ui",
        type: "image",
        x: 1100,
        y: 160,
        w: 320,
        h: 420,
        content:
          "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=1200&auto=format&fit=crop",
      },
      {
        id: "deliverables",
        type: "text",
        x: 690,
        y: 430,
        w: 310,
        h: "auto",
        content:
          "Delivered\n\n- E-commerce UX\n- Visual system\n- Content direction\n- Launch support",
      },
      {
        id: "ops",
        type: "text",
        x: 180,
        y: 470,
        w: 360,
        h: "auto",
        content:
          "Operational Notes\n\nClient: Void Supply Co.\n\nCompleted board used for handoff, merch cadence, and post-launch design QA.",
      },
    ],
    connections: [
      { from: "hero", to: "story" },
      { from: "story", to: "ui" },
      { from: "story", to: "deliverables" },
      { from: "hero", to: "ops" },
    ],
  },
  "PRJ-003": {
    title: "Spatial OS Prototype Canvas",
    description: "Internal R&D board for experimental navigation, data-dense storytelling, and infinite canvas behavior.",
    camera: { x: 102, y: 84, z: 0.86 },
    nodes: [
      {
        id: "hero",
        type: "project",
        x: 150,
        y: 140,
        w: 430,
        h: "auto",
        title: "Spatial OS Prototype",
        desc: "Internal exploration into canvas-native portfolio interfaces and a portfolio that behaves more like a workspace than a brochure.",
        tags: ["R&D", "Canvas", "WebGL"],
      },
      {
        id: "research",
        type: "text",
        x: 670,
        y: 120,
        w: 320,
        h: "auto",
        content:
          "Research Questions\n\n- how dense can the interface become before orientation breaks?\n- what belongs in a table vs on the board?\n- when should AI help explain context?",
      },
      {
        id: "prototype",
        type: "image",
        x: 1070,
        y: 200,
        w: 330,
        h: 250,
        content:
          "https://images.unsplash.com/photo-1516321497487-e288fb19713f?q=80&w=1200&auto=format&fit=crop",
      },
      {
        id: "milestones",
        type: "text",
        x: 670,
        y: 430,
        w: 320,
        h: "auto",
        content:
          "Milestones\n\n- product concept\n- interaction prototype\n- WebGL studies\n- UX research\n\nStatus: On Hold",
      },
      {
        id: "note",
        type: "text",
        x: 160,
        y: 500,
        w: 340,
        h: "auto",
        content:
          "Team\n\nZM leads the architecture.\nDavid focuses on WebGL motion tests.\n\nThis board is still the conceptual backbone of the portfolio.",
      },
    ],
    connections: [
      { from: "hero", to: "research" },
      { from: "research", to: "prototype" },
      { from: "research", to: "milestones" },
      { from: "hero", to: "note" },
    ],
  },
  "PRJ-004": {
    title: "Lumina Data Viz Canvas",
    description: "Executive dashboard planning board for stakeholder demos, presentation mode, and live-data storytelling.",
    camera: { x: 108, y: 88, z: 0.9 },
    nodes: [
      {
        id: "hero",
        type: "project",
        x: 170,
        y: 130,
        w: 450,
        h: "auto",
        title: "Lumina Data Viz",
        desc: "A premium data visualization platform shaped for executive demos, live dashboards, and investor-facing storytelling.",
        tags: ["Dashboard", "Data Viz", "Presentation"],
      },
      {
        id: "audience",
        type: "text",
        x: 700,
        y: 120,
        w: 320,
        h: "auto",
        content:
          "Audience Modes\n\nNew York, 2026\n\nOne interface serves:\n- internal ops\n- exec stakeholders\n- investor presentations\n- design QA reviews",
      },
      {
        id: "screen",
        type: "image",
        x: 1080,
        y: 150,
        w: 340,
        h: 270,
        content:
          "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200&auto=format&fit=crop",
      },
      {
        id: "system",
        type: "text",
        x: 690,
        y: 460,
        w: 330,
        h: "auto",
        content:
          "System Scope\n\n- dashboard UX\n- data visualization system\n- presentation mode\n- design QA",
      },
      {
        id: "team",
        type: "text",
        x: 170,
        y: 500,
        w: 360,
        h: "auto",
        content:
          "Team Shape\n\nChloe handles data engineering.\nAlex owns frontend delivery.\nSam runs QA for demo readiness.",
      },
    ],
    connections: [
      { from: "hero", to: "audience" },
      { from: "audience", to: "screen" },
      { from: "audience", to: "system" },
      { from: "hero", to: "team" },
    ],
  },
};

const projectsWithCanvas = projects.map((project) => ({
  ...project,
  canvas: projectCanvasMap[project.id],
}));

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
];

export const studioData = {
  studio: {
    name: "ZM Studio",
    base: "Rome, Italy",
    description:
      "ZM Studio designs spatial digital experiences, identity systems, and cinematic web launches for ambitious technology and culture brands.",
    focus: [
      "Spatial interfaces",
      "Brand systems",
      "3D-driven web experiences",
      "Design systems and digital storytelling",
    ],
  },
  assistant: {
    greeting:
      "你好，我是 ZM Studio 的 AI 助手。你可以问我做过哪些项目、这些项目都在哪儿、每个项目交付了什么，或者哪个项目最适合作为案例展示。",
    starters: [
      "你都做过什么项目？",
      "这些项目都在哪儿？",
      "哪个项目最能代表你的工作方式？",
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
  assets: [
    {
      id: "AST-001",
      title: "Dark Matter UI Kit",
      category: "UI/UX",
      format: "Figma",
      size: "24 MB",
      url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: "AST-002",
      title: "Chrome Abstract Render",
      category: "3D",
      format: "PNG",
      size: "8.2 MB",
      url: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: "AST-003",
      title: "Neon Typography",
      category: "Graphic",
      format: "SVG",
      size: "1.1 MB",
      url: "https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: "AST-004",
      title: "Spatial Grid Texture",
      category: "Texture",
      format: "JPG",
      size: "4.5 MB",
      url: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: "AST-005",
      title: "Wireframe Models",
      category: "3D",
      format: "OBJ",
      size: "156 MB",
      url: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: "AST-006",
      title: "Glassmorphism Pack",
      category: "UI/UX",
      format: "PSD",
      size: "89 MB",
      url: "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=1200&auto=format&fit=crop",
    },
  ],
};
