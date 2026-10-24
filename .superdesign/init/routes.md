# DemoForge — Superdesign init

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 (CSS-first `@theme` in globals.css, no tailwind.config) via `@tailwindcss/postcss` · shadcn-style primitives built with class-variance-authority + clsx + tailwind-merge (`cn`) · `@radix-ui/react-slot` · lucide-react icons · local fonts (Inter Medium, Inter Display Bold, JetBrains Mono). Dark-only UI.

# Routes (Next.js App Router, file-based)

All pages use `src/app/layout.tsx` (RootLayout + SiteHeader).

| URL | File | Summary |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | Landing: hero ("You built it. We'll make it impossible to ignore."), GitHub repo ImportForm, SystemStatus badges, 7-step "How it works" grid, RecentJobs gallery. |
| `/jobs/[jobId]` | `src/app/jobs/[jobId]/page.tsx` | Client JobView: polls a generation job; stage list progress, final 9:16 video player + download, storyboard SceneCards (editable/regenerate), screenshots grid, summary markdown. |
| `/settings` | `src/app/settings/page.tsx` | Settings: Higgsfield API key card (form + test), Claude status card, Sandbox mode card. |

API routes (no UI): `/api/generate`, `/api/health`, `/api/jobs`, `/api/jobs/[jobId]`, `/api/jobs/[jobId]/files/[...path]`, `/api/jobs/[jobId]/regenerate`, `/api/jobs/[jobId]/scenes/[sceneId]`, `/api/settings/higgsfield`, `/api/settings/higgsfield/test`.
