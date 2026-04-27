import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SKILLS_DIR_NAME = "workspace-skills";
const AVAILABLE_SKILLS_MAX_CHARS = 15000;

function normalizeText(value) {
  return String(value || "").trim();
}

function parseFrontmatter(source) {
  const text = String(source || "").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) {
    return { attributes: {}, body: text };
  }

  const closingIndex = text.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return { attributes: {}, body: text };
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

  return { attributes, body };
}

function stripFrontmatter(source) {
  return parseFrontmatter(source).body.replace(/^\s+/, "");
}

function buildSkillPublicEntry(skill) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
  };
}

export async function loadSkillCatalog({ rootDir = process.cwd() } = {}) {
  const skillsRoot = path.join(rootDir, SKILLS_DIR_NAME);
  let directoryEntries;
  try {
    directoryEntries = await readdir(skillsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { rootDir, skillsRoot, skills: [] };
    }
    throw error;
  }

  const skillDirectories = directoryEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const skills = [];

  for (const directoryName of skillDirectories) {
    const skillDir = path.join(skillsRoot, directoryName);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    let skillSource;
    try {
      skillSource = await readFile(skillMdPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    const { attributes } = parseFrontmatter(skillSource);
    const id = directoryName;
    const name = normalizeText(attributes.name) || id;
    const description = normalizeText(attributes.description);

    skills.push({
      id,
      name,
      description,
      basePath: skillDir,
      skillMdPath,
    });
  }

  return { rootDir, skillsRoot, skills };
}

export async function loadSkillBody({ skillMdPath }) {
  const source = await readFile(skillMdPath, "utf8");
  return stripFrontmatter(source);
}

export function findSkillInCatalog(catalog, skillId) {
  const target = normalizeText(skillId).toLowerCase();
  if (!target) return null;
  return (
    catalog.skills.find((skill) => skill.id.toLowerCase() === target) ||
    catalog.skills.find((skill) => skill.name.toLowerCase() === target) ||
    null
  );
}

export function buildAvailableSkillsXml(catalog, { maxChars = AVAILABLE_SKILLS_MAX_CHARS } = {}) {
  const skills = Array.isArray(catalog?.skills) ? catalog.skills : [];
  if (skills.length === 0) {
    return "<available_skills>\n  (no skills installed)\n</available_skills>";
  }

  const lines = [];
  let used = 0;
  let truncated = 0;

  for (const skill of skills) {
    const description = skill.description || "(no description)";
    const line = `  "${skill.id}": ${description}`;
    if (used + line.length + 1 > maxChars) {
      truncated += 1;
      continue;
    }
    lines.push(line);
    used += line.length + 1;
  }

  const footer =
    truncated > 0 ? `\n  (${truncated} additional skill(s) omitted: catalog exceeds ${maxChars}-char budget)` : "";

  return `<available_skills>\n${lines.join("\n")}${footer}\n</available_skills>`;
}

export function buildSkillsPublicSummary(catalog) {
  return Array.isArray(catalog?.skills) ? catalog.skills.map(buildSkillPublicEntry) : [];
}
