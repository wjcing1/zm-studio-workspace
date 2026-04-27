import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { findSkillInCatalog, loadSkillBody } from "./workspace-assistant-skills.mjs";

const DEFAULT_BASH_TIMEOUT_MS = 30_000;
const MAX_BASH_TIMEOUT_MS = 120_000;
const MAX_TOOL_OUTPUT_BYTES = 100_000;
const MAX_FILE_READ_BYTES = 200_000;
const MAX_FILE_WRITE_BYTES = 500_000;

export const AGENT_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "load_skill",
      description:
        "Load the full SKILL.md instructions for a skill listed in <available_skills>. Call this once you've decided a skill applies to the user's request. Returns the SKILL.md body (without frontmatter) plus the skill's base directory so you can run bundled scripts.",
      parameters: {
        type: "object",
        properties: {
          skill_id: {
            type: "string",
            description: "The skill id — the key shown in <available_skills> (e.g. \"pptx\").",
          },
        },
        required: ["skill_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description:
        "Execute a shell command in a sandboxed working directory. Use this to run scripts bundled with skills (e.g. `python /path/to/skills/pptx/scripts/build.py`). cwd defaults to your private session directory. Timeout default 30s.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to run via `bash -c`." },
          cwd: {
            type: "string",
            description:
              "Optional working directory. Must resolve inside the session sandbox or under workspace-skills/. Defaults to the session sandbox.",
          },
          timeout_ms: {
            type: "number",
            description: `Max execution time in milliseconds (default ${DEFAULT_BASH_TIMEOUT_MS}, max ${MAX_BASH_TIMEOUT_MS}).`,
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a UTF-8 text file. Path must resolve inside the session sandbox or under workspace-skills/. Use this to inspect skill resources (FORMS.md, REFERENCE.md, templates, etc.) referenced by SKILL.md.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or session-relative file path." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write a UTF-8 text file inside the session sandbox. Use for intermediate JSON/markdown/HTML the skill scripts will consume. Cannot overwrite files outside the session directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or session-relative file path." },
          content: { type: "string", description: "File contents." },
        },
        required: ["path", "content"],
      },
    },
  },
];

export async function createSkillSession({ rootDir }) {
  const sessionId = crypto.randomBytes(8).toString("hex");
  const sessionDir = path.join(rootDir, ".data", "skill-sessions", sessionId);
  await mkdir(sessionDir, { recursive: true });
  return { sessionId, sessionDir };
}

export async function destroySkillSession({ sessionDir }) {
  if (!sessionDir) return;
  try {
    await rm(sessionDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Failed to clean session dir ${sessionDir}: ${error?.message || error}`);
  }
}

function resolveWithinAllowed(rawPath, { sessionDir, allowedRoots }) {
  if (typeof rawPath !== "string" || !rawPath) {
    throw new Error("Path must be a non-empty string.");
  }
  const resolved = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(sessionDir, rawPath);
  const isAllowed = allowedRoots.some((root) => {
    const normalizedRoot = path.resolve(root);
    return resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path.sep);
  });
  if (!isAllowed) {
    throw new Error(`Path "${rawPath}" is outside the sandbox (sessionDir or workspace-skills/).`);
  }
  return resolved;
}

function truncate(text, maxBytes = MAX_TOOL_OUTPUT_BYTES) {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.length <= maxBytes) return text;
  return buffer.subarray(0, maxBytes).toString("utf8") + `\n…[truncated, ${buffer.length - maxBytes} more bytes]`;
}

async function runBash({ command, cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", command], { cwd, env: { ...process.env, PYTHONUNBUFFERED: "1" } });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const onChunk = (target, chunk) => {
      if (target === "stdout" && stdoutBytes < MAX_TOOL_OUTPUT_BYTES) {
        const remaining = MAX_TOOL_OUTPUT_BYTES - stdoutBytes;
        const piece = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
        stdout += piece.toString("utf8");
        stdoutBytes += piece.length;
      } else if (target === "stderr" && stderrBytes < MAX_TOOL_OUTPUT_BYTES) {
        const remaining = MAX_TOOL_OUTPUT_BYTES - stderrBytes;
        const piece = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
        stderr += piece.toString("utf8");
        stderrBytes += piece.length;
      }
    };

    child.stdout.on("data", (chunk) => onChunk("stdout", chunk));
    child.stderr.on("data", (chunk) => onChunk("stderr", chunk));

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({
        exit_code: code,
        signal,
        timed_out: timedOut,
        stdout,
        stderr,
        truncated: stdoutBytes >= MAX_TOOL_OUTPUT_BYTES || stderrBytes >= MAX_TOOL_OUTPUT_BYTES,
      });
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        exit_code: -1,
        error: error?.message || String(error),
        stdout,
        stderr,
      });
    });
  });
}

async function handleLoadSkill(args, { catalog }) {
  const skillId = typeof args?.skill_id === "string" ? args.skill_id : "";
  const skill = findSkillInCatalog(catalog, skillId);
  if (!skill) {
    return {
      ok: false,
      error: `Skill "${skillId}" not found. Available: ${catalog.skills.map((s) => s.id).join(", ") || "(none)"}.`,
    };
  }

  const body = await loadSkillBody({ skillMdPath: skill.skillMdPath });
  return {
    ok: true,
    skill_id: skill.id,
    base_path: skill.basePath,
    instructions: body,
  };
}

async function handleBash(args, ctx) {
  const command = typeof args?.command === "string" ? args.command : "";
  if (!command.trim()) return { ok: false, error: "command must be a non-empty string." };

  let cwd = ctx.sessionDir;
  if (typeof args?.cwd === "string" && args.cwd) {
    try {
      cwd = resolveWithinAllowed(args.cwd, ctx);
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  const timeoutMs = Math.max(
    1000,
    Math.min(MAX_BASH_TIMEOUT_MS, Number(args?.timeout_ms) || DEFAULT_BASH_TIMEOUT_MS),
  );

  const result = await runBash({ command, cwd, timeoutMs });
  return {
    ok: result.exit_code === 0 && !result.timed_out,
    cwd,
    timeout_ms: timeoutMs,
    ...result,
    stdout: truncate(result.stdout || ""),
    stderr: truncate(result.stderr || ""),
  };
}

async function handleReadFile(args, ctx) {
  let resolved;
  try {
    resolved = resolveWithinAllowed(args?.path, ctx);
  } catch (error) {
    return { ok: false, error: error.message };
  }

  try {
    const buffer = await readFile(resolved);
    if (buffer.length > MAX_FILE_READ_BYTES) {
      return {
        ok: false,
        error: `File too large (${buffer.length} bytes; limit ${MAX_FILE_READ_BYTES}).`,
        path: resolved,
      };
    }
    return { ok: true, path: resolved, content: buffer.toString("utf8") };
  } catch (error) {
    return { ok: false, error: error?.message || String(error), path: resolved };
  }
}

async function handleWriteFile(args, ctx) {
  let resolved;
  try {
    resolved = resolveWithinAllowed(args?.path, ctx);
  } catch (error) {
    return { ok: false, error: error.message };
  }

  if (!resolved.startsWith(path.resolve(ctx.sessionDir) + path.sep) && resolved !== path.resolve(ctx.sessionDir)) {
    return { ok: false, error: "write_file may only write inside the session sandbox." };
  }

  const content = typeof args?.content === "string" ? args.content : "";
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_WRITE_BYTES) {
    return { ok: false, error: `Content exceeds ${MAX_FILE_WRITE_BYTES}-byte write limit.` };
  }

  try {
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, content, "utf8");
    return { ok: true, path: resolved, bytes_written: Buffer.byteLength(content, "utf8") };
  } catch (error) {
    return { ok: false, error: error?.message || String(error), path: resolved };
  }
}

export async function executeAgentTool({ toolCall, catalog, sessionDir }) {
  const name = toolCall?.function?.name;
  let args = {};
  try {
    args = JSON.parse(toolCall?.function?.arguments || "{}");
  } catch {
    return { ok: false, error: "Tool arguments are not valid JSON." };
  }

  const ctx = {
    sessionDir,
    catalog,
    allowedRoots: [sessionDir, catalog.skillsRoot],
  };

  switch (name) {
    case "load_skill":
      return await handleLoadSkill(args, ctx);
    case "bash":
      return await handleBash(args, ctx);
    case "read_file":
      return await handleReadFile(args, ctx);
    case "write_file":
      return await handleWriteFile(args, ctx);
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
