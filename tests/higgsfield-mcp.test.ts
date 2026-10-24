/**
 * Integration test for the Higgsfield MCP client against a local *mock* MCP server.
 * The mock only exists in tests: it proves our discovery, async job polling and
 * download path work against a real MCP transport. It is never used by the app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { connect, generateClip, listTools } from "@/lib/higgsfield";
import { probeHasVideo } from "@/lib/video";

test("generateClip: discover → submit → poll → download", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "df-mcp-"));
  const clip = path.join(tmp, "src.mp4");
  await execa("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=720x1280:d=2:r=24", "-pix_fmt", "yuv420p", clip]);
  let polls = 0;
  let seenAuth = "";
  let seenArgs: Record<string, unknown> = {};

  const makeServer = () => {
    const s = new McpServer({ name: "mock-higgsfield", version: "0" });
    s.registerTool(
      "generate_video",
      { description: "Text to video", inputSchema: { prompt: z.string(), aspect_ratio: z.enum(["16:9", "9:16"]), duration: z.number().int().min(3).max(10) } },
      async (args) => {
        seenArgs = args;
        return { content: [{ type: "text", text: JSON.stringify({ job_id: "job-42", status: "queued" }) }] };
      },
    );
    s.registerTool("get_job_status", { description: "Status", inputSchema: { job_id: z.string() } }, async ({ job_id }) => {
      polls++;
      const done = polls >= 2;
      return {
        content: [{ type: "text", text: JSON.stringify({ job_id, status: done ? "completed" : "in_progress", output: done ? { url: `${base}/files/out.mp4` } : null }) }],
      };
    });
    return s;
  };

  const server = http.createServer(async (req, res) => {
    if (req.url === "/files/out.mp4") {
      res.writeHead(200, { "Content-Type": "video/mp4" }).end(await fs.readFile(clip));
      return;
    }
    seenAuth = req.headers.authorization ?? "";
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const mcp = makeServer();
    res.on("close", () => {
      transport.close();
      mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  try {
    const client = await connect({ token: "test-token-123", url: `${base}/mcp`, source: "env" });
    const tools = await listTools(client);
    assert.deepEqual(tools.map((t) => t.name).sort(), ["generate_video", "get_job_status"]);
    const out = path.join(tmp, "scene.mp4");
    const r = await generateClip({ client, tools, prompt: "neon city", duration: 4.5, outFile: out, pollIntervalMs: 50 });
    await client.close();
    assert.equal(r.tool, "generate_video");
    assert.equal(seenAuth, "Bearer test-token-123");
    assert.deepEqual(seenArgs, { prompt: "neon city", aspect_ratio: "9:16", duration: 5 });
    assert.equal(polls, 2);
    assert.ok(await probeHasVideo(out));
  } finally {
    server.closeAllConnections();
    server.close();
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
