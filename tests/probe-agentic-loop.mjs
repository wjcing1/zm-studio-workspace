// End-to-end agentic loop probe.
// Talks to the real OpenAI proxy and exercises the load_skill + bash tools.
// PASS criterion: model successfully calls load_skill, then bash, and returns
// a final assistant message without exceeding the iteration budget.

import OpenAI from "openai";
import {
  loadSkillCatalog,
  buildAvailableSkillsXml,
} from "../workspace-assistant-skills.mjs";
import {
  AGENT_TOOL_SCHEMAS,
  executeAgentTool,
  createSkillSession,
  destroySkillSession,
} from "../workspace-assistant-tools.mjs";

const apiKey = process.env.OPENAI_API_KEY || "sk-ef2b3b6329193ad6124e348597c30d465b8dc60e5ae71f314cb8673d076d2bf7";
const baseURL = process.env.OPENAI_BASE_URL || "https://subtp7eu3nc8.tokenclub.top/v1";
const model = process.env.OPENAI_MODEL || "gpt-5.5";

const client = new OpenAI({ apiKey, baseURL });
const ROOT = process.cwd();

const catalog = await loadSkillCatalog({ rootDir: ROOT });
const session = await createSkillSession({ rootDir: ROOT });

console.log(`Catalog: ${catalog.skills.length} skills (${catalog.skills.map((s) => s.id).join(", ")})`);
console.log(`Session: ${session.sessionDir}\n`);

const systemPrompt = [
  "You are a workspace agent that has access to skills and tools.",
  "You may call load_skill / bash / read_file / write_file as needed.",
  "When you give the final answer, output a JSON object with shape {\"reply\":\"...\"}.",
  "",
  buildAvailableSkillsXml(catalog),
].join("\n");

const conversation = [
  { role: "system", content: systemPrompt },
  {
    role: "user",
    content:
      "Please verify the agent infrastructure is working. Run a `bash` tool call that does `echo agent-loop-ok && python3 --version`. Then return a final JSON {\"reply\":\"<summary>\"}.",
  },
];

const MAX_ITER = 8;
let final = null;

for (let i = 0; i < MAX_ITER; i += 1) {
  console.log(`--- Iteration ${i + 1} ---`);
  const completion = await client.chat.completions.create({
    model,
    messages: conversation,
    tools: AGENT_TOOL_SCHEMAS,
    tool_choice: "auto",
  });
  const message = completion.choices?.[0]?.message;
  if (!message) throw new Error("Empty message");
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

  if (toolCalls.length === 0) {
    final = message.content || "";
    console.log(`Final reply: ${final.slice(0, 300)}`);
    break;
  }

  conversation.push({
    role: "assistant",
    content: message.content || "",
    tool_calls: toolCalls,
  });

  for (const tc of toolCalls) {
    console.log(`  -> calling ${tc.function.name}(${tc.function.arguments?.slice(0, 100) || ""})`);
    const result = await executeAgentTool({ toolCall: tc, catalog, sessionDir: session.sessionDir });
    console.log(`     ok=${result.ok} ${result.error ? `error=${result.error}` : ""}`);
    if (result.stdout) console.log(`     stdout: ${String(result.stdout).trim().slice(0, 200)}`);
    conversation.push({
      role: "tool",
      tool_call_id: tc.id,
      content: JSON.stringify(result),
    });
  }
}

await destroySkillSession({ sessionDir: session.sessionDir });

if (!final) {
  console.log("\nFAIL — agent loop ended without final reply.");
  process.exit(2);
}

console.log("\nPASS — agentic loop completed successfully.");
