import process from "node:process";
import {
  loadWorkspaceSkillCatalog,
  resolveWorkspaceAssistantSkillContext,
} from "../workspace-assistant-skills.mjs";

async function main() {
  const catalog = await loadWorkspaceSkillCatalog({
    rootDir: process.cwd(),
  });

  if (!Array.isArray(catalog.skills) || catalog.skills.length === 0) {
    throw new Error("Workspace skill catalog should load at least one repo-owned skill.");
  }

  const architecturalSkill = catalog.skills.find((skill) => skill.id === "architectural_prompt_architect");
  if (!architecturalSkill) {
    throw new Error("Workspace skill catalog should include architectural_prompt_architect.");
  }

  if (!architecturalSkill.defaultEnabled) {
    throw new Error("architectural_prompt_architect should be default-enabled for all workspaces.");
  }

  if (typeof architecturalSkill.description !== "string" || !architecturalSkill.description.trim()) {
    throw new Error("Workspace skills should expose the compatible SKILL.md description.");
  }

  const explicitContext = await resolveWorkspaceAssistantSkillContext({
    rootDir: process.cwd(),
    workspaceContext: {
      board: {
        title: "Material Mood Board",
        description: "",
        nodes: [{ id: "node-1", type: "text", content: "Facade references" }],
        edges: [],
      },
      focus: {
        contextNodeIds: [],
        contextNodes: [],
        selectedNodes: [],
        connectedNodes: [],
        visibleNodes: [],
      },
    },
    messages: [
      {
        role: "user",
        content: "@architectural_prompt_architect 帮我写一个建筑渲染提示词，黄昏，木材。",
      },
    ],
  });

  if (!explicitContext.activeSkills.some((skill) => skill.id === "architectural_prompt_architect")) {
    throw new Error("Explicit @architectural_prompt_architect mention should activate the skill.");
  }

  if (!explicitContext.detailedPrompt.includes("Mandatory Check")) {
    throw new Error("Explicit skill activation should inject the configured detailed sections.");
  }

  const triggerContext = await resolveWorkspaceAssistantSkillContext({
    rootDir: process.cwd(),
    workspaceContext: {
      board: {
        title: "Prompt Study",
        description: "",
        nodes: [{ id: "node-2", type: "text", content: "建筑渲染 prompt references" }],
        edges: [],
      },
      focus: {
        contextNodeIds: [],
        contextNodes: [],
        selectedNodes: [],
        connectedNodes: [],
        visibleNodes: [],
      },
    },
    messages: [
      {
        role: "user",
        content: "帮我整理一个建筑渲染提示词，重点是材质和黄昏氛围。",
      },
    ],
  });

  if (!triggerContext.activeSkills.some((skill) => skill.id === "architectural_prompt_architect")) {
    throw new Error("Architectural prompt trigger phrases should activate the skill without explicit mention.");
  }

  if (!triggerContext.catalogPrompt.includes("architectural_prompt_architect")) {
    throw new Error("Workspace assistant base prompt should advertise the available skills catalog.");
  }

  console.log("PASS: workspace skill catalog loads and activates compatible repo-owned skills.");
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
