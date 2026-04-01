import { mkdir, readFile } from "node:fs/promises";
import Database from "better-sqlite3";
import path from "node:path";
import { studioSeedData } from "./data/seed/studio-seed.mjs";
import {
  sanitizeCanvasCamera,
  sanitizeCanvasEdges,
  sanitizeCanvasNodes,
} from "./scripts/shared/workspace-board.js";

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function defaultBoardPersistence() {
  return {
    provider: "sqlite",
    source: "database",
  };
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

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeBoardPayload(boardKey, input = {}, seed = {}) {
  return {
    key: boardKey,
    projectId: seed.projectId || input.projectId || null,
    title: typeof input.title === "string" && input.title.trim() ? input.title : seed.title || "Canvas",
    description:
      typeof input.description === "string" ? input.description : typeof seed.description === "string" ? seed.description : "",
    camera: sanitizeCanvasCamera(input.camera, seed.camera || { x: 96, y: 80, z: 1 }),
    nodes: sanitizeCanvasNodes(input.nodes ?? seed.nodes ?? []),
    edges: sanitizeCanvasEdges(input.edges ?? input.connections ?? seed.edges ?? seed.connections ?? []),
  };
}

function serializeNode(node = {}) {
  const extra = {};

  if (typeof node.desc === "string") {
    extra.desc = node.desc;
  }

  return {
    nodeId: node.id,
    type: node.type || "text",
    x: typeof node.x === "number" ? Math.round(node.x) : 0,
    y: typeof node.y === "number" ? Math.round(node.y) : 0,
    w: typeof node.w === "number" ? Math.round(node.w) : 320,
    h: node.h === "auto" ? "auto" : String(node.h ?? "auto"),
    autoHeight: typeof node.autoHeight === "number" ? Math.round(node.autoHeight) : null,
    title: typeof node.title === "string" ? node.title : "",
    label: typeof node.label === "string" ? node.label : "",
    content: typeof node.content === "string" ? node.content : "",
    description: typeof node.description === "string" ? node.description : "",
    url: typeof node.url === "string" ? node.url : "",
    tagsJson: JSON.stringify(Array.isArray(node.tags) ? node.tags : []),
    file: typeof node.file === "string" ? node.file : "",
    mimeType: typeof node.mimeType === "string" ? node.mimeType : "",
    fileKind: typeof node.fileKind === "string" ? node.fileKind : "",
    size: typeof node.size === "number" ? Math.round(node.size) : null,
    background: typeof node.background === "string" ? node.background : "",
    backgroundStyle: typeof node.backgroundStyle === "string" ? node.backgroundStyle : "",
    color: typeof node.color === "string" ? node.color : "",
    extraJson: JSON.stringify(extra),
  };
}

function serializeEdge(edge = {}) {
  return {
    edgeId: edge.id,
    fromNodeId: edge.from,
    toNodeId: edge.to,
    fromSide: typeof edge.fromSide === "string" ? edge.fromSide : "right",
    toSide: typeof edge.toSide === "string" ? edge.toSide : "left",
    fromEnd: typeof edge.fromEnd === "string" ? edge.fromEnd : "none",
    toEnd: typeof edge.toEnd === "string" ? edge.toEnd : "arrow",
    color: typeof edge.color === "string" ? edge.color : "",
    label: typeof edge.label === "string" ? edge.label : "",
    extraJson: "{}",
  };
}

function deserializeNode(row) {
  const extra = safeJsonParse(row.extra_json, {});
  const hValue = row.h === "auto" ? "auto" : Number.isFinite(Number(row.h)) ? Number(row.h) : "auto";
  const node = {
    id: row.node_id,
    type: row.type,
    x: row.x,
    y: row.y,
    w: row.w,
    h: hValue,
  };

  if (Number.isFinite(row.auto_height)) {
    node.autoHeight = row.auto_height;
  }

  if (row.color) {
    node.color = row.color;
  }

  if (row.type === "text") {
    node.content = row.content;
  }

  if (row.type === "project") {
    node.title = row.title;
    node.desc = typeof extra.desc === "string" ? extra.desc : row.description || row.content;
    node.tags = safeJsonParse(row.tags_json, []);
  }

  if (row.type === "image") {
    node.content = row.content;
  }

  if (row.type === "file") {
    node.file = row.file;
    node.content = row.file || row.content;
    node.title = row.title;
    node.mimeType = row.mime_type;
    node.fileKind = row.file_kind;
    if (Number.isFinite(row.size)) {
      node.size = row.size;
    }
  }

  if (row.type === "link") {
    node.title = row.title;
    node.url = row.url || row.content;
    node.content = node.url;
  }

  if (row.type === "group") {
    node.label = row.label;
    node.background = row.background;
    node.backgroundStyle = row.background_style;
  }

  return node;
}

function deserializeEdge(row) {
  return {
    id: row.edge_id,
    from: row.from_node_id,
    to: row.to_node_id,
    fromSide: row.from_side,
    toSide: row.to_side,
    fromEnd: row.from_end,
    toEnd: row.to_end,
    color: row.color || undefined,
    label: row.label || "",
  };
}

function toBoardPayload(boardRow, nodeRows, edgeRows) {
  if (!boardRow) return null;

  return {
    key: boardRow.key,
    projectId: boardRow.project_id || null,
    title: boardRow.title,
    description: boardRow.description,
    camera: sanitizeCanvasCamera({
      x: boardRow.camera_x,
      y: boardRow.camera_y,
      z: boardRow.camera_z,
    }),
    nodes: sanitizeCanvasNodes(nodeRows.map(deserializeNode)),
    edges: sanitizeCanvasEdges(edgeRows.map(deserializeEdge)),
  };
}

function buildSeedSnapshot() {
  const projects = studioSeedData.projects.map((project) => ({
    ...clone(project),
    canvas: normalizeBoardPayload(project.id, project.canvas || buildFallbackProjectBoard(project), {
      projectId: project.id,
      title: `${project.name} Canvas`,
      description: project.summary,
    }),
  }));

  return {
    studio: clone(studioSeedData.studio),
    assistant: clone(studioSeedData.assistant),
    canvas: {
      overview: normalizeBoardPayload("overview", studioSeedData.canvas?.overview || {}, {
        title: "Studio Canvas",
        description: studioSeedData.studio?.description || "",
      }),
    },
    projects,
    assets: clone(studioSeedData.assets),
  };
}

export function createSqliteStudioRepository({ dbPath }) {
  const databasePath = path.resolve(dbPath);
  let db = null;
  let initialized = false;

  function openDb() {
    if (db) return db;
    db = new Database(databasePath);
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    return db;
  }

  async function ensureDir() {
    await mkdir(path.dirname(databasePath), { recursive: true });
  }

  async function applyMigrations() {
    const source = await readFile(path.join(process.cwd(), "data", "sql", "migrations", "001_initial_schema.sql"), "utf8");
    openDb().exec(source);
  }

  function seedDatabase() {
    const snapshot = buildSeedSnapshot();
    const database = openDb();
    const hasProjects = database.prepare("SELECT COUNT(*) AS count FROM projects").get();
    if (Number(hasProjects?.count || 0) > 0) {
      return;
    }

    const tx = database.transaction(() => {
      database
        .prepare("INSERT OR REPLACE INTO studio_profile (id, name, base, description) VALUES (1, ?, ?, ?)")
        .run(snapshot.studio.name || "", snapshot.studio.base || "", snapshot.studio.description || "");
      database.prepare("DELETE FROM studio_focus_items WHERE studio_id = 1").run();
      snapshot.studio.focus.forEach((label, index) => {
        database
          .prepare("INSERT INTO studio_focus_items (studio_id, sort_order, label) VALUES (1, ?, ?)")
          .run(index, String(label || ""));
      });

      database.prepare("INSERT OR REPLACE INTO assistant_profiles (scope, greeting) VALUES ('global', ?)").run(
        snapshot.assistant.greeting || "",
      );
      database.prepare("DELETE FROM assistant_starters WHERE scope = 'global'").run();
      snapshot.assistant.starters.forEach((prompt, index) => {
        database
          .prepare("INSERT INTO assistant_starters (scope, sort_order, prompt) VALUES ('global', ?, ?)")
          .run(index, String(prompt || ""));
      });

      for (const [index, project] of snapshot.projects.entries()) {
        database
          .prepare(
            `
              INSERT OR REPLACE INTO projects (
                id, name, client, budget, status, manager, year, location, summary, website, sort_order
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .run(
            project.id,
            project.name || "",
            project.client || "",
            project.budget || "",
            project.status || "",
            project.manager || "",
            project.year || "",
            project.location || "",
            project.summary || "",
            project.website || "",
            index,
          );

        database.prepare("DELETE FROM project_deliverables WHERE project_id = ?").run(project.id);
        project.deliverables.forEach((label, deliverableIndex) => {
          database
            .prepare("INSERT INTO project_deliverables (project_id, sort_order, label) VALUES (?, ?, ?)")
            .run(project.id, deliverableIndex, String(label || ""));
        });

        database.prepare("DELETE FROM project_team_members WHERE project_id = ?").run(project.id);
        project.team.forEach((member, teamIndex) => {
          database
            .prepare("INSERT INTO project_team_members (project_id, sort_order, name, role) VALUES (?, ?, ?, ?)")
            .run(project.id, teamIndex, member?.name || "", member?.role || "");
        });
      }

      for (const [index, asset] of snapshot.assets.entries()) {
        database
          .prepare(
            `
              INSERT OR REPLACE INTO assets (
                id, project_id, title, category, format, size, url, source_label, file_url, sort_order
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .run(
            asset.id,
            asset.projectId || null,
            asset.title || "",
            asset.category || "",
            asset.format || "",
            asset.size || "",
            asset.url || "",
            asset.sourceLabel || "",
            asset.fileUrl || "",
            index,
          );
      }

      saveBoardInternal(database, "overview", snapshot.canvas.overview, {
        projectId: null,
        kind: "overview",
      });

      for (const project of snapshot.projects) {
        saveBoardInternal(database, project.id, project.canvas, {
          projectId: project.id,
          kind: "project",
        });
      }
    });

    tx();
  }

  function saveBoardInternal(database, boardKey, input, options = {}) {
    const existingBoardRow = database.prepare("SELECT * FROM boards WHERE key = ?").get(boardKey);
    const projectId =
      options.projectId !== undefined ? options.projectId : existingBoardRow?.project_id || input?.projectId || null;
    const seed = existingBoardRow
      ? {
          projectId: existingBoardRow.project_id || null,
          title: existingBoardRow.title,
          description: existingBoardRow.description,
          camera: {
            x: existingBoardRow.camera_x,
            y: existingBoardRow.camera_y,
            z: existingBoardRow.camera_z,
          },
        }
      : {
          projectId,
          title: input?.title || "Canvas",
          description: input?.description || "",
        };
    const board = normalizeBoardPayload(boardKey, input, seed);
    const kind = options.kind || existingBoardRow?.kind || (boardKey === "overview" ? "overview" : projectId ? "project" : "workspace");
    const now = new Date().toISOString();

    database
      .prepare(
        `
          INSERT INTO boards (
            key, project_id, kind, title, description, camera_x, camera_y, camera_z, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            project_id = excluded.project_id,
            kind = excluded.kind,
            title = excluded.title,
            description = excluded.description,
            camera_x = excluded.camera_x,
            camera_y = excluded.camera_y,
            camera_z = excluded.camera_z,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        boardKey,
        projectId,
        kind,
        board.title,
        board.description,
        board.camera.x,
        board.camera.y,
        board.camera.z,
        existingBoardRow?.created_at || now,
        now,
      );

    database.prepare("DELETE FROM board_nodes WHERE board_key = ?").run(boardKey);
    for (const [index, node] of board.nodes.entries()) {
      const serialized = serializeNode(node);
      database
        .prepare(
          `
            INSERT INTO board_nodes (
              board_key, node_id, type, x, y, w, h, auto_height, title, label, content,
              description, url, tags_json, file, mime_type, file_kind, size, background,
              background_style, color, extra_json, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          boardKey,
          serialized.nodeId,
          serialized.type,
          serialized.x,
          serialized.y,
          serialized.w,
          serialized.h,
          serialized.autoHeight,
          serialized.title,
          serialized.label,
          serialized.content,
          serialized.description,
          serialized.url,
          serialized.tagsJson,
          serialized.file,
          serialized.mimeType,
          serialized.fileKind,
          serialized.size,
          serialized.background,
          serialized.backgroundStyle,
          serialized.color,
          serialized.extraJson,
          index,
        );
    }

    database.prepare("DELETE FROM board_edges WHERE board_key = ?").run(boardKey);
    for (const [index, edge] of board.edges.entries()) {
      const serialized = serializeEdge(edge);
      database
        .prepare(
          `
            INSERT INTO board_edges (
              board_key, edge_id, from_node_id, to_node_id, from_side, to_side, from_end, to_end,
              color, label, extra_json, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          boardKey,
          serialized.edgeId,
          serialized.fromNodeId,
          serialized.toNodeId,
          serialized.fromSide,
          serialized.toSide,
          serialized.fromEnd,
          serialized.toEnd,
          serialized.color,
          serialized.label,
          serialized.extraJson,
          index,
        );
    }

    return board;
  }

  function readBoardRows(boardKey) {
    const database = openDb();
    const boardRow = database.prepare("SELECT * FROM boards WHERE key = ?").get(boardKey);
    if (!boardRow) {
      return null;
    }

    const nodeRows = database
      .prepare("SELECT * FROM board_nodes WHERE board_key = ? ORDER BY sort_order ASC, node_id ASC")
      .all(boardKey);
    const edgeRows = database
      .prepare("SELECT * FROM board_edges WHERE board_key = ? ORDER BY sort_order ASC, edge_id ASC")
      .all(boardKey);

    return {
      boardRow,
      nodeRows,
      edgeRows,
    };
  }

  function loadProjectCollections() {
    const database = openDb();
    const deliverables = database
      .prepare("SELECT project_id, label FROM project_deliverables ORDER BY project_id ASC, sort_order ASC")
      .all();
    const teams = database
      .prepare("SELECT project_id, name, role FROM project_team_members ORDER BY project_id ASC, sort_order ASC")
      .all();

    const deliverablesByProject = new Map();
    for (const row of deliverables) {
      if (!deliverablesByProject.has(row.project_id)) {
        deliverablesByProject.set(row.project_id, []);
      }
      deliverablesByProject.get(row.project_id).push(row.label);
    }

    const teamsByProject = new Map();
    for (const row of teams) {
      if (!teamsByProject.has(row.project_id)) {
        teamsByProject.set(row.project_id, []);
      }
      teamsByProject.get(row.project_id).push({
        name: row.name,
        role: row.role,
      });
    }

    return {
      deliverablesByProject,
      teamsByProject,
    };
  }

  return {
    provider: "sqlite",
    dbPath: databasePath,
    async ensureInitialized() {
      if (initialized) return;
      await ensureDir();
      await applyMigrations();
      seedDatabase();
      initialized = true;
    },
    async getStudioSnapshot() {
      await this.ensureInitialized();
      const database = openDb();
      const studioRow =
        database.prepare("SELECT id, name, base, description FROM studio_profile WHERE id = 1").get() || {};
      const focusRows = database
        .prepare("SELECT label FROM studio_focus_items WHERE studio_id = 1 ORDER BY sort_order ASC")
        .all();
      const assistantRow = database.prepare("SELECT greeting FROM assistant_profiles WHERE scope = 'global'").get() || {};
      const starterRows = database
        .prepare("SELECT prompt FROM assistant_starters WHERE scope = 'global' ORDER BY sort_order ASC")
        .all();
      const projectRows = database.prepare("SELECT * FROM projects ORDER BY sort_order ASC, id ASC").all();
      const assetRows = database.prepare("SELECT * FROM assets ORDER BY sort_order ASC, id ASC").all();
      const { deliverablesByProject, teamsByProject } = loadProjectCollections();

      const boardsByKey = new Map();
      for (const key of ["overview", ...projectRows.map((project) => project.id)]) {
        const rows = readBoardRows(key);
        if (!rows) continue;
        boardsByKey.set(key, toBoardPayload(rows.boardRow, rows.nodeRows, rows.edgeRows));
      }

      return {
        meta: {
          provider: "sqlite",
        },
        studio: {
          name: studioRow.name || "",
          base: studioRow.base || "",
          description: studioRow.description || "",
          focus: focusRows.map((row) => row.label),
        },
        assistant: {
          greeting: assistantRow.greeting || "",
          starters: starterRows.map((row) => row.prompt),
        },
        canvas: {
          overview: boardsByKey.get("overview") || null,
        },
        projects: projectRows.map((project) => ({
          id: project.id,
          name: project.name,
          client: project.client,
          budget: project.budget,
          status: project.status,
          manager: project.manager,
          year: project.year,
          location: project.location,
          summary: project.summary,
          website: project.website,
          deliverables: deliverablesByProject.get(project.id) || [],
          team: teamsByProject.get(project.id) || [],
          canvas: boardsByKey.get(project.id) || null,
        })),
        assets: assetRows.map((asset) => ({
          id: asset.id,
          title: asset.title,
          category: asset.category,
          format: asset.format,
          size: asset.size,
          url: asset.url,
          projectId: asset.project_id || null,
          sourceLabel: asset.source_label,
          fileUrl: asset.file_url,
        })),
      };
    },
    async getBoard(boardKey) {
      await this.ensureInitialized();
      const rows = readBoardRows(boardKey);
      if (!rows) {
        return null;
      }

      return {
        board: toBoardPayload(rows.boardRow, rows.nodeRows, rows.edgeRows),
        persistence: defaultBoardPersistence(),
      };
    },
    async saveBoard(boardKey, input) {
      await this.ensureInitialized();
      const database = openDb();
      const existingBoard = readBoardRows(boardKey);
      const existingProject = database.prepare("SELECT id FROM projects WHERE id = ?").get(boardKey);

      if (!existingBoard && boardKey !== "overview" && !existingProject) {
        const error = new Error(`Unknown board: ${boardKey}`);
        error.code = "BOARD_NOT_FOUND";
        throw error;
      }

      const tx = database.transaction(() =>
        saveBoardInternal(database, boardKey, input || {}, {
          projectId: boardKey === "overview" ? null : existingProject?.id || input?.projectId || null,
          kind: boardKey === "overview" ? "overview" : existingProject?.id ? "project" : "workspace",
        }),
      );
      const board = tx();

      return {
        board: clone(board),
        persistence: defaultBoardPersistence(),
      };
    },
  };
}
