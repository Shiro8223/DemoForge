/**
 * DemoForge generation worker.
 *
 * Runs separately from the Next.js web server (so untrusted repository code never
 * executes inside the public-facing process). It polls the file-based job store,
 * claims one pending job at a time and runs the pipeline.
 *
 *   npm run worker
 */
import { config } from "../src/lib/config";
import { listJobs, nextPendingJob, saveJob, writeHeartbeat } from "../src/lib/storage/jobs";
import { runJob } from "../src/lib/pipeline";

const POLL_MS = 2000;
let stopping = false;

async function recoverStaleJobs() {
  for (const job of await listJobs(500)) {
    if (job.status !== "running") continue;
    job.status = "failed";
    job.error = "The worker restarted while this job was running. Start a new generation.";
    for (const s of job.stages) if (s.status === "running") s.status = "failed";
    await saveJob(job);
  }
}

async function main() {
  console.log(`[worker] DemoForge worker up · sandbox=${config.sandbox} · outputs=${config.outputRoot}`);
  console.log(`[worker] Gemini: ${config.gemini.apiKey ? `enabled (${config.gemini.model})` : "disabled (no GEMINI_API_KEY)"}`);
  await recoverStaleJobs();
  while (!stopping) {
    await writeHeartbeat(null).catch(() => {});
    const job = await nextPendingJob().catch(() => null);
    if (!job) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    console.log(`[worker] ▶ ${job.id} ${job.repoUrl} (${job.mode})`);
    const beat = setInterval(() => writeHeartbeat(job.id).catch(() => {}), 10_000);
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      runJob(job),
      new Promise<void>((resolve) => {
        timer = setTimeout(async () => {
          job.status = "failed";
          job.error = `Job exceeded the ${config.limits.jobTimeoutMs / 60000} minute limit.`;
          await saveJob(job);
          resolve();
        }, config.limits.jobTimeoutMs);
      }),
    ]);
    clearTimeout(timer);
    clearInterval(beat);
    console.log(`[worker] ■ ${job.id} ${job.status} in ${Math.round((Date.now() - started) / 1000)}s${job.error ? ` — ${job.error}` : ""}`);
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    stopping = true;
    setTimeout(() => process.exit(0), 500);
  });

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
