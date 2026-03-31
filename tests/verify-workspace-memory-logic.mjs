import process from "node:process";

async function main() {
  let memoryLogic;

  try {
    memoryLogic = await import("../workspace-memory.mjs");
  } catch (error) {
    throw new Error(
      `workspace memory logic is missing: ${error instanceof Error ? error.message : "unknown import error"}`,
    );
  }

  const {
    deriveMemoryScopes,
    extractDurableMemories,
    formatMemoriesForPrompt,
  } = memoryLogic;

  const workspaceContext = {
    board: {
      key: "PRJ-001",
      projectId: "PRJ-001",
      title: "Museum Renewal Canvas",
      description: "Concept board for renewal project.",
      nodes: [],
      edges: [],
    },
    focus: {},
  };

  const scopes = deriveMemoryScopes(workspaceContext);
  if (scopes.length !== 2) {
    throw new Error(`Expected project and board scopes, got ${scopes.length}`);
  }

  const durable = extractDurableMemories({
    workspaceContext,
    messages: [
      { role: "user", content: "记住：本项目以后默认使用简洁的里程碑式摘要，不要写成长段落。" },
    ],
  });

  if (durable.length !== 1) {
    throw new Error(`Expected 1 durable memory to be extracted, got ${durable.length}`);
  }

  if (durable[0].scopeType !== "project" || durable[0].scopeId !== "PRJ-001") {
    throw new Error("Project-scoped durable instruction should be stored at the project scope.");
  }

  if (durable[0].memoryType !== "preference" && durable[0].memoryType !== "constraint") {
    throw new Error(`Unexpected memory type ${durable[0].memoryType}`);
  }

  const ignored = extractDurableMemories({
    workspaceContext,
    messages: [
      { role: "user", content: "帮我整理一下附近的节点，顺一下逻辑。" },
    ],
  });

  if (ignored.length !== 0) {
    throw new Error("Ordinary one-off workspace requests should not become long-term memory.");
  }

  const promptSection = formatMemoriesForPrompt([
    {
      id: "m1",
      scopeType: "project",
      scopeId: "PRJ-001",
      memoryType: "preference",
      summary: "默认使用简洁的里程碑式摘要。",
      facts: ["避免冗长段落"],
      tags: ["default", "summary"],
    },
    {
      id: "m2",
      scopeType: "board",
      scopeId: "PRJ-001",
      memoryType: "decision",
      summary: "当前画布保持高层分组，不展开次级节点。",
      facts: ["保持高层分组"],
      tags: ["grouping"],
    },
  ]);

  if (!promptSection.includes("Long-term memory")) {
    throw new Error("Formatted memory prompt should include a labeled long-term memory section.");
  }

  if (!promptSection.includes("PRJ-001") || !promptSection.includes("默认使用简洁的里程碑式摘要")) {
    throw new Error("Formatted memory prompt should include scope and summary details.");
  }

  console.log("PASS: workspace memory extraction and prompt formatting are valid.");
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
