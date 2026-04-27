// Probe: hit the workspace-assistant API with a Chinese "generate an image"
// request and report whether the server returned an addNode op pointing at
// a file under .data/uploads/<board>/.
import http from "node:http";
import { access } from "node:fs/promises";
import path from "node:path";

const PORT = process.env.PORT || 4173;
const BOARD_KEY = "probe-image-gen";

const requestBody = JSON.stringify({
  messages: [
    {
      role: "user",
      content: "帮我生成一张图片：暮色中的极简日式茶室，木质暖光，单点构图。",
    },
  ],
  board: { key: BOARD_KEY, title: "probe", digest: "", nodes: [], edges: [] },
  focus: { contextNodeIds: [], contextNodes: [], selectedNodes: [], connectedNodes: [], visibleNodes: [] },
});

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: PORT,
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, body: raw });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const result = await postJson("/api/workspace-assistant", requestBody);
console.log("HTTP", result.status);

let parsed;
try {
  parsed = JSON.parse(result.body);
} catch {
  console.log("RAW BODY:", result.body.slice(0, 800));
  process.exit(2);
}

console.log("REPLY:", parsed.reply?.slice(0, 200));
console.log("OPERATIONS COUNT:", Array.isArray(parsed.operations) ? parsed.operations.length : "n/a");
console.log("OPERATIONS:", JSON.stringify(parsed.operations, null, 2));

const imageOps = (parsed.operations || []).filter(
  (op) => op?.type === "addNode" && op?.node?.type === "file" && op?.node?.fileKind === "image",
);

if (imageOps.length === 0) {
  console.log("NO image addNode operations produced");
  process.exit(3);
}

const op = imageOps[0];
const url = op.node.file;
console.log("IMAGE URL:", url);
const local = path.resolve(process.cwd(), url.replace(/^\/+/, ""));
try {
  await access(local);
  console.log("ON DISK OK:", local);
  console.log("PASS");
} catch (error) {
  console.log("ON DISK MISSING:", local, error.message);
  process.exit(4);
}
