/**
 * Runs a single generation synchronously (no web server/worker needed).
 *   npm run once -- https://github.com/owner/repo
 *   npm run once -- --local tests/fixtures/launchpad     (pipeline test without cloning)
 */
import path from "node:path";
import { parseGitHubUrl } from "../src/lib/github";
import { createJob, getJob } from "../src/lib/storage/jobs";
import { runJob } from "../src/lib/pipeline";

const args = process.argv.slice(2);
const localIdx = args.indexOf("--local");
const localRepoDir = localIdx >= 0 ? path.resolve(args[localIdx + 1]) : undefined;
const url = localRepoDir ? `https://github.com/local/${path.basename(localRepoDir)}` : args[0];
if (!url) {
  console.error("Usage: npm run once -- <github-url> | --local <dir>");
  process.exit(1);
}
const parsed = parseGitHubUrl(url);
const job = await createJob({ repoUrl: parsed.webUrl, owner: parsed.owner, repo: parsed.repo });
console.log(`job ${job.id}`);
const timer = setInterval(async () => {
  const j = await getJob(job.id);
  const s = j?.stages.find((x) => x.status === "running");
  if (s) console.log(`  … ${s.label}${s.detail ? `: ${s.detail}` : ""}`);
}, 5000);
await runJob(job, { localRepoDir });
clearInterval(timer);
for (const s of job.stages) console.log(`${s.status.padEnd(9)} ${s.label}${s.detail ? ` — ${s.detail}` : ""}`);
if (job.notices.length) console.log("\nNotices:\n- " + job.notices.join("\n- "));
console.log(`\n${job.status.toUpperCase()}${job.error ? `: ${job.error}` : ""}`);
console.log(`outputs/jobs/${job.id}/`);
process.exit(job.status === "completed" ? 0 : 1);
