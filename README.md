# DemoForge

**You built it. We'll make it impossible to ignore.**

DemoForge turns a public GitHub repository into a 20–30 second vertical (9:16) promo video. It launches the app, films the **real UI**, writes a grounded summary and storyboard, generates cinematic scenes with Higgsfield, and cuts the result together with FFmpeg.

```
GitHub URL → clone → analyse (Gemini) → install → launch → discover routes → Playwright screenshots
           → summary.md + storyboard.json (validated) → Higgsfield MCP scenes → FFmpeg → final-demo.mp4
```

## Quick start

Requirements: Node 20+, FFmpeg/ffprobe on `PATH`, and a Chromium for Playwright (`npx playwright install chromium`). Docker is optional but recommended.

```bash
npm install
cp .env.example .env          # add GEMINI_API_KEY and HF_CREDENTIALS (Higgsfield KEY_ID:KEY_SECRET)
npm run dev:all               # web on :3000 + generation worker
```

Open http://localhost:3000, paste a repo URL and press **Generate Demo**. The worker can also run on its own (`npm run dev` + `npm run worker`).

On Windows, `npm run service:install` builds the app and registers a background service (a per-user Scheduled Task, started at logon) running the production web server and worker (`npm run start:all`), logging to `outputs/service.log`. Manage it with `powershell -File scripts/service.ps1 status|stop|start|restart`; remove it with `npm run service:uninstall`. Re-run `service:install` after pulling changes so it rebuilds.

To run one generation without the web UI:

```bash
npm run once -- https://github.com/owner/repo
npm run once -- --local tests/fixtures/launchpad   # bundled fixture app, no cloning
```

## Environment variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini repository analysis, `summary.md` and storyboard. Without it, deterministic templates are used and labelled as such. |
| `GEMINI_MODEL` | Defaults to `gemini-3.5-flash`. |
| `GEMINI_FALLBACK_MODEL` | Optional. Retried when the main model is rate-limited or returns a server error, e.g. `gemini-3.5-flash-lite`. |
| `HF_CREDENTIALS` | **Recommended.** Higgsfield developer API key pair from console.higgsfield.ai, as `KEY_ID:KEY_SECRET`. When set, it is used instead of MCP. Check it for free with `npx tsx scripts/check-higgsfield.ts`. |
| `HIGGSFIELD_MODEL` | Text-to-video model path for the developer API. Default `kling-video/v3.0/std/text-to-video`; Seedance 2.5 is `bytedance/seedance-2.5/text-to-video`. |
| `HIGGSFIELD_API_BASE` | Defaults to `https://api.higgsfield.ai`. |
| `HIGGSFIELD_MCP_URL` | MCP fallback only. Defaults to `https://mcp.higgsfield.ai/mcp`. |
| `HIGGSFIELD_API_KEY` | MCP fallback only: bearer token for the MCP server (the hosted server expects OAuth, so prefer `HF_CREDENTIALS`). Can also be set from **/settings** (stored server-side in `data/secrets/`). |
| `HIGGSFIELD_VIDEO_TOOL` / `HIGGSFIELD_STATUS_TOOL` | Pin tool names if auto-discovery picks the wrong ones. |
| `HIGGSFIELD_MAX_SCENES` | Cap Higgsfield calls per video (credits). Default 2. |
| `DEMOFORGE_SANDBOX` | `local` (default) or `docker`. |
| `DEMOFORGE_DOCKER_IMAGE` | Image for docker mode. Default `node:22-bookworm`. |
| `MUSIC_PATH` | Optional royalty-free track. Otherwise a procedural ambient bed is synthesised. |
| `WORKSPACE_ROOT`, `OUTPUT_ROOT`, `DATA_ROOT`, `FFMPEG_PATH`, `FFPROBE_PATH` | Paths. |

Secrets are only read server-side. They are never sent to the browser, never placed in Gemini prompts, and never passed to repository processes.

## Architecture

```
src/
  app/                    Next.js UI + route handlers
    api/generate          POST: validate URL, enqueue job
    api/jobs/[id]         GET job state (polled by the UI)
    api/jobs/[id]/files   Serves video/screenshots/summary (Range support, traversal-safe)
    api/jobs/[id]/scenes  PATCH: edit a scene → re-render (optionally re-generate with Higgsfield)
    api/settings/…        Higgsfield token (server-side), connection test
  lib/
    github/      URL parsing/validation, shallow clone (symlinks disabled), repo metadata
    agent/       heuristics.ts (static analysis: framework, PM, scripts, routes, env)
                 gemini.ts (Gemini enrichment with structured outputs; repo content treated as untrusted)
    sandbox/     install + start (scrubbed env, timeouts, process-group kill) or Docker
    browser/     Playwright route discovery + desktop/mobile screenshots
    storyboard/  summary + storyboard (Gemini or template), Zod-validated and normalised
    higgsfield/  MCP client: runtime tool discovery, schema-driven args, job polling, download
    video/       FFmpeg: per-scene render, xfade transitions, typography, music, poster
    storage/     file-based job store + worker heartbeat
  pipeline.ts    stage orchestration
workers/generation-worker.ts   polls the job store and runs one job at a time
```

Jobs live in `outputs/jobs/<id>/` (`job.json`, `project-analysis.json`, `summary.md`, `storyboard.json`, `screenshots/`, `scenes/`, `final-demo.mp4`, `logs/`). The UI polls real stage states (`pending/running/completed/failed/skipped`) and never shows invented percentages.

### Honesty rules built into the pipeline

- Product UI in the video always comes from real Playwright screenshots. Generated footage is only used for the hook, transitions and outro.
- If Higgsfield isn't configured or a call fails, those scenes are rendered locally as motion-graphics title cards. The stage shows *skipped* or *failed* and the results page says so. Nothing is quietly swapped in.
- If the app can't be installed or started, the stages are marked failed or skipped and the video falls back to title scenes, with a notice.
- Gemini may only choose start scripts that exist in `package.json`. Commands are argv arrays, never shell strings.

### Higgsfield integration

**Developer API (default when `HF_CREDENTIALS` is set).** `src/lib/higgsfield/api.ts` sends each generated scene to `POST {HIGGSFIELD_API_BASE}/{HIGGSFIELD_MODEL}` with `Authorization: Key KEY_ID:KEY_SECRET`, polls `/requests/{id}/status` and downloads `video.url`. Clips are requested at 4–15 s (the models' minimum) and trimmed to the scene. The key is never sent to the download host or to repo code.

**MCP fallback.** Used only when `HF_CREDENTIALS` is empty.

Higgsfield's hosted MCP tool catalogue varies, so DemoForge does **not** hard-code tool names. On each run it lists the server's tools and:

1. Picks a text-to-video tool (or `HIGGSFIELD_VIDEO_TOOL`) and a job-status tool (or `HIGGSFIELD_STATUS_TOOL`).
2. Fills arguments from the tool's JSON schema (prompt, `9:16` aspect, nearest allowed duration, defaults for other required fields).
3. Takes a video URL from the result, or polls the status tool with the returned job id, then downloads and validates the clip with ffprobe.

**Settings → Test connection** shows which tools were discovered. The official hosted server documents OAuth sign-in. DemoForge sends the configured token as `Authorization: Bearer …`. Whether a static token is accepted depends on your Higgsfield account and server, so check it with *Test connection*.

## Security

Repository code is untrusted. Current measures:

- URL allow-list (github.com only, no credentials, strict owner/repo names). DemoForge builds the clone URL itself.
- Unique disposable workspace per job, deleted afterwards. Shallow clone with `core.symlinks=false`, no hooks, size limit.
- Repo processes run with a scrubbed environment (no API keys or tokens), a throwaway `HOME`, timeouts, and process-group cleanup.
- The worker runs separately from the web server.
- `DEMOFORGE_SANDBOX=docker` runs install and start in a container with memory, CPU and pid limits and `no-new-privileges`, publishing only to `127.0.0.1`.

**This is a hackathon prototype, not a production-grade sandbox.** Local mode is not a security boundary, so use docker mode (ideally on a dedicated VM with restricted egress) for repositories you don't trust.

## Testing

```bash
npm run typecheck && npm run lint && npm test
npm run once -- --local tests/fixtures/launchpad
```

`npm test` covers URL validation, path traversal, storyboard validation and normalisation, README parsing, Higgsfield tool selection and argument building. It also runs integration tests of both Higgsfield clients (developer API and MCP) against local **mock** servers (test-only) covering submit → poll → download.

## Status / known limitations

- [x] Import, clone, static + Gemini analysis, install/launch, route discovery, screenshots
- [x] `summary.md`, validated `storyboard.json`, FFmpeg assembly with transitions, typography and music
- [x] Results: preview, download, regenerate, per-scene edit and re-render, single-scene Higgsfield regenerate
- [x] Settings: server-side Higgsfield token + connection test
- [ ] Verified against the live Higgsfield MCP server (this dev environment couldn't reach it). The client is tested against a mock MCP server only.
- [x] Verified Gemini structured-output calls with a real API key. A full end-to-end job run has not been done yet.
- [ ] Docker sandbox mode is implemented but has not yet been run end to end.
- Monorepos, apps that need databases or secrets, and auth-gated pages may only produce the homepage or title scenes.
- File-based job store with one worker. Fine for a demo, not for scale.

Fonts: Inter (SIL OFL 1.1) and JetBrains Mono (Apache 2.0), bundled in `assets/fonts/`.
