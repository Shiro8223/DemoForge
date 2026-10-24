import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import type { Screenshot } from "@/types";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 430, height: 932 };

/** Waits for network quiet plus fonts/images, without failing on long-polling apps. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  // Let entrance animations finish.
  await page.waitForTimeout(1200);
}

function slug(route: string) {
  return route === "/" ? "home" : route.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40) || "page";
}

/** Same-origin links on the homepage, used to supplement statically discovered routes. */
async function discoverLinks(page: Page, origin: string): Promise<string[]> {
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href)).catch(() => [] as string[]);
  const out = new Set<string>();
  for (const h of hrefs) {
    try {
      const u = new URL(h);
      if (u.origin !== origin) continue;
      const p = u.pathname.replace(/\/$/, "") || "/";
      if (p !== "/" && !/\.(png|jpe?g|svg|pdf|zip|xml|json|txt)$/i.test(p) && !/^\/(api|_next|static)\//.test(p)) out.add(p);
    } catch {
      /* ignore */
    }
  }
  return [...out].slice(0, 10);
}

/** A page is "useful" if it rendered content and isn't an error page. */
async function looksUseful(page: Page, status: number | undefined) {
  if (status && status >= 400) return false;
  const text = (await page.evaluate(() => document.body?.innerText ?? "").catch(() => "")).trim();
  if (text.length < 3) {
    const media = await page.locator("canvas, img, svg, video").count().catch(() => 0);
    if (!media) return false;
  }
  return !/^(404|this page could not be found|not found)/i.test(text);
}

export async function discoverFeatureRoutes(baseUrl: string, staticRoutes: string[]): Promise<string[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: DESKTOP });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await settle(page);
    const linked = await discoverLinks(page, new URL(baseUrl).origin);
    // Routes the app links to first: they're the ones a visitor actually reaches.
    return [...new Set(["/", ...linked.filter((l) => staticRoutes.includes(l)), ...staticRoutes, ...linked])];
  } finally {
    await browser.close();
  }
}

export async function captureScreenshots(opts: {
  baseUrl: string;
  routes: string[];
  outDir: string;
  /** Relative prefix stored in job outputs. */
  relPrefix: string;
  max?: number;
}): Promise<{ shots: Screenshot[]; failures: string[] }> {
  const { baseUrl, routes, outDir, relPrefix, max = 4 } = opts;
  await fs.mkdir(outDir, { recursive: true });
  const shots: Screenshot[] = [];
  const failures: string[] = [];
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch();
    const desktop = await browser.newContext({ viewport: DESKTOP, colorScheme: "dark" });
    const mobile = await browser.newContext({
      viewport: MOBILE,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: "dark",
    });
    const seenTitles = new Set<string>();
    for (const route of routes) {
      if (shots.length >= max) break;
      const url = new URL(route, baseUrl).toString();
      const name = slug(route);
      try {
        const dp = await desktop.newPage();
        const resp = await dp.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await settle(dp);
        if (!(await looksUseful(dp, resp?.status()))) {
          failures.push(`${route}: empty or error page`);
          await dp.close();
          continue;
        }
        const title = ((await dp.title().catch(() => "")) || route).slice(0, 80);
        // Skip near-duplicates (e.g. client-side routers serving the homepage everywhere).
        const sig = `${title}|${(await dp.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => ""))}`;
        if (seenTitles.has(sig)) {
          await dp.close();
          continue;
        }
        seenTitles.add(sig);
        await dp.screenshot({ path: path.join(outDir, `${name}.png`) });
        await dp.close();

        const mp = await mobile.newPage();
        await mp.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await settle(mp);
        await mp.screenshot({ path: path.join(outDir, `${name}-mobile.png`) });
        await mp.close();

        shots.push({ route, title, desktop: `${relPrefix}/${name}.png`, mobile: `${relPrefix}/${name}-mobile.png` });
      } catch (e) {
        failures.push(`${route}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
  } finally {
    await browser?.close();
  }
  return { shots, failures };
}
