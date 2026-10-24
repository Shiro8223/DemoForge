# DemoForge — 30-Hour Hackathon Build Plan

**Mission:** Turn GitHub repositories into polished, cinematic promotional videos that help hackathon teams showcase their ideas and gain exposure.

**Tagline:** *You built it. We'll make it impossible to ignore.*

This document defines the recommended MVP tech stack, architecture, dependencies, external services, a 30-hour implementation timeline, and a detailed Claude Code master prompt.

---

# 1. Product Scope

DemoForge's core workflow:

1. User provides a GitHub repository URL.
2. Repository is cloned into an isolated workspace.
3. Claude inspects, configures, and attempts to run the project.
4. Playwright captures real application screenshots.
5. Claude generates `summary.md` and a structured `storyboard.json`.
6. Higgsfield MCP generates cinematic scenes.
7. FFmpeg combines scenes, screenshots, overlays, transitions, and music.
8. User previews and downloads the final MP4.

**MVP principle:** Build one reliable end-to-end pipeline. Avoid authentication, billing, analytics, collaboration, and advanced editing until the core flow works.

For the hackathon, prioritise public repositories and common web stacks (especially Next.js, Vite, and standard Node.js applications). Do not promise that every arbitrary repository can be started automatically.

---

# 2. Recommended Tech Stack

| Layer | Technology | Purpose | Priority |
|---|---|---|---|
| Frontend | Next.js + React | Web app and UI | Essential |
| Language | TypeScript | Type safety | Essential |
| Styling | Tailwind CSS | Rapid, consistent styling | Essential |
| UI components | shadcn/ui | Accessible components | Essential |
| Icons | Lucide React | Icons | Essential |
| Validation | Zod | Validate requests and data | Essential |
| Backend | Next.js route handlers / Node.js | API and orchestration | Essential |
| Agent | Claude Agent SDK | Repository reasoning and setup | Essential |
| Source control | Git / simple-git | Clone repositories | Essential |
| Process execution | execa | Run commands with timeouts | Essential |
| Browser automation | Playwright | Open app and capture screenshots | Essential |
| Video generation | Higgsfield MCP | Generate cinematic footage | Essential |
| Video assembly | FFmpeg | Compose, overlay, add music, export MP4 | Essential |
| IDs | nanoid | Job and project IDs | Useful |
| Database/storage | Supabase | Optional persistence and file storage | Optional |
| Isolation | Docker | Run untrusted repository code safely | Strongly recommended |

Use Claude for reasoning and structured plans. Use deterministic code for command execution, screenshot capture, job tracking, and video assembly.

## Suggested packages

- `next`
- `react`
- `react-dom`
- `typescript`
- `tailwindcss`
- `lucide-react`
- `zod`
- `@anthropic-ai/claude-agent-sdk`
- `playwright`
- `simple-git`
- `execa`
- `nanoid`
- `dotenv`

Use shadcn/ui components. Install FFmpeg as a system binary in the worker environment rather than depending on a complex video abstraction.

**Verify package names, supported versions, and APIs against current documentation before installing.** Do not invent Higgsfield MCP tool names or request arguments; inspect the actual MCP server's available tools and docs.

---

# 3. External Services and Dependencies

| Service / dependency | Purpose | Required? |
|---|---|---|
| GitHub | Public source repositories | Yes |
| Anthropic Claude | Agentic repository analysis and setup | Yes |
| Higgsfield | AI video generation | Yes |
| FFmpeg | Video assembly and encoding | Yes |
| Playwright browser binaries | Browser automation | Yes |
| Docker | Isolated repository execution | Recommended |
| Supabase | Database / storage | Optional |
| Vercel | Frontend hosting | Optional |

For a 30-hour build, run the worker locally or on a separate server. Vercel is suitable for the frontend, but long-running repository setup, browser automation, and FFmpeg jobs should not rely on short-lived serverless request execution.

## Environment variables

```env
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Claude — server-side only
ANTHROPIC_API_KEY=

# Higgsfield — server-side only
HIGGSFIELD_API_KEY=

# Optional GitHub token (public repos may not need one)
GITHUB_TOKEN=

# Worker paths
WORKSPACE_ROOT=./workspaces
OUTPUT_ROOT=./outputs
FFMPEG_PATH=ffmpeg

# Optional Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Never expose secret credentials through `NEXT_PUBLIC_` variables or frontend JavaScript. Never put secrets into Claude's repository-analysis prompt or untrusted repository files.

For user-provided Higgsfield credentials, accept them through a server-side settings flow. Do not store tokens in browser local storage. If persistent secure storage is not implemented for the hackathon, treat credentials as temporary and explain that limitation.

---

# 4. Architecture

```text
Next.js UI
    |
    v
Generation API / Job Manager
    |
    v
Isolated Worker (prefer Docker)
    |
    +--> Clone GitHub repository
    |
    +--> Claude Agent: inspect and configure
    |
    +--> Install dependencies / start app
    |
    +--> Playwright: capture screenshots
    |
    +--> Claude: summary.md + storyboard.json
    |
    +--> Higgsfield MCP: generate scenes
    |
    +--> FFmpeg: assemble final video
    |
    v
Output MP4 + screenshots + metadata
    |
    v
Preview and download in UI
```

For the MVP, use a simple job model and polling. Avoid Redis, Kafka, Kubernetes, or distributed workers unless the current implementation genuinely requires them.

Each job should have:
- Unique job ID.
- Project ID.
- Current stage.
- Status (`pending`, `running`, `completed`, `failed`).
- Stage-level progress.
- Error message, if any.
- Created and updated timestamps.
- Output file references.

Do not display fabricated percentage progress. Show real stage states.

## Suggested project structure

```text
src/
  app/
    page.tsx
    api/
      generate/route.ts
      jobs/[jobId]/route.ts
  components/
    landing/
    generation/
    storyboard/
    video/
    settings/
    ui/
  lib/
    github/
    agent/
    browser/
    storyboard/
    higgsfield/
    video/
    storage/
    validation/
  types/
workers/
  generation-worker.ts
workspaces/
outputs/
```

Adapt this structure to the existing repository. Do not overwrite existing user work.

---

# 5. Core Pipeline and Artifacts

## Stage 1 — Repository analysis

Produce `project-analysis.json`, including:

- Project name and description.
- Framework and languages.
- Package manager.
- Install and start commands.
- Likely port.
- Required environment variables.
- Important routes.
- Features supported by evidence.
- Setup risks or blockers.

The agent must inspect repository files and avoid guessing commands or inventing credentials.

## Stage 2 — Setup and launch

The agent should:
1. Inspect the repository.
2. Identify a suitable setup approach.
3. Install dependencies.
4. Identify missing environment variables.
5. Start the application.
6. Verify that it responds.
7. Report the local URL.

Use timeouts and bounded retries. If external services or secrets are missing, report the issue clearly rather than repeatedly retrying.

## Stage 3 — Screenshot capture

Use Playwright to:
- Open the app.
- Wait for a stable page.
- Capture the homepage.
- Identify a few useful routes from repository evidence.
- Capture accessible feature pages.
- Save images under the project workspace.

Use consistent viewport dimensions. If navigation or authentication fails, capture the homepage and continue. Do not fabricate application screenshots.

Suggested outputs:

```text
screenshots/
  homepage.png
  dashboard.png
  feature-1.png
  feature-2.png
```

## Stage 4 — `summary.md`

Generate a Markdown summary containing:
- Project name and description.
- Framework.
- Core features.
- Important routes.
- Screenshot references.
- Suggested demo narrative.
- Suggested visual style.
- Video duration.
- Closing message.

Ground the summary in repository contents and observed application behaviour. Do not claim features that are not supported by evidence.

## Stage 5 — `storyboard.json`

Use a structured format that is easy for code to validate and consume:

```json
{
  "project": "Example Project",
  "duration": 25,
  "aspectRatio": "9:16",
  "visualStyle": "cinematic, polished, developer-focused",
  "musicDirection": "upbeat electronic instrumental",
  "scenes": [
    {
      "id": "scene-1",
      "title": "The Hook",
      "duration": 4,
      "purpose": "Introduce the problem",
      "visualType": "generated",
      "visualDescription": "Cinematic opening",
      "videoPrompt": "A concise prompt for the scene",
      "screenshot": null,
      "textOverlay": "A better way to build",
      "transition": "fade"
    },
    {
      "id": "scene-2",
      "title": "The Product",
      "duration": 8,
      "purpose": "Show the real product",
      "visualType": "screenshot",
      "visualDescription": "Actual application dashboard",
      "videoPrompt": "Subtle cinematic movement while preserving UI",
      "screenshot": "screenshots/dashboard.png",
      "textOverlay": "Meet the product",
      "transition": "cut"
    }
  ]
}
```

Validate this output with Zod before using it. Default to a 20–30 second video and 9:16 portrait aspect ratio. A typical narrative is hook → problem → product → core feature → outcome → closing, but adapt it to the project.

## Stage 6 — Higgsfield and video assembly

Before implementing the Higgsfield integration:
1. Inspect the available MCP tools and documentation.
2. Determine supported generation operations and inputs.
3. Understand job polling and output retrieval.
4. Confirm authentication.
5. Check duration, resolution, and reference-image constraints.

Do not assume the MCP integration supports every desired operation.

Use Higgsfield primarily for cinematic introductions, backgrounds, transitions, and closing scenes. Keep important application UI accurate by using actual screenshots. AI video can distort text, logos, and interfaces.

Use FFmpeg to:
- Normalise dimensions, frame rate, and encoding.
- Combine generated scenes and screenshot-based scenes.
- Add transitions and text overlays.
- Add music at sensible levels.
- Produce a valid MP4.
- Avoid missing assets and unintended black frames.

Suggested final output:

```text
outputs/
  scene-1.mp4
  scene-2.mp4
  scene-3.mp4
  final-demo.mp4
```

For a 30-hour hackathon, 20–30 seconds is a useful target. Prioritise one complete video over many elaborate scenes.

---

# 6. Frontend Requirements

Build a polished, dark-mode, premium developer-tool interface.

Use:
- Deep charcoal backgrounds.
- Restrained gradients and accent colours.
- Clear progress indicators.
- Monospace treatment for repository details.
- Clean cards and generous spacing.
- A prominent video preview.

## Import screen

Include:
- DemoForge branding.
- Tagline: “You built it. We'll make it impossible to ignore.”
- GitHub URL input.
- Generate Demo button.
- Short explanation of the workflow.

## Generation screen

Show the real status of:
- Repository cloning.
- Repository analysis.
- Dependency installation.
- Application startup.
- Feature discovery.
- Screenshot capture.
- Summary generation.
- Storyboard generation.
- Video generation.
- Video assembly.

Statuses: pending, running, completed, failed.

## Results screen

Show:
- Project name and description.
- Playable video preview.
- Storyboard.
- Captured screenshots.
- Download MP4 button.
- Regenerate action.

## Settings

Provide a simple way to enter a Higgsfield credential. Keep it server-side. Do not expose it in client code or browser local storage.

Do not spend hackathon time on authentication, billing, collaboration, or social publishing.

---

# 7. Security Requirements

GitHub repositories are untrusted code. Treat repository execution as a security boundary.

At minimum:
- Use unique disposable workspaces.
- Validate repository URLs and prevent path traversal.
- Avoid shell command injection; pass arguments safely.
- Set command and job timeouts.
- Restrict CPU and memory.
- Avoid mounting sensitive host directories.
- Do not expose host secrets to repository processes.
- Do not run arbitrary repository code on the public-facing web server.
- Restrict network access where practical.
- Clean temporary files when safe.

Prefer Docker for repository execution. Do not claim a basic hackathon implementation is production-safe.

---

# 8. 30-Hour Hackathon Timeline

| Elapsed time | Work | Deliverable |
|---|---|---|
| 0–2h | Project setup and UI scaffold | Running Next.js app |
| 2–5h | GitHub import and cloning | Repository workspace |
| 5–9h | Claude agent setup workflow | App analysed and started |
| 9–12h | Playwright screenshots | Real screenshots |
| 12–14h | Summary and storyboard | `summary.md` + valid JSON |
| 14–19h | Higgsfield MCP integration | At least one real generated scene |
| 19–22h | FFmpeg assembly | Final MP4 |
| 22–25h | Results UI | Preview and download |
| 25–27h | Scene edit/regeneration | One useful editing action |
| 27–29h | End-to-end test and fixes | Reliable demo |
| 29–30h | Presentation preparation | Polished live pitch |

**Critical checkpoints:**
- By hour 14: repository runs, screenshots exist, summary and storyboard are valid.
- By hour 19: at least one real Higgsfield-generated scene exists.
- By hour 22: a final MP4 can be assembled.

If Higgsfield is not working by hour 19, stop adding features and focus on completing the integration and the end-to-end flow.

## Cut list if behind schedule

Cut in this order:
1. Authentication.
2. Supabase persistence.
3. Private repository support.
4. Multi-user collaboration.
5. Advanced timeline editing.
6. Multiple aspect ratios.
7. Social media publishing.

Do not cut actual video generation; it is the core value proposition.

---

# 9. Testing Checklist

Test the entire workflow with a known-good, small web repository that has:
- A homepage.
- At least two useful feature pages.
- No mandatory external API dependencies.

Verify:
- [ ] Repository URL is validated.
- [ ] Repository clones successfully.
- [ ] Framework and setup commands are identified.
- [ ] Application starts and responds.
- [ ] Playwright captures real screenshots.
- [ ] `summary.md` is generated.
- [ ] `storyboard.json` validates.
- [ ] Higgsfield generates at least one real scene.
- [ ] FFmpeg creates a valid MP4.
- [ ] Browser can play the video.
- [ ] User can download the video.
- [ ] Failures are shown clearly.
- [ ] No fake output is silently substituted for a real integration.

If an external service is unavailable, report that limitation honestly.

---

# 10. Detailed Claude Code Master Implementation Prompt

Copy the following section into Claude Code after opening the project directory.

---

## Role

You are the lead full-stack engineer, AI systems architect, and product designer responsible for building DemoForge.

Work autonomously, make sensible engineering decisions, and prioritise a functional end-to-end MVP. You are working within a 30-hour hackathon.

Do not build a complex production SaaS platform. Build a visually impressive, technically functional prototype that proves the product's core value.

Prioritise working functionality over unnecessary abstraction, excessive documentation, or speculative features. Do not ask for permission for routine decisions. Do not claim an integration works unless tested.

## Mission

DemoForge turns GitHub repositories into cinematic promotional videos that help hackathon teams showcase their projects, communicate their ideas, and gain exposure.

The user provides a repository URL. DemoForge uses Claude to inspect and attempt to run it, captures actual application screenshots, generates a Markdown project summary and a structured storyboard, uses Higgsfield MCP to generate cinematic scenes, and assembles a short MP4 using FFmpeg.

The user must be able to preview and download the result.

The primary audience is hackathon teams who have built a working project but need a polished way to showcase it.

## Product principle

The generated video must be a story about the actual application, not a generic AI montage.

Use real application screenshots for important product interfaces. Use generated footage for cinematic hooks, transitions, backgrounds, and closing scenes. Do not fabricate features or replace accurate UI with distorted AI-generated interfaces.

## Required MVP

### A. GitHub import

Build an interface accepting a public GitHub repository URL.

Validate the URL, extract owner/repository, clone it to a unique workspace, prevent path traversal and overwrites, and display useful errors.

Public repositories are enough for the hackathon. Do not implement OAuth unless necessary.

### B. Claude repository analysis

Use the Claude Agent SDK (or the verified suitable Claude integration) to inspect the project and identify:
- Name and description.
- Framework and languages.
- Package manager.
- Install and start commands.
- Likely port.
- Required environment variables.
- Important routes.
- Core features.
- Setup blockers.

Do not assume every repository is Next.js. Prioritise Next.js, Vite, and standard Node.js projects. Inspect files rather than inventing commands.

### C. Setup and launch

Claude should inspect the repo, select an appropriate setup, install dependencies, identify missing environment variables, start the app, verify it responds, and report its URL.

Use timeouts and bounded retries. Do not fabricate credentials or endlessly retry. Report missing external services clearly.

### D. Screenshot capture

Use Playwright to open the running app, wait for stability, capture the homepage, identify a few relevant routes, and capture important interfaces. Save actual screenshots in the workspace with consistent dimensions.

If a route is inaccessible, capture the homepage and continue. Do not create fake screenshots.

### E. Summary and storyboard

Generate `summary.md` with project details, verified features, routes, screenshots, demo narrative, visual style, suggested duration, and closing message.

Generate validated `storyboard.json` with project metadata and scenes. Each scene should include ID, title, duration, purpose, visual type, description, generation prompt, screenshot reference if applicable, text overlay, transition, and audio direction.

Default to 20–30 seconds and 9:16 portrait. Adapt the narrative to the project.

### F. Higgsfield MCP

Higgsfield MCP is core to the product.

Before implementation, inspect the actual available MCP tools, docs, input schemas, authentication, job tracking, output retrieval, and constraints. Do not invent tool names or assume unsupported features.

Generate real cinematic scenes. If the integration requires asynchronous jobs, implement polling or waiting based on the actual tool contract.

Do not silently substitute mock videos. If credentials or service access are missing, report this and keep the integration boundary clear.

### G. FFmpeg assembly

Use FFmpeg to normalise and assemble scenes, screenshots, overlays, transitions, music, and branding into a valid MP4. Normalise resolution and frame rate. Handle different scene dimensions. Avoid missing assets and unintended black frames.

### H. UI

Build a premium dark-mode interface using Next.js, TypeScript, Tailwind, shadcn/ui, and Lucide React.

Screens:
1. Import: branding, tagline, repository URL, Generate Demo.
2. Generation: real pipeline stages and statuses.
3. Results: video preview, project details, storyboard, screenshots, Download MP4, and Regenerate.
4. Settings: secure server-side Higgsfield credential handling.

Do not show fabricated percentages. Use real stage states: pending, running, completed, failed.

### I. Job architecture

Use a simple job-based backend. Each job needs an ID, project ID, current stage, status, timestamps, output references, and error message.

Polling is acceptable. Do not introduce Redis, Kafka, Kubernetes, or distributed workers without a clear need.

Separate repository operations, agent logic, browser automation, storyboard validation, Higgsfield integration, and FFmpeg assembly into understandable modules.

### J. Security

Repository code is untrusted. Use disposable workspaces and preferably Docker. Add command timeouts, resource limits, safe argument handling, path validation, and restrictions on filesystem and secret access. Do not run arbitrary repo code on the public-facing web server. Do not expose credentials to client code or repository processes.

Acknowledge that a hackathon prototype is not automatically production-safe.

## Dependencies

Use the stack and package list defined earlier in this document. Verify package names, versions, and API contracts. Avoid unnecessary dependencies.

## Development process

Before coding:
1. Inspect the current directory and existing files.
2. Identify existing project structure and dependencies.
3. Do not overwrite user work.
4. Produce a concise plan and implementation checklist.
5. Start implementing P0 functionality immediately.

Keep the README and checklist updated. The README should include mission, stack, setup, environment variables, architecture, and known limitations.

## Priority order

P0:
- Repository import.
- Repository analysis.
- App startup.
- Screenshot capture.
- Summary generation.
- Storyboard generation.
- Real Higgsfield video generation.
- FFmpeg assembly.
- Video preview and download.

P1:
- Edit one scene.
- Regenerate one scene.
- Credential settings.
- Project branding.

P2:
- Authentication.
- Private repositories.
- Collaboration.
- Social publishing.
- Analytics.
- Billing.
- Advanced editing.

Do not implement P2 during the MVP.

## Test requirements

Use a known-good repository with a homepage, two feature pages, and no mandatory external API dependencies.

Test cloning, analysis, startup, screenshots, summary, storyboard validation, a real Higgsfield scene, FFmpeg output, browser playback, and download.

Do not mark a feature complete until tested. Report external-service limitations honestly.

## Final deliverable

The demo must show:

1. User pastes a GitHub URL.
2. DemoForge inspects and launches the project.
3. Real screenshots are captured.
4. A summary and storyboard are generated.
5. Higgsfield creates cinematic scenes.
6. FFmpeg assembles the video.
7. User previews and downloads the MP4.

Build the smallest cohesive product that makes a hackathon team say:

“I want this for my project.”

Start by inspecting the existing repository and creating a concise implementation plan. Then begin the highest-priority functionality immediately.
