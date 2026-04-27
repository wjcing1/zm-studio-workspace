// Tool-calling probe: verifies whether the configured OpenAI-compatible proxy
// supports the native `tools` parameter (function calling).
//
// Run with: node tests/probe-tool-calling.mjs
//
// Outputs PASS / FAIL plus the raw response so we can see what we're dealing with.

import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY || "sk-ef2b3b6329193ad6124e348597c30d465b8dc60e5ae71f314cb8673d076d2bf7";
const baseURL = process.env.OPENAI_BASE_URL || "https://subtp7eu3nc8.tokenclub.top/v1";
const model = process.env.OPENAI_MODEL || "gpt-5.5";

const client = new OpenAI({ apiKey, baseURL });

console.log(`Probing ${baseURL} with model=${model} for tools-parameter support...\n`);

const start = Date.now();

let completion;
try {
  completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant. When the user asks for information, prefer to call the appropriate tool rather than answering from memory.",
      },
      {
        role: "user",
        content: "What's the current weather in Beijing? Use the get_weather tool.",
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get the current weather in a given city.",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string", description: "The city name." },
            },
            required: ["city"],
          },
        },
      },
    ],
    tool_choice: "auto",
  });
} catch (error) {
  console.log("=== REQUEST FAILED ===");
  console.log("Error:", error?.message || error);
  if (error?.response?.data) {
    console.log("Response data:", JSON.stringify(error.response.data, null, 2));
  }
  console.log("\nVERDICT: FAIL — proxy rejected the tools parameter or request errored out.");
  process.exit(1);
}

const elapsed = Date.now() - start;
console.log(`Request completed in ${elapsed}ms\n`);

console.log("=== RAW RESPONSE ===");
console.log(JSON.stringify(completion, null, 2));

const choice = completion.choices?.[0];
const message = choice?.message;
const toolCalls = message?.tool_calls;
const finishReason = choice?.finish_reason;

console.log("\n=== VERDICT ===");
console.log("finish_reason:", finishReason);
console.log("text content (truncated):", (message?.content || "").slice(0, 200));
console.log("tool_calls present:", Array.isArray(toolCalls) && toolCalls.length > 0);

if (Array.isArray(toolCalls) && toolCalls.length > 0) {
  console.log("\nFirst tool_call:");
  console.log(JSON.stringify(toolCalls[0], null, 2));
  console.log("\nPASS — proxy supports OpenAI native tool calling.");
  process.exit(0);
} else {
  console.log("\nFAIL — model did not emit a tool_call. Either the proxy stripped the `tools` param, or the model chose to answer in text.");
  console.log("Will need to fall back to JSON-protocol-based tool calling.");
  process.exit(2);
}
