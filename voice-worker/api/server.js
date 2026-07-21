import http from "node:http";
import { getProviders } from "../providers/index.js";
import { mockTransform } from "../processors/mock.js";

const token = process.env.VOICE_WORKER_TOKEN;
const port = Number(process.env.PORT || 8787);
function authed(req) { return !token || req.headers.authorization === `Bearer ${token}`; }
function send(res, status, body) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); }
async function body(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString() || "{}"); }

http.createServer(async (req, res) => {
  if (!authed(req)) return send(res, 401, { ok: false, error: "unauthorized" });
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, worker: "novelverse-local-voice-worker", version: "0.1.0" });
  if (req.method === "GET" && req.url === "/voices") return send(res, 200, { providers: getProviders() });
  if (req.method === "POST" && ["/transform", "/preview", "/synthesize"].includes(req.url)) return send(res, 200, await mockTransform(await body(req), req.url));
  return send(res, 404, { ok: false, error: "not_found" });
}).listen(port, () => console.log(`NovelVerse local voice worker listening on ${port}`));
