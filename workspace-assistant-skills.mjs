import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SKILLS_DIR_NAME = "workspace-skills";

function normalizeText(value) {
  return String(value || "").trim();
}

function parseFrontmatter(source) {
  const text = String(source || "");
  if (!text.startsWith("---\n")) {
    return {
      attributes: {},
      body: text,
    };
  }

  const closingIndex = text.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return {
      attributes: {},
      body: text,
    };
  }

  const rawFrontmatter = text.slice(4, closingIndex);
  const body = text.slice(closingIndex + 5);
  const attributes = {};

  for (const rawLine of rawFrontmatter.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) {
      attributes[key] = value;
    }
  }

  return {
    attributes,
    body,
  };
}

function extractSections(markdownBody) {
  const lines = String(markdownBody || "").split(/\r?\n/);
  const sections = new Map();
  let currentTitle = "";
  let currentLines = [];

  const commitSection = () => {
    if (!currentTitle) return;
    sections.set(currentTitle, currentLines.join("\n").trim());
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      commitSection();
      currentTitle = headingMatch[1].trim();
      currentLines = [];
      continue;
    }

    if (currentTitle) {
      currentLines.push(line);
    }
  }

  commitSection();
  return sections;
}

function normalizeArray(input) {
  return Array.isArray(input) ? input.map((item) => normalizeText(item)).filter(Boolean) : [];
}

async function readJsonIfExists(filePath, fallback) {
  try {
    const source = await readFile(filePath, "utf8");
    return JSON.parse(source);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function buildSkillPublicEntry(skill) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    aliases: [...skill.aliases],
    defaultEnabled: skill.defaultEnabled,
    mode: skill.mode,
  };
}

function collectContextText(workspaceContext = {}, messages = []) {
  const messageText = messages
    .map((message) => normalizeText(message?.content))
    .filter(Boolean)
    .join("\n");

  const board = workspaceContext?.board || {};
  const boardNodes = Array.isArray(board.nodes) ? board.nodes : [];
  const focus = workspaceContext?.focus || {};
  const focusNodes = [
    ...(Array.isArray(focus.contextNodes) ? focus.contextNodes : []),
    ...(Array.isArray(focus.selectedNodes) ? focus.selectedNodes : []),
    ...(Array.isArray(focus.connectedNodes) ? focus.connectedNodes : []),
    ...(Array.isArray(focus.visibleNodes) ? focus.visibleNodes : []),
  ];

  return [
    messageText,
    normalizeText(board.title),
    normalizeText(board.description),
    ...boardNodes.map((node) =>
      [
        normalizeText(node?.title),
        normalizeText(node?.label),
        normalizeText(node?.content),
        normalizeText(node?.description),
        normalizeText(node?.url),
      ]
        .filter(Boolean)
        .join(" "),
    ),
    ...focusNodes.map((node) =>
      [
        normalizeText(node?.title),
        normalizeText(node?.label),
        normalizeText(node?.content),
        normalizeText(node?.description),
        normalizeText(node?.url),
      ]
        .filter(Boolean)
        .join(" "),
    ),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function extractExplicitMentions(messages = []) {
  const mentions = new Set();
  for (const message of messages) {
    const content = normalizeText(message?.content);
    if (!content) continue;
    const matches = content.matchAll(/@([a-zA-Z0-9_-]+)/g);
    for (const match of matches) {
      const value = normalizeText(match?.[1]).toLowerCase();
      if (value) {
        mentions.add(value);
      }
    }
  }
  return mentions;
}

function isSkillActivated(skill, contextText, explicitMentions) {
  const idsToMatch = [skill.id, skill.name, ...skill.aliases].map((value) => normalizeText(value).toLowerCase());
  if (idsToMatch.some((value) => explicitMentions.has(value))) {
    return true;
  }

  return skill.triggerKeywords.some((keyword) => contextText.includes(keyword.toLowerCase()));
}

function buildCatalogPrompt(skills) {
  if (!Array.isArray(skills) || skills.length === 0) {
    return "Workspace skills: none enabled.";
  }

  return [
    "Workspace skills currently enabled:",
    ...skills.map((skill) => {
      const aliasText = skill.aliases.length > 0 ? ` aliases: ${skill.aliases.join(", ")}` : "";
      return `- ${skill.id}: ${skill.description}${aliasText}`;
    }),
  ].join("\n");
}

function buildDetailedPrompt(activeSkills) {
  if (!Array.isArray(activeSkills) || activeSkills.length === 0) {
    return "";
  }

  return [
    "Activated workspace skills:",
    ...activeSkills.map((skill) => {
      const sections = skill.loadSections
        .map((title) => {
          const body = skill.sections.get(title);
          if (!body) return "";
          return `## ${title}\n${body}`;
        })
        .filter(Boolean)
        .join("\n\n");

      return [`### Skill: ${skill.id}`, sections].filter(Boolean).join("\n\n");
    }),
  ].join("\n\n");
}

export async function loadWorkspaceSkillCatalog({ rootDir = process.cwd() } = {}) {
  const skillsRoot = path.join(rootDir, SKILLS_DIR_NAME);
  const directoryEntries = await readdir(skillsRoot, { withFileTypes: true });
  const skillDirectories = directoryEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  const skills = [];

  for (const directoryName of skillDirectories) {
    const skillDir = path.join(skillsRoot, directoryName);
    const skillSource = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
    const adapter = await readJsonIfExists(path.join(skillDir, "workspace-adapter.json"), {});
    const { attributes, body } = parseFrontmatter(skillSource);
    const sections = extractSections(body);

    const id = directoryName;
    const name = normalizeText(attributes.name) || id;
    const description = normalizeText(attributes.description);
    const aliases = normalizeArray(adapter.aliases);
    const loadSections = normalizeArray(adapter.loadSections);

    skills.push({
      id,
      name,
      description,
      aliases,
      defaultEnabled: adapter.defaultEnabled !== false,
      mode: normalizeText(adapter.mode) || "prompt-safe",
      triggerKeywords: normalizeArray(adapter.triggerKeywords),
      loadSections,
      sections,
      path: skillDir,
    });
  }

  return {
    rootDir,
    skills,
  };
}

export async function resolveWorkspaceAssistantSkillContext({
  rootDir = process.cwd(),
  workspaceContext = {},
  messages = [],
} = {}) {
  const catalog = await loadWorkspaceSkillCatalog({ rootDir });
  const enabledSkills = catalog.skills.filter((skill) => skill.defaultEnabled);
  const contextText = collectContextText(workspaceContext, messages);
  const explicitMentions = extractExplicitMentions(messages);
  const activeSkills = enabledSkills.filter((skill) => isSkillActivated(skill, contextText, explicitMentions));

  return {
    skills: enabledSkills.map(buildSkillPublicEntry),
    activeSkills: activeSkills.map(buildSkillPublicEntry),
    catalogPrompt: buildCatalogPrompt(enabledSkills),
    detailedPrompt: buildDetailedPrompt(activeSkills),
  };
}
