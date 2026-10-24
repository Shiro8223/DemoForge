import fs from "node:fs";
import path from "node:path";
import { getJob, resolveJobFile } from "@/lib/storage/jobs";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
};

const CHUNK = 64 * 1024;

/**
 * Pull-based file stream for bytes [start, end]. Unlike Readable.toWeb(createReadStream()),
 * it stops cleanly when the client disconnects (video seeks, closed tabs); the Node adapter
 * keeps enqueueing into the closed stream and throws an uncaught ERR_INVALID_STATE that kills the server.
 */
function fileStream(file: string, start: number, end: number): ReadableStream<Uint8Array> {
  let fh: fs.promises.FileHandle | null = null;
  let pos = start;
  let done = false;
  const finish = async () => {
    done = true;
    const h = fh;
    fh = null;
    await h?.close().catch(() => {});
  };
  return new ReadableStream<Uint8Array>({
    async start() {
      fh = await fs.promises.open(file, "r");
    },
    async pull(controller) {
      const size = Math.min(CHUNK, end - pos + 1);
      if (done || !fh || size <= 0) {
        await finish();
        if (size <= 0) controller.close();
        return;
      }
      const buf = new Uint8Array(size);
      const { bytesRead } = await fh.read(buf, 0, size, pos);
      if (done) return; // cancelled while reading
      if (bytesRead === 0) {
        await finish();
        controller.close();
        return;
      }
      pos += bytesRead;
      controller.enqueue(buf.subarray(0, bytesRead));
    },
    cancel: finish,
  });
}

/** Serves job outputs (video, screenshots, summary) with HTTP Range support for video seeking. */
export async function GET(req: Request, ctx: { params: Promise<{ jobId: string; path: string[] }> }) {
  const { jobId, path: parts } = await ctx.params;
  if (!(await getJob(jobId))) return new Response("Not found", { status: 404 });
  const rel = parts.join("/");
  const ext = path.extname(rel).toLowerCase();
  // Only expose deliverables; job.json, logs etc. go through the JSON API.
  if (!TYPES[ext] || rel === "job.json") return new Response("Not found", { status: 404 });
  const file = resolveJobFile(jobId, rel);
  if (!file) return new Response("Bad path", { status: 400 });

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(file);
    if (!stat.isFile()) throw new Error();
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": TYPES[ext],
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
  });
  if (new URL(req.url).searchParams.has("download")) headers.set("Content-Disposition", `attachment; filename="${path.basename(file)}"`);

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(fileStream(file, start, end), { status: 206, headers });
  }
  headers.set("Content-Length", String(stat.size));
  return new Response(fileStream(file, 0, stat.size - 1), { status: 200, headers });
}
