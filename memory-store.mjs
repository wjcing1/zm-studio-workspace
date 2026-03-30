import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SCOPE_TYPES = new Set(["project", "board", "team", "user"]);

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizeScopeType(scopeType) {
  const normalized = typeof scopeType === "string" ? scopeType.trim().toLowerCase() : "";
  return DEFAULT_SCOPE_TYPES.has(normalized) ? normalized : "";
}

function normalizeScopeId(scopeId) {
  return typeof scopeId === "string" ? scopeId.trim().slice(0, 120) : "";
}

function scopeFilename(scopeType, scopeId) {
  return `${scopeType}__${encodeURIComponent(scopeId)}.json`;
}

function buildMemoryId(input) {
  const source = [
    input.scopeType,
    input.scopeId,
    input.memoryType,
    typeof input.summary === "string" ? input.summary.trim().toLowerCase() : "",
  ].join("::");
  return `mem_${createHash("sha1").update(source).digest("hex").slice(0, 16)}`;
}

function uniqueStrings(values, limit) {
  const seen = new Set();
  const output = [];

  for (const value of values || []) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized.slice(0, 200));

    if (output.length >= limit) break;
  }

  return output;
}

function normalizeMemoryType(memoryType) {
  const value = typeof memoryType === "string" ? memoryType.trim().toLowerCase() : "";
  if (["preference", "constraint", "decision", "fact", "pattern"].includes(value)) {
    return value;
  }
  return "fact";
}

function normalizeTimestamp(value, fallback = "") {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return fallback;
}

function normalizeMemoryItem(input, existing = null) {
  const scopeType = normalizeScopeType(input?.scopeType || existing?.scopeType);
  const scopeId = normalizeScopeId(input?.scopeId || existing?.scopeId);
  const summary = typeof input?.summary === "string" ? input.summary.trim().slice(0, 240) : existing?.summary || "";

  if (!scopeType || !scopeId || !summary) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: typeof existing?.id === "string" && existing.id ? existing.id : buildMemoryId({ scopeType, scopeId, memoryType: input?.memoryType, summary }),
    scopeType,
    scopeId,
    memoryType: normalizeMemoryType(input?.memoryType || existing?.memoryType),
    summary,
    facts: uniqueStrings([...(existing?.facts || []), ...(input?.facts || [])], 6),
    tags: uniqueStrings([...(existing?.tags || []), ...(input?.tags || [])], 8),
    sourceKind: typeof input?.sourceKind === "string" ? input.sourceKind.slice(0, 40) : existing?.sourceKind || "chat",
    sourceRef: typeof input?.sourceRef === "string" ? input.sourceRef.slice(0, 160) : existing?.sourceRef || "",
    confidence: Math.max(
      0,
      Math.min(
        1,
        typeof input?.confidence === "number" ? input.confidence : typeof existing?.confidence === "number" ? existing.confidence : 0.5,
      ),
    ),
    lastUsedAt: normalizeTimestamp(input?.lastUsedAt, existing?.lastUsedAt || ""),
    createdAt: normalizeTimestamp(existing?.createdAt, now),
    updatedAt: now,
  };
}

function keywordParts(text) {
  const source = String(text || "").toLowerCase();
  const matches = source.match(/[\p{Script=Han}]+|[\p{Letter}\p{Number}]{2,}/gu) || [];
  const keywords = new Set();

  for (const match of matches) {
    if (/[\p{Script=Han}]/u.test(match)) {
      for (let size = 2; size <= 4; size += 1) {
        for (let index = 0; index <= match.length - size; index += 1) {
          keywords.add(match.slice(index, index + size));
        }
      }
      keywords.add(match.slice(0, 8));
      continue;
    }

    keywords.add(match);
  }

  return [...keywords].filter((value) => value.length >= 2).slice(0, 40);
}

function recencyBonus(item) {
  const reference = item.lastUsedAt || item.updatedAt || item.createdAt;
  const timestamp = Number(new Date(reference));
  if (!Number.isFinite(timestamp)) return 0;

  const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (ageDays <= 1) return 12;
  if (ageDays <= 7) return 8;
  if (ageDays <= 30) return 4;
  return 0;
}

function scoreMemory(item, query, scopeIndex) {
  const haystack = [
    item.summary,
    ...(item.facts || []),
    ...(item.tags || []),
    item.memoryType,
    item.scopeType,
    item.scopeId,
  ]
    .join(" ")
    .toLowerCase();

  let score = Math.max(0, 120 - scopeIndex * 12) + recencyBonus(item) + Math.round((item.confidence || 0) * 10);
  for (const keyword of keywordParts(query)) {
    if (haystack.includes(keyword)) {
      score += keyword.length >= 4 ? 6 : 3;
    }
  }

  return score;
}

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export function createMemoryStore({
  storageDir = path.join(process.cwd(), ".data", "memory"),
} = {}) {
  async function ensureDir() {
    await mkdir(storageDir, { recursive: true });
  }

  async function readScope(scopeType, scopeId) {
    const normalizedType = normalizeScopeType(scopeType);
    const normalizedId = normalizeScopeId(scopeId);

    if (!normalizedType || !normalizedId) {
      return {
        scopeType: normalizedType,
        scopeId: normalizedId,
        items: [],
      };
    }

    const filePath = path.join(storageDir, scopeFilename(normalizedType, normalizedId));
    try {
      const payload = await readJson(filePath);
      return {
        scopeType: normalizedType,
        scopeId: normalizedId,
        items: Array.isArray(payload?.items) ? payload.items : [],
      };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return {
          scopeType: normalizedType,
          scopeId: normalizedId,
          items: [],
        };
      }
      throw error;
    }
  }

  async function writeScope(scopeType, scopeId, items) {
    const normalizedType = normalizeScopeType(scopeType);
    const normalizedId = normalizeScopeId(scopeId);
    if (!normalizedType || !normalizedId) return;

    await ensureDir();
    const filePath = path.join(storageDir, scopeFilename(normalizedType, normalizedId));
    await writeFile(
      filePath,
      JSON.stringify(
        {
          scopeType: normalizedType,
          scopeId: normalizedId,
          items,
        },
        null,
        2,
      ),
    );
  }

  return {
    storageDir,
    async listScopeMemories(scopeType, scopeId) {
      const scope = await readScope(scopeType, scopeId);
      return clone(
        scope.items.slice().sort((left, right) => {
          const leftTime = Number(new Date(left.updatedAt || left.createdAt || 0));
          const rightTime = Number(new Date(right.updatedAt || right.createdAt || 0));
          return rightTime - leftTime;
        }),
      );
    },
    async upsertMemories(input) {
      const items = Array.isArray(input) ? input : [];
      const groups = new Map();

      for (const item of items) {
        const scopeType = normalizeScopeType(item?.scopeType);
        const scopeId = normalizeScopeId(item?.scopeId);
        if (!scopeType || !scopeId) continue;

        const key = `${scopeType}::${scopeId}`;
        if (!groups.has(key)) {
          groups.set(key, {
            scopeType,
            scopeId,
            items: [],
          });
        }
        groups.get(key).items.push(item);
      }

      const saved = [];

      for (const group of groups.values()) {
        const scope = await readScope(group.scopeType, group.scopeId);
        const existingById = new Map(
          scope.items
            .map((item) => normalizeMemoryItem(item))
            .filter(Boolean)
            .map((item) => [item.id, item]),
        );

        for (const rawItem of group.items) {
          const normalized = normalizeMemoryItem(rawItem);
          if (!normalized) continue;

          const previous = existingById.get(normalized.id) || null;
          const merged = normalizeMemoryItem(normalized, previous);
          if (!merged) continue;
          existingById.set(merged.id, merged);
          saved.push(merged);
        }

        await writeScope(group.scopeType, group.scopeId, [...existingById.values()]);
      }

      return clone(saved);
    },
    async findRelevantMemories({
      scopes = [],
      query = "",
      limit = 5,
    } = {}) {
      const ranked = [];

      for (const [index, scope] of scopes.entries()) {
        const scopeType = normalizeScopeType(scope?.scopeType);
        const scopeId = normalizeScopeId(scope?.scopeId);
        if (!scopeType || !scopeId) continue;

        const items = await this.listScopeMemories(scopeType, scopeId);
        for (const item of items) {
          ranked.push({
            item,
            score: scoreMemory(item, query, index),
          });
        }
      }

      return ranked
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;

          const leftTime = Number(new Date(left.item.updatedAt || left.item.createdAt || 0));
          const rightTime = Number(new Date(right.item.updatedAt || right.item.createdAt || 0));
          return rightTime - leftTime;
        })
        .slice(0, Math.max(1, Math.min(20, limit)))
        .map((entry) => clone(entry.item));
    },
    async touchMemories(ids = []) {
      const targetIds = new Set((Array.isArray(ids) ? ids : []).filter(Boolean));
      if (targetIds.size === 0) return [];

      const touched = [];

      await ensureDir();
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(storageDir).catch(() => []);
      const now = new Date().toISOString();

      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;

        const filePath = path.join(storageDir, entry);
        const payload = await readJson(filePath).catch(() => null);
        if (!payload || !Array.isArray(payload.items)) continue;

        let changed = false;
        const nextItems = payload.items.map((item) => {
          if (!targetIds.has(item.id)) return item;
          changed = true;
          const nextItem = {
            ...item,
            lastUsedAt: now,
            updatedAt: item.updatedAt || now,
          };
          touched.push(nextItem);
          return nextItem;
        });

        if (changed) {
          await writeFile(
            filePath,
            JSON.stringify(
              {
                scopeType: payload.scopeType,
                scopeId: payload.scopeId,
                items: nextItems,
              },
              null,
              2,
            ),
          );
        }
      }

      return clone(touched);
    },
  };
}
