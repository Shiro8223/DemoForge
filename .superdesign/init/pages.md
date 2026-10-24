# DemoForge — Superdesign init

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 (CSS-first `@theme` in globals.css, no tailwind.config) via `@tailwindcss/postcss` · shadcn-style primitives built with class-variance-authority + clsx + tailwind-merge (`cn`) · `@radix-ui/react-slot` · lucide-react icons · local fonts (Inter Medium, Inter Display Bold, JetBrains Mono). Dark-only UI.

# Page dependency trees

Every page also depends on the layout: `src/app/layout.tsx` → `src/components/site-header.tsx`, `src/app/globals.css`. All ui/* primitives depend on `src/lib/utils.ts`.

## / (Home)
Entry: `src/app/page.tsx`
Dependencies:
- `src/components/landing/import-form.tsx`
  - `src/components/ui/button.tsx`
- `src/components/landing/system-status.tsx`
  - `src/components/ui/badge.tsx`
- `src/components/landing/recent-jobs.tsx`
  - `src/components/generation/status-dot.tsx`
  - `src/types/index.ts`

## /jobs/[jobId] (Job / generation view)
Entry: `src/app/jobs/[jobId]/page.tsx`
Dependencies:
- `src/components/generation/job-view.tsx`
  - `src/components/ui/badge.tsx`
  - `src/components/ui/button.tsx`
  - `src/components/ui/card.tsx`
  - `src/components/generation/stage-list.tsx`
    - `src/components/generation/status-dot.tsx`
  - `src/components/generation/status-dot.tsx`
  - `src/components/storyboard/scene-card.tsx`
    - `src/components/ui/badge.tsx`
    - `src/components/ui/button.tsx`
    - `src/components/ui/input.tsx`
  - `src/components/storyboard/markdown.tsx`
  - `src/types/index.ts`

## /settings
Entry: `src/app/settings/page.tsx`
Dependencies:
- `src/components/settings/higgsfield-settings.tsx`
  - `src/components/ui/badge.tsx`
  - `src/components/ui/button.tsx`
  - `src/components/ui/card.tsx`
  - `src/components/ui/input.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/badge.tsx`
- `src/lib/config.ts` (server config, not UI)
