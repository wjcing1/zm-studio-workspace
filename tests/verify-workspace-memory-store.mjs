import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  let memoryStoreModule;

  try {
    memoryStoreModule = await import("../memory-store.mjs");
  } catch (error) {
    throw new Error(
      `workspace memory store is missing: ${error instanceof Error ? error.message : "unknown import error"}`,
    );
  }

  const { createMemoryStore } = memoryStoreModule;
  const storageDir = path.join(process.cwd(), ".tmp", `memory-store-${process.pid}`);

  await rm(storageDir, { recursive: true, force: true });

  try {
    const store = createMemoryStore({ storageDir });

    await store.upsertMemories([
      {
        scopeType: "project",
        scopeId: "PRJ-001",
        memoryType: "preference",
        summary: "以后默认使用简洁的里程碑式摘要。",
        facts: ["默认使用简洁摘要"],
        tags: ["default", "summary"],
        sourceKind: "chat",
        sourceRef: "board:PRJ-001",
        confidence: 0.84,
      },
      {
        scopeType: "board",
        scopeId: "overview",
        memoryType: "decision",
        summary: "总览画布保留高层分组，不展开细项。",
        facts: ["保留高层分组"],
        tags: ["overview", "grouping"],
        sourceKind: "chat",
        sourceRef: "board:overview",
        confidence: 0.78,
      },
    ]);

    await store.upsertMemories([
      {
        scopeType: "project",
        scopeId: "PRJ-001",
        memoryType: "preference",
        summary: "以后默认使用简洁的里程碑式摘要。",
        facts: ["避免冗长段落"],
        tags: ["concise"],
        sourceKind: "chat",
        sourceRef: "board:PRJ-001",
        confidence: 0.9,
      },
    ]);

    const projectMemories = await store.listScopeMemories("project", "PRJ-001");
    if (projectMemories.length !== 1) {
      throw new Error(`Expected duplicate project memories to merge into 1 item, got ${projectMemories.length}`);
    }

    if (!projectMemories[0].facts.includes("默认使用简洁摘要") || !projectMemories[0].facts.includes("避免冗长段落")) {
      throw new Error("Merged project memory should preserve and merge facts.");
    }

    if (!projectMemories[0].tags.includes("summary") || !projectMemories[0].tags.includes("concise")) {
      throw new Error("Merged project memory should preserve and merge tags.");
    }

    const ranked = await store.findRelevantMemories({
      scopes: [
        { scopeType: "project", scopeId: "PRJ-001" },
        { scopeType: "board", scopeId: "overview" },
      ],
      query: "以后默认用简洁摘要整理这个项目",
      limit: 5,
    });

    if (ranked.length < 2) {
      throw new Error(`Expected at least 2 relevant memories, got ${ranked.length}`);
    }

    if (ranked[0].scopeType !== "project" || ranked[0].scopeId !== "PRJ-001") {
      throw new Error("Project memory should rank ahead of unrelated board memory for a matching project query.");
    }

    await store.touchMemories([ranked[0].id]);
    const touched = await store.listScopeMemories("project", "PRJ-001");
    if (!touched[0].lastUsedAt) {
      throw new Error("Touched memory should record lastUsedAt.");
    }

    console.log("PASS: workspace memory store behavior is valid.");
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
