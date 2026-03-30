function latestUserMessage(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && typeof message.content === "string" && message.content.trim()) {
      return message.content.trim();
    }
  }

  return "";
}

function cleanSummary(text) {
  return String(text || "")
    .trim()
    .replace(/^(记住|记下|remember|note)\s*[:：-]?\s*/iu, "")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

function hasDurabilityCue(text) {
  return /(记住|记下|以后|默认|本项目|这个项目|不要|不能|优先|保持|always|default|remember|prefer|avoid|do not|don't)/iu.test(
    text,
  );
}

function chooseMemoryType(text) {
  if (/(不要|不能|避免|禁止|avoid|do not|don't|must not)/iu.test(text)) {
    return "constraint";
  }
  if (/(决定|采用|定为|保留|保持|use this|decide|chosen)/iu.test(text)) {
    return "decision";
  }
  if (/(默认|优先|以后|always|default|prefer|remember)/iu.test(text)) {
    return "preference";
  }
  return "fact";
}

function chooseScope(text, workspaceContext) {
  const boardKey = typeof workspaceContext?.board?.key === "string" ? workspaceContext.board.key.trim() : "";
  const projectId = typeof workspaceContext?.board?.projectId === "string" ? workspaceContext.board.projectId.trim() : "";

  if (/(画布|board|当前板|当前画布)/iu.test(text) && boardKey) {
    return {
      scopeType: "board",
      scopeId: boardKey,
    };
  }

  if (projectId) {
    return {
      scopeType: "project",
      scopeId: projectId,
    };
  }

  return {
    scopeType: "board",
    scopeId: boardKey || "workspace",
  };
}

function buildFacts(summary) {
  const segments = String(summary || "")
    .split(/[。！？!?\n；;]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  return segments.slice(0, 4);
}

function buildTags(summary, memoryType, scopeType) {
  const tags = [memoryType, scopeType];
  const source = String(summary || "");

  if (/(默认|default)/iu.test(source)) tags.push("default");
  if (/(简洁|精简|concise)/iu.test(source)) tags.push("concise");
  if (/(摘要|总结|summary)/iu.test(source)) tags.push("summary");
  if (/(里程碑|milestone)/iu.test(source)) tags.push("milestone");
  if (/(画布|board)/iu.test(source)) tags.push("board");
  if (/(项目|project)/iu.test(source)) tags.push("project");

  return [...new Set(tags)].slice(0, 8);
}

export function deriveMemoryScopes(workspaceContext) {
  const scopes = [];
  const projectId = typeof workspaceContext?.board?.projectId === "string" ? workspaceContext.board.projectId.trim() : "";
  const boardKey = typeof workspaceContext?.board?.key === "string" ? workspaceContext.board.key.trim() : "";

  if (projectId) {
    scopes.push({
      scopeType: "project",
      scopeId: projectId,
    });
  }

  if (boardKey) {
    scopes.push({
      scopeType: "board",
      scopeId: boardKey,
    });
  }

  return scopes;
}

export function buildMemoryLookupQuery({
  workspaceContext,
  messages = [],
} = {}) {
  return [
    latestUserMessage(messages),
    workspaceContext?.board?.title || "",
    workspaceContext?.board?.description || "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function extractDurableMemories({
  workspaceContext,
  messages = [],
} = {}) {
  const text = latestUserMessage(messages);
  if (!text || !hasDurabilityCue(text)) {
    return [];
  }

  const scope = chooseScope(text, workspaceContext);
  if (!scope.scopeType || !scope.scopeId) {
    return [];
  }

  const memoryType = chooseMemoryType(text);
  const summary = cleanSummary(text);
  const facts = buildFacts(summary);
  const boardKey = typeof workspaceContext?.board?.key === "string" ? workspaceContext.board.key.trim() : "";

  return [
    {
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      memoryType,
      summary,
      facts: facts.length > 0 ? facts : [summary],
      tags: buildTags(summary, memoryType, scope.scopeType),
      sourceKind: "chat",
      sourceRef: boardKey ? `board:${boardKey}` : "",
      confidence: 0.84,
    },
  ];
}

export function formatMemoriesForPrompt(memories = [], { limit = 5 } = {}) {
  const items = Array.isArray(memories) ? memories.slice(0, Math.max(1, Math.min(10, limit))) : [];

  if (items.length === 0) {
    return "Long-term memory:\n- none";
  }

  return [
    "Long-term memory:",
    ...items.map((item) => {
      const facts = Array.isArray(item.facts) && item.facts.length > 0 ? ` Facts: ${item.facts.join(" | ")}` : "";
      const tags = Array.isArray(item.tags) && item.tags.length > 0 ? ` Tags: ${item.tags.join(", ")}` : "";
      return `- [${item.scopeType} ${item.scopeId}] ${item.memoryType}: ${item.summary}${facts}${tags}`;
    }),
  ].join("\n");
}
