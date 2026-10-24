import fs from "node:fs/promises";
import path from "node:path";
import type { ProjectAnalysis } from "@/lib/validation/schemas";

/**
 * Deterministic repository inspection. This is the source of truth for anything
 * that ends up being executed (package manager, script names, app dir); Claude
 * only enriches descriptive fields on top of it.
 */

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", ".turbo", ".vercel", "coverage", ".cache", "vendor", ".svelte-kit",
]);

export interface PackageJson {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: unknown;
  packageManager?: string;
}

export async function readText(file: string, max = 200_000): Promise<string | null> {
  try {
    const st = await fs.stat(file);
    if (!st.isFile() || st.size > max) return null;
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function readPkg(dir: string): Promise<PackageJson | null> {
  const t = await readText(path.join(dir, "package.json"));
  if (!t) return null;
  try {
    return JSON.parse(t) as PackageJson;
  } catch {
    return null;
  }
}

const exists = (p: string) => fs.access(p).then(() => true, () => false);

/** Walks the repo (bounded) and returns relative POSIX paths of files. */
export async function listFiles(root: string, limit = 4000): Promise<string[]> {
  const out: string[] = [];
  const walk = async (rel: string, depth: number) => {
    if (out.length >= limit || depth > 8) return;
    let entries;
    try {
      entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (out.length >= limit) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name)) await walk(r, depth + 1);
      } else if (e.isFile()) out.push(r);
    }
  };
  await walk("", 0);
  return out;
}

const FRAMEWORKS: { dep: string; name: string; port: number; dev: string[] }[] = [
  { dep: "next", name: "Next.js", port: 3000, dev: ["-p", "{PORT}", "-H", "127.0.0.1"] },
  { dep: "nuxt", name: "Nuxt", port: 3000, dev: ["--port", "{PORT}", "--host", "127.0.0.1"] },
  { dep: "@sveltejs/kit", name: "SvelteKit", port: 5173, dev: ["--port", "{PORT}", "--host", "127.0.0.1", "--strictPort"] },
  { dep: "astro", name: "Astro", port: 4321, dev: ["--port", "{PORT}", "--host", "127.0.0.1"] },
  { dep: "@remix-run/dev", name: "Remix", port: 3000, dev: [] },
  { dep: "gatsby", name: "Gatsby", port: 8000, dev: ["-p", "{PORT}", "-H", "127.0.0.1"] },
  { dep: "@angular/core", name: "Angular", port: 4200, dev: ["--port", "{PORT}", "--host", "127.0.0.1"] },
  { dep: "react-scripts", name: "Create React App", port: 3000, dev: [] },
  { dep: "vite", name: "Vite", port: 5173, dev: ["--port", "{PORT}", "--host", "127.0.0.1", "--strictPort"] },
  { dep: "express", name: "Express", port: 3000, dev: [] },
  { dep: "fastify", name: "Fastify", port: 3000, dev: [] },
];

export function detectFramework(pkg: PackageJson) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const f = FRAMEWORKS.find((f) => f.dep in deps);
  if (!f) return null;
  // Refine Vite by UI library for nicer copy.
  if (f.dep === "vite") {
    const ui = "react" in deps ? "React" : "vue" in deps ? "Vue" : "svelte" in deps ? "Svelte" : "solid-js" in deps ? "Solid" : null;
    return { ...f, name: ui ? `Vite + ${ui}` : "Vite" };
  }
  return f;
}

/** Extra CLI args that pin host/port for a framework's dev server, with {PORT} placeholder. */
export function devServerArgs(framework: string): string[] {
  return FRAMEWORKS.find((f) => framework === f.name || framework.startsWith(f.name))?.dev ?? [];
}

async function detectPackageManager(dirs: string[], pkg: PackageJson): Promise<ProjectAnalysis["packageManager"]> {
  const pm = pkg.packageManager?.split("@")[0];
  if (pm === "pnpm" || pm === "yarn" || pm === "bun" || pm === "npm") return pm;
  for (const d of dirs) {
    if (await exists(path.join(d, "pnpm-lock.yaml"))) return "pnpm";
    if (await exists(path.join(d, "yarn.lock"))) return "yarn";
    if (await exists(path.join(d, "bun.lockb")) || (await exists(path.join(d, "bun.lock")))) return "bun";
  }
  return "npm";
}

function installCommandFor(pm: ProjectAnalysis["packageManager"], hasLock: boolean): string {
  switch (pm) {
    case "pnpm":
      return "pnpm install";
    case "yarn":
      return "yarn install";
    case "bun":
      return "bun install";
    case "npm":
      return hasLock ? "npm ci" : "npm install";
    default:
      return "";
  }
}

/** Candidate app directories in priority order (monorepos commonly use apps/web etc). */
async function findAppDir(root: string, files: string[]) {
  const candidates = files
    .filter((f) => f.endsWith("package.json") && f.split("/").length <= 3)
    .map((f) => path.posix.dirname(f))
    .sort((a, b) => {
      const score = (d: string) =>
        (d === "." ? 0 : 1) * 10 + (/(^|\/)(web|app|frontend|client|site|www)$/.test(d) ? -5 : 0) + d.split("/").length;
      return score(a) - score(b);
    });
  for (const rel of candidates) {
    const dir = path.join(root, rel);
    const pkg = await readPkg(dir);
    if (!pkg) continue;
    const fw = detectFramework(pkg);
    const scripts = pkg.scripts ?? {};
    if (fw && (scripts.dev || scripts.start)) return { rel, dir, pkg, fw };
  }
  for (const rel of candidates) {
    const dir = path.join(root, rel);
    const pkg = await readPkg(dir);
    if (pkg?.scripts?.dev || pkg?.scripts?.start) return { rel, dir, pkg, fw: detectFramework(pkg) };
  }
  return null;
}

function routeFromSegments(segs: string[]): string | null {
  const kept: string[] = [];
  for (const s of segs) {
    if (/^\(.*\)$/.test(s) || s.startsWith("@")) continue; // route groups / parallel routes
    if (s.startsWith("[") || s.startsWith("_") || s.startsWith(":")) return null; // dynamic or private
    kept.push(s);
  }
  return "/" + kept.join("/");
}

/** Routes inferred from file-system routers and common router declarations. */
export async function discoverRoutes(appDir: string, appFiles: string[]): Promise<string[]> {
  const routes = new Set<string>(["/"]);
  for (const f of appFiles) {
    let m: RegExpMatchArray | null;
    if ((m = f.match(/^(?:src\/)?app\/(.*?)\/?page\.(?:tsx|jsx|ts|js|mdx)$/))) {
      const segs = m[1] ? m[1].split("/") : [];
      if (segs[0] === "api") continue;
      const r = routeFromSegments(segs);
      if (r) routes.add(r);
    } else if ((m = f.match(/^(?:src\/)?pages\/(.+)\.(?:tsx|jsx|ts|js|vue|astro|md|mdx)$/))) {
      const segs = m[1].split("/");
      if (segs[0] === "api" || segs.some((s) => s.startsWith("_"))) continue;
      if (segs[segs.length - 1] === "index") segs.pop();
      const r = routeFromSegments(segs);
      if (r) routes.add(r);
    } else if ((m = f.match(/^src\/routes\/(.*?)\/?\+page\.svelte$/))) {
      const r = routeFromSegments(m[1] ? m[1].split("/") : []);
      if (r) routes.add(r);
    }
  }
  // react-router / vue-router style declarations.
  const sourceFiles = appFiles.filter((f) => /\.(tsx|jsx|ts|js|vue)$/.test(f) && !f.includes(".test.")).slice(0, 400);
  for (const f of sourceFiles) {
    const t = await readText(path.join(appDir, f), 150_000);
    if (!t || !/path\s*[:=]/.test(t)) continue;
    for (const m of t.matchAll(/path\s*[:=]\s*\{?\s*["'`](\/[A-Za-z0-9\-_/]*)["'`]/g)) {
      if (!m[1].includes(":") && m[1].length < 60) routes.add(m[1].replace(/\/$/, "") || "/");
    }
  }
  return [...routes].slice(0, 25);
}

const IGNORED_ENV = new Set(["NODE_ENV", "PORT", "HOST", "CI", "VERCEL", "VERCEL_URL", "BASE_URL", "PUBLIC_URL", "DEV", "PROD", "MODE", "SSR"]);

export async function discoverEnv(appDir: string, appFiles: string[]): Promise<string[]> {
  const keys = new Set<string>();
  for (const f of appFiles.filter((f) => /(^|\/)\.env\.(example|sample|template|local\.example)$/.test(f))) {
    const t = await readText(path.join(appDir, f));
    t?.split("\n").forEach((line) => {
      const m = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=/);
      if (m) keys.add(m[1]);
    });
  }
  const src = appFiles.filter((f) => /\.(tsx|jsx|ts|js|mjs|vue|svelte|astro)$/.test(f)).slice(0, 600);
  for (const f of src) {
    const t = await readText(path.join(appDir, f), 150_000);
    if (!t) continue;
    for (const m of t.matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]+)/g)) keys.add(m[1]);
  }
  return [...keys].filter((k) => !IGNORED_ENV.has(k)).sort();
}

/** Pulls a description and "Features" bullets out of the README. */
export function parseReadme(readme: string | null) {
  if (!readme) return { description: "", features: [] as string[] };
  const lines = readme.replace(/\r/g, "").split("\n");
  const description =
    lines
      .map((l) => l.trim())
      .find((l) => l.length > 40 && !/^[#!<[|>`-]/.test(l) && !l.startsWith("*"))
      ?.replace(/[*_`]/g, "")
      .slice(0, 280) ?? "";
  const features: string[] = [];
  let inFeatures = false;
  for (const l of lines) {
    if (/^#{1,4}\s/.test(l)) {
      inFeatures = /feature|what it does|highlights|capabilities/i.test(l);
      continue;
    }
    const m = inFeatures && l.match(/^\s*[-*+]\s+(.*)$/);
    if (m) {
      const clean = m[1].replace(/\*\*|__|`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/^[^\w]+/u, "").trim();
      if (clean.length > 3) features.push(clean.slice(0, 140));
    }
    if (features.length >= 8) break;
  }
  return { description, features };
}

export interface HeuristicResult {
  analysis: ProjectAnalysis;
  files: string[];
  appFiles: string[];
  scripts: Record<string, string>;
  readme: string | null;
}

export async function analyseHeuristically(repoDir: string, fallbackName: string): Promise<HeuristicResult> {
  const files = await listFiles(repoDir);
  const readmeName = files.find((f) => /^readme(\.md|\.markdown|\.txt)?$/i.test(f));
  const readme = readmeName ? await readText(path.join(repoDir, readmeName), 500_000) : null;
  const { description, features } = parseReadme(readme);
  const readmeTitle = readme?.match(/^#\s+(.{2,40}?)\s*$/m)?.[1].replace(/[*_`[\]]/g, "").trim();

  const found = await findAppDir(repoDir, files);
  const languages = new Set<string>();
  for (const f of files) {
    if (/\.tsx?$/.test(f)) languages.add("TypeScript");
    else if (/\.(jsx?|mjs|cjs)$/.test(f)) languages.add("JavaScript");
    else if (f.endsWith(".py")) languages.add("Python");
    else if (f.endsWith(".vue")) languages.add("Vue");
    else if (f.endsWith(".svelte")) languages.add("Svelte");
    else if (/\.(css|scss)$/.test(f)) languages.add("CSS");
    else if (f.endsWith(".html")) languages.add("HTML");
  }

  if (!found) {
    // Plain static site?
    const staticIndex = ["index.html", "public/index.html", "docs/index.html", "site/index.html"].find((f) => files.includes(f));
    const staticDir = staticIndex ? path.posix.dirname(staticIndex) : ".";
    const htmlRoutes = files
      .filter((f) => f.endsWith(".html") && (staticDir === "." ? !f.includes("/") : f.startsWith(staticDir + "/")))
      .map((f) => "/" + path.posix.relative(staticDir, f).replace(/index\.html$/, ""))
      .slice(0, 10);
    return {
      files,
      appFiles: files,
      scripts: {},
      readme,
      analysis: {
        name: readmeTitle || fallbackName,
        description,
        framework: staticIndex ? "Static HTML" : "Unknown",
        languages: [...languages],
        packageManager: "none",
        installCommand: "",
        startScript: null,
        runKind: staticIndex ? "static" : "unsupported",
        appDir: staticDir,
        likelyPort: null,
        requiredEnv: [],
        routes: htmlRoutes.length ? htmlRoutes : ["/"],
        features,
        setupRisks: staticIndex
          ? []
          : ["No runnable web app found (no package.json with a dev/start script and no index.html)."],
        analysedBy: "heuristic",
      },
    };
  }

  const { rel, dir, pkg, fw } = found;
  const scripts = pkg.scripts ?? {};
  const prefix = rel === "." ? "" : rel + "/";
  const appFiles = files.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length));
  const pm = await detectPackageManager([dir, repoDir], pkg);
  const hasLock = (await exists(path.join(dir, "package-lock.json"))) || (await exists(path.join(repoDir, "package-lock.json")));
  const startScript = scripts.dev ? "dev" : scripts.start ? "start" : scripts.serve ? "serve" : null;
  const requiredEnv = await discoverEnv(dir, appFiles);
  const risks: string[] = [];
  if (requiredEnv.length) risks.push(`App references ${requiredEnv.length} environment variable(s) that DemoForge cannot provide.`);
  if (rel !== ".") risks.push(`App lives in a sub-directory (${rel}); monorepo setups may need workspace installs.`);
  if (!fw) risks.push("Framework not recognised; port detection relies on server output.");

  return {
    files,
    appFiles,
    scripts,
    readme,
    analysis: {
      name: readmeTitle || (pkg.name && !pkg.name.startsWith("@") ? pkg.name : fallbackName),
      description: pkg.description || description,
      framework: fw?.name ?? "Node.js",
      languages: [...languages],
      packageManager: pm,
      installCommand: installCommandFor(pm, hasLock),
      startScript,
      runKind: startScript ? "script" : "unsupported",
      appDir: rel,
      likelyPort: fw?.port ?? 3000,
      requiredEnv,
      routes: await discoverRoutes(dir, appFiles),
      features,
      setupRisks: risks,
      analysedBy: "heuristic",
    },
  };
}
