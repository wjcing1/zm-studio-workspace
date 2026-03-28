import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { studioData } from "./studio-data.mjs";
import {
  sanitizeCanvasCamera,
  sanitizeCanvasEdges,
  sanitizeCanvasNodes,
} from "./scripts/shared/workspace-board.js";

const DEFAULT_CAMERA = { x: 96, y: 80, z: 1 };

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function buildFallbackProjectBoard(project) {
  return {
    title: `${project.name} Canvas`,
    description: project.summary,
    camera: { x: 112, y: 92, z: 0.9 },
    nodes: [
      {
        id: "hero",
        type: "project",
        x: 160,
        y: 150,
        w: 420,
        h: "auto",
        title: project.name,
        desc: project.summary,
        tags: project.deliverables.slice(0, 3),
      },
      {
        id: "deliverables",
        type: "text",
        x: 700,
        y: 160,
        w: 320,
        h: "auto",
        content: `Deliverables\n\n- ${project.deliverables.join("\n- ")}`,
      },
      {
        id: "details",
        type: "text",
        x: 180,
        y: 470,
        w: 340,
        h: "auto",
        content: `Project Details\n\nLocation: ${project.location}\nYear: ${project.year}\nStatus: ${project.status}`,
      },
    ],
    connections: [
      { from: "hero", to: "deliverables" },
      { from: "hero", to: "details" },
    ],
  };
}

function normalizeBoard(boardId, input = {}, seed = {}) {
  return {
    key: boardId,
    projectId: seed.projectId || null,
    title: typeof input.title === "string" && input.title.trim() ? input.title : seed.title || "Canvas",
    description:
      typeof input.description === "string" ? input.description : typeof seed.description === "string" ? seed.description : "",
    camera: sanitizeCanvasCamera(input.camera, seed.camera || DEFAULT_CAMERA),
    nodes: sanitizeCanvasNodes(input.nodes ?? seed.nodes ?? []),
    edges: sanitizeCanvasEdges(input.edges ?? seed.edges ?? seed.connections ?? []),
  };
}

function getSeedBoard(boardId) {
  if (boardId === "overview") {
    return normalizeBoard(
      boardId,
      studioData.canvas?.overview || {},
      {
        projectId: null,
        title: "Studio Canvas",
        description: studioData.studio?.description || "",
        camera: DEFAULT_CAMERA,
      },
    );
  }

  const project = studioData.projects.find((item) => item.id === boardId);
  if (!project) return null;

  return normalizeBoard(boardId, project.canvas || buildFallbackProjectBoard(project), {
    projectId: project.id,
    title: `${project.name} Canvas`,
    description: project.summary,
    camera: DEFAULT_CAMERA,
  });
}

function boardFilename(boardId) {
  return `${encodeURIComponent(boardId)}.json`;
}

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export function createBoardStore({
  provider = "local-file",
  storageDir = path.join(process.cwd(), ".data", "boards"),
} = {}) {
  async function ensureDir() {
    await mkdir(storageDir, { recursive: true });
  }

  async function readPersisted(boardId) {
    const filePath = path.join(storageDir, boardFilename(boardId));

    try {
      return await readJson(filePath);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  return {
    provider,
    storageDir,
    async getBoard(boardId) {
      const seedBoard = getSeedBoard(boardId);
      const persisted = await readPersisted(boardId);

      if (!seedBoard && !persisted) {
        return null;
      }

      const board = normalizeBoard(boardId, persisted?.board || persisted || {}, seedBoard || {});

      return {
        board,
        persistence: {
          provider,
          source: persisted ? "snapshot" : "seed",
        },
      };
    },
    async saveBoard(boardId, input) {
      const seedBoard = getSeedBoard(boardId);
      const persisted = await readPersisted(boardId);

      if (!seedBoard && !persisted) {
        const error = new Error(`Unknown board: ${boardId}`);
        error.code = "BOARD_NOT_FOUND";
        throw error;
      }

      const board = normalizeBoard(boardId, input || {}, seedBoard || persisted?.board || {});
      const payload = {
        board,
        savedAt: new Date().toISOString(),
      };

      await ensureDir();
      await writeFile(path.join(storageDir, boardFilename(boardId)), JSON.stringify(payload, null, 2));

      return {
        board: clone(board),
        persistence: {
          provider,
          source: "snapshot",
        },
      };
    },
  };
}
