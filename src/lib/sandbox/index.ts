import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { execa, type ResultPromise } from "execa";
import { config } from "@/lib/config";
import { devServerArgs } from "@/lib/agent/heuristics";
import type { ProjectAnalysis } from "@/lib/validation/schemas";

/**
 * Runs untrusted repository code. Two modes:
 *  - "docker": install + start inside a resource-limited container (recommended).
 *  - "local":  child processes with a scrubbed environment, a throwaway HOME and hard timeouts.
 * Neither is a production-grade sandbox; see README "Security".
 */

const SAFE_TOKEN = /^[A-Za-z0-9:._@/-]+$/;

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

/** Environment for repo processes: no host secrets, only what a build needs. */
function scrubbedEnv(home: string, port: number): Record<string, string> {
  const pass = ["PATH", "LANG", "TZ", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"];
  const env: Record<string, string> = {};
  for (const k of pass) if (process.env[k]) env[k] = process.env[k]!;
  if (process.env.NODE_EXTRA_CA_CERTS) env.npm_config_cafile = process.env.NODE_EXTRA_CA_CERTS;
  return {
    ...env,
    HOME: home,
    TMPDIR: path.join(home, "tmp"),
    npm_config_cache: path.join(home, ".npm"),
    PORT: String(port),
    HOST: "127.0.0.1",
    HOSTNAME: "127.0.0.1",
    BROWSER: "none",
    CI: "1",
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    ASTRO_TELEMETRY_DISABLED: "1",
    GATSBY_TELEMETRY_DISABLED: "1",
  };
}

async function hasBinary(bin: string) {
  try {
    await execa("which", [bin]);
    return true;
  } catch {
    return false;
  }
}

async function installDir(repoDir: string, analysis: ProjectAnalysis) {
  // Monorepo workspaces install from the root.
  const rootPkg = await fs.readFile(path.join(repoDir, "package.json"), "utf8").catch(() => "");
  const isWorkspace =
    /"workspaces"\s*:/.test(rootPkg) || (await fs.access(path.join(repoDir, "pnpm-workspace.yaml")).then(() => true, () => false));
  return isWorkspace ? repoDir : path.join(repoDir, analysis.appDir);
}

function installArgv(pm: ProjectAnalysis["packageManager"], ci: boolean): string[] {
  switch (pm) {
    case "pnpm":
      return ["pnpm", "install", "--prefer-offline", "--config.confirmModulesPurge=false"];
    case "yarn":
      return ["yarn", "install", "--non-interactive"];
    case "bun":
      return ["bun", "install"];
    default:
      return ci ? ["npm", "ci", "--no-audit", "--no-fund"] : ["npm", "install", "--no-audit", "--no-fund"];
  }
}

const tail = (s: string, n = 1500) => (s.length > n ? "…" + s.slice(-n) : s);

export interface InstallResult {
  ok: boolean;
  detail: string;
  log: string;
}

export async function installDependencies(repoDir: string, home: string, analysis: ProjectAnalysis, logFile: string): Promise<InstallResult> {
  if (analysis.runKind !== "script") return { ok: true, detail: "Nothing to install", log: "" };
  if (config.sandbox === "docker") return { ok: true, detail: "Runs inside the container at start-up", log: "" };

  let pm = analysis.packageManager;
  if (pm !== "npm" && !(await hasBinary(pm))) pm = "npm";
  const cwd = await installDir(repoDir, analysis);
  await fs.mkdir(path.join(home, "tmp"), { recursive: true });

  const attempts = [installArgv(pm, analysis.installCommand === "npm ci")];
  if (attempts[0].join(" ").startsWith("npm ci")) attempts.push(installArgv("npm", false)); // one bounded retry
  let log = "";
  for (const [bin, ...args] of attempts) {
    const started = Date.now();
    const r = await execa(bin, args, {
      cwd,
      env: scrubbedEnv(home, 0),
      extendEnv: false,
      timeout: config.limits.installTimeoutMs,
      all: true,
      reject: false,
      stdin: "ignore",
    });
    log += `$ ${bin} ${args.join(" ")}\n${r.all ?? ""}\n`;
    await fs.writeFile(logFile, log);
    if (r.exitCode === 0)
      return { ok: true, detail: `${bin} ${args[0]} (${Math.round((Date.now() - started) / 1000)}s)`, log };
    if (r.timedOut) return { ok: false, detail: `Install timed out after ${config.limits.installTimeoutMs / 60000} min`, log };
  }
  return { ok: false, detail: `Dependency install failed: ${tail(log, 400)}`, log };
}

export interface RunningApp {
  url: string;
  stop: () => Promise<void>;
}

async function waitForHttp(urls: () => string[], timeoutMs: number, isDead: () => string | null): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const dead = isDead();
    if (dead) throw new Error(dead);
    for (const u of urls()) {
      try {
        const res = await fetch(u, { signal: AbortSignal.timeout(5000), redirect: "manual" });
        if (res.status < 500) return u;
      } catch {
        /* not up yet */
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`App did not respond within ${timeoutMs / 1000}s`);
}

/** Serves a static directory on 127.0.0.1 with traversal protection. */
async function serveStatic(dir: string, port: number): Promise<RunningApp> {
  const root = path.resolve(dir);
  const types: Record<string, string> = {
    ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2",
  };
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
      let file = path.resolve(root, "." + urlPath);
      if (file !== root && !file.startsWith(root + path.sep)) return void res.writeHead(403).end();
      const st = await fs.stat(file).catch(() => null);
      if (st?.isDirectory()) file = path.join(file, "index.html");
      else if (!st && !path.extname(file)) file += ".html";
      const real = await fs.realpath(file).catch(() => null);
      if (!real || (real !== root && !real.startsWith(root + path.sep))) return void res.writeHead(404).end("Not found");
      res.writeHead(200, { "Content-Type": types[path.extname(real).toLowerCase()] ?? "application/octet-stream" });
      createReadStream(real).pipe(res);
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${port}/`, stop: () => new Promise((r) => server.close(() => r())) };
}

function startArgv(pm: ProjectAnalysis["packageManager"], script: string, extra: string[]): string[] {
  const runner = pm === "none" ? "npm" : pm;
  if (runner === "npm") return ["npm", "run", script, ...(extra.length ? ["--", ...extra] : [])];
  return [runner, "run", script, ...extra];
}

/** Only pin host/port via CLI flags when the script directly invokes a known dev server. */
function frameworkArgs(scriptBody: string | undefined, framework: string, port: number): string[] {
  if (!scriptBody || !/^(next|vite|astro|nuxt|nuxi|gatsby|ng)\b/.test(scriptBody.trim())) return [];
  if (/--port|-p\s/.test(scriptBody)) return [];
  return devServerArgs(framework).map((a) => a.replace("{PORT}", String(port)));
}

export async function startApp(opts: {
  repoDir: string;
  home: string;
  analysis: ProjectAnalysis;
  scripts: Record<string, string>;
  jobId: string;
  logFile: string;
}): Promise<RunningApp> {
  const { repoDir, home, analysis, scripts, jobId, logFile } = opts;
  const port = await freePort();
  const appDir = path.join(repoDir, analysis.appDir);

  if (analysis.runKind === "static") return serveStatic(appDir, port);
  if (analysis.runKind !== "script" || !analysis.startScript) throw new Error("No start script found for this repository.");
  if (!SAFE_TOKEN.test(analysis.startScript)) throw new Error("Refusing to run a script with an unusual name.");

  let pm = analysis.packageManager;
  if (pm !== "npm" && pm !== "none" && config.sandbox === "local" && !(await hasBinary(pm))) pm = "npm";
  const extra = frameworkArgs(scripts[analysis.startScript], analysis.framework, port);
  const argv = startArgv(pm, analysis.startScript, extra);

  let output = "";
  const candidates = new Set<string>([`http://127.0.0.1:${port}/`]);
  let exitReason: string | null = null;
  let child: ResultPromise;
  let stop: () => Promise<void>;

  if (config.sandbox === "docker") {
    const name = `demoforge-${jobId}`;
    const installRel = path.relative(repoDir, await installDir(repoDir, analysis)) || ".";
    const install = installArgv(pm, analysis.installCommand === "npm ci").join(" ");
    const script = `corepack enable >/dev/null 2>&1 || true; cd /app/${installRel} && ${install} && cd /app/${analysis.appDir} && ${argv.join(" ")}`;
    if (![...argv, ...install.split(" ")].every((t) => SAFE_TOKEN.test(t))) throw new Error("Unsafe token in command");
    child = execa(
      "docker",
      [
        "run", "--rm", "--name", name,
        "--memory", "3g", "--cpus", "2", "--pids-limit", "1024", "--security-opt", "no-new-privileges",
        "-p", `127.0.0.1:${port}:${port}`,
        "-e", `PORT=${port}`, "-e", "HOST=0.0.0.0", "-e", "HOSTNAME=0.0.0.0", "-e", "BROWSER=none", "-e", "CI=1", "-e", "NEXT_TELEMETRY_DISABLED=1",
        "-v", `${repoDir}:/app`, "-w", "/app",
        config.dockerImage, "sh", "-c", script.replace(/127\.0\.0\.1/g, "0.0.0.0"),
      ],
      { all: true, reject: false, stdin: "ignore" },
    );
    stop = async () => {
      await execa("docker", ["rm", "-f", name], { reject: false });
    };
  } else {
    await fs.mkdir(path.join(home, "tmp"), { recursive: true });
    child = execa(argv[0], argv.slice(1), {
      cwd: appDir,
      env: scrubbedEnv(home, port),
      extendEnv: false,
      detached: true, // own process group so we can kill the whole tree
      all: true,
      reject: false,
      stdin: "ignore",
    });
    stop = async () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          /* already gone */
        }
        await new Promise((r) => setTimeout(r, 1500));
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    };
  }

  child.all?.on("data", (d: Buffer) => {
    output += d.toString();
    if (output.length > 200_000) output = output.slice(-100_000);
    fs.writeFile(logFile, output).catch(() => {});
    // Many dev servers print the URL they bound; honour it when it's local.
    for (const m of d.toString().matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/g)) {
      candidates.add(`http://127.0.0.1:${m[1]}/`);
    }
  });
  child.then((r) => {
    exitReason = `Start command exited (code ${r.exitCode}). Last output:\n${tail(output.replace(/\x1b\[[0-9;]*m/g, ""), 800)}`;
  });

  try {
    const timeout = config.sandbox === "docker" ? config.limits.startTimeoutMs + config.limits.installTimeoutMs : config.limits.startTimeoutMs;
    const url = await waitForHttp(() => [...candidates], timeout, () => exitReason);
    return { url, stop };
  } catch (e) {
    await stop();
    throw e;
  }
}
