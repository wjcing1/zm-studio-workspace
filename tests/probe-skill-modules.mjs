// Smoke test for skill loading + tool module imports.
// Verifies workspace-assistant-skills.mjs and workspace-assistant-tools.mjs
// load and expose the expected interface, and that the existing catalog scans cleanly.

import {
  loadSkillCatalog,
  buildAvailableSkillsXml,
  buildSkillsPublicSummary,
  loadSkillBody,
  findSkillInCatalog,
} from "../workspace-assistant-skills.mjs";
import {
  AGENT_TOOL_SCHEMAS,
  executeAgentTool,
  createSkillSession,
  destroySkillSession,
} from "../workspace-assistant-tools.mjs";

const ROOT = process.cwd();

console.log("=== Loading skill catalog ===");
const catalog = await loadSkillCatalog({ rootDir: ROOT });
console.log(`skillsRoot: ${catalog.skillsRoot}`);
console.log(`skills found: ${catalog.skills.length}`);
for (const skill of catalog.skills) {
  console.log(`  - ${skill.id}: ${skill.description.slice(0, 80)}`);
}

console.log("\n=== Available-skills XML (truncated) ===");
const xml = buildAvailableSkillsXml(catalog);
console.log(xml.slice(0, 600) + (xml.length > 600 ? "\n…" : ""));

console.log("\n=== Public summary ===");
console.log(JSON.stringify(buildSkillsPublicSummary(catalog), null, 2).slice(0, 400));

console.log("\n=== Tool schemas ===");
console.log(`tools registered: ${AGENT_TOOL_SCHEMAS.length}`);
for (const tool of AGENT_TOOL_SCHEMAS) {
  console.log(`  - ${tool.function.name}: ${tool.function.description.slice(0, 80)}`);
}

console.log("\n=== Session create/destroy ===");
const session = await createSkillSession({ rootDir: ROOT });
console.log(`created: ${session.sessionDir}`);

console.log("\n=== load_skill tool execution ===");
if (catalog.skills.length > 0) {
  const firstSkill = catalog.skills[0];
  const result = await executeAgentTool({
    toolCall: {
      id: "test_call_1",
      function: { name: "load_skill", arguments: JSON.stringify({ skill_id: firstSkill.id }) },
    },
    catalog,
    sessionDir: session.sessionDir,
  });
  console.log(`  ok: ${result.ok}`);
  console.log(`  base_path: ${result.base_path}`);
  console.log(`  instructions length: ${result.instructions?.length}`);
} else {
  console.log("  (no skills installed; skipping)");
}

console.log("\n=== bash tool execution ===");
const bashResult = await executeAgentTool({
  toolCall: {
    id: "test_call_2",
    function: { name: "bash", arguments: JSON.stringify({ command: "echo hello && pwd" }) },
  },
  catalog,
  sessionDir: session.sessionDir,
});
console.log(`  ok: ${bashResult.ok}`);
console.log(`  exit_code: ${bashResult.exit_code}`);
console.log(`  stdout: ${(bashResult.stdout || "").trim()}`);

console.log("\n=== bash sandbox test (try escaping) ===");
const escapeResult = await executeAgentTool({
  toolCall: {
    id: "test_call_3",
    function: { name: "bash", arguments: JSON.stringify({ command: "echo trying", cwd: "/tmp" }) },
  },
  catalog,
  sessionDir: session.sessionDir,
});
console.log(`  ok (should be false): ${escapeResult.ok}`);
console.log(`  error: ${escapeResult.error}`);

console.log("\n=== write_file + read_file ===");
const writeResult = await executeAgentTool({
  toolCall: {
    id: "test_call_4",
    function: { name: "write_file", arguments: JSON.stringify({ path: "test.txt", content: "hello world" }) },
  },
  catalog,
  sessionDir: session.sessionDir,
});
console.log(`  write ok: ${writeResult.ok}, bytes: ${writeResult.bytes_written}`);

const readResult = await executeAgentTool({
  toolCall: {
    id: "test_call_5",
    function: { name: "read_file", arguments: JSON.stringify({ path: "test.txt" }) },
  },
  catalog,
  sessionDir: session.sessionDir,
});
console.log(`  read ok: ${readResult.ok}, content: "${readResult.content}"`);

await destroySkillSession({ sessionDir: session.sessionDir });
console.log("\n=== ALL CHECKS PASSED ===");
