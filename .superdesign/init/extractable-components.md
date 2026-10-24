# DemoForge — Superdesign init

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 (CSS-first `@theme` in globals.css, no tailwind.config) via `@tailwindcss/postcss` · shadcn-style primitives built with class-variance-authority + clsx + tailwind-merge (`cn`) · `@radix-ui/react-slot` · lucide-react icons · local fonts (Inter Medium, Inter Display Bold, JetBrains Mono). Dark-only UI.

# Extractable components

## Layout Components

## SiteHeader
- Source: `src/components/site-header.tsx`
- Category: layout
- Description: Sticky blurred top bar with gradient logo tile, DemoForge wordmark and Settings link
- Extractable props: activeItem (string: "home" | "settings", default: "home"), homeHref (default: "/"), settingsHref (default: "/settings")
- Hardcoded: Clapperboard + Settings lucide icons, "DemoForge" text, gradient/shadow classes

## BackgroundGlow
- Source: `src/app/layout.tsx` (fixed background layer) + `.glow`/`.bg-grid` in `src/app/globals.css`
- Category: layout
- Description: Fixed violet/cyan radial glow with masked 48px grid behind every page
- Extractable props: none
- Hardcoded: gradient colors, grid size, mask

## Basic Components

## Button
- Source: `src/components/ui/button.tsx`
- Category: basic
- Description: Gradient primary, secondary, ghost and destructive buttons
- Extractable props: variant (default|secondary|ghost|destructive), size (default|sm|lg|icon), label
- Hardcoded: gradient, shadow, radius classes

## Card
- Source: `src/components/ui/card.tsx`
- Category: basic
- Description: Translucent rounded-2xl panel with header/title/description/content slots
- Extractable props: title, description
- Hardcoded: border/bg/blur classes

## Badge
- Source: `src/components/ui/badge.tsx`
- Category: basic
- Description: Status pill
- Extractable props: variant (default|success|warning|danger|accent), label
- Hardcoded: color classes per variant

## Input / Textarea
- Source: `src/components/ui/input.tsx`
- Category: basic
- Description: Dark form fields with violet focus ring
- Extractable props: placeholder, value
- Hardcoded: styling classes

## StatusDot
- Source: `src/components/generation/status-dot.tsx`
- Category: basic
- Description: Colored dot indicating job/stage status
- Extractable props: status ("pending" | "running" | "completed" | "failed" | "skipped", default: "pending")
- Hardcoded: Check/Loader2/X/Minus icons, emerald/violet/red/amber color mapping

## StepCard
- Source: `src/app/page.tsx` (How it works list item)
- Category: basic
- Description: Numbered step tile with icon square, title and body
- Extractable props: index (number), title, body
- Hardcoded: lucide icon per step, classes

## SceneCard
- Source: `src/components/storyboard/scene-card.tsx`
- Category: basic
- Description: Storyboard scene card with media preview and editable fields
- Extractable props: sceneIndex, status
- Hardcoded: field labels, icons, classes
