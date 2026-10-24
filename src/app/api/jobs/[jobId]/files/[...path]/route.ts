import fs from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { getJob, resolveJobFile } from "@/lib/storage/jobs";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
};

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
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers });
  }
  headers.set("Content-Length", String(stat.size));
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { status: 200, headers });
}
