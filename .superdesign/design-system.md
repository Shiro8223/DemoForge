# DemoForge Design System — "Refined Dark"

## Product context
DemoForge turns a public GitHub repository into a 20–30s vertical (9:16) cinematic promo video. Pipeline: clone → analyse (Claude) → install → launch in sandbox → discover routes → Playwright screenshots → summary + storyboard → Higgsfield cinematic scenes → FFmpeg assembly → final-demo.mp4.
Audience: indie hackers, hackathon teams, dev-tool founders who need a demo for Devpost / socials / launch.
JTBD: "Paste my repo, get a credible, good-looking product video without editing anything." Trust matters: real screenshots of real features, AI footage only where it can't misrepresent the product.

## Pages
- `/` Home — hero + GitHub repo import form (primary action "Generate demo"), system status badges (Claude, Higgsfield, FFmpeg, Sandbox), 7-step "How it works" (Clone, Understand, Launch, Capture, Storyboard, Generate, Assemble), Recent jobs gallery (9:16 thumbnails with status).
- `/jobs/[jobId]` Job view — live pipeline stage list with statuses + logs, final 9:16 video player + download, storyboard scene cards (editable, regenerate), screenshots grid, summary markdown.
- `/settings` — Higgsfield API key card (save + test connection), Claude status card, Sandbox mode card.

## Visual direction
Professional, Linear/Vercel/Raycast-grade dark SaaS. Calm, precise, high-contrast typography, restrained color. Brand glow used sparingly (hero, primary CTA, active states) — never as wallpaper. Dense but breathable; information hierarchy over decoration.

## Color (dark only)
| Token | Value | Use |
|---|---|---|
| bg | #08090d | page background |
| panel | #0f1117 | cards, inputs |
| panel-2 | #151823 | raised surfaces, hover, icon tiles |
| line | #1f2330 | borders, dividers (1px) |
| line-strong | #2a2f3f | hovered/focused borders |
| muted | #8b90a5 | secondary text |
| fg | #e8eaf2 | primary text |
| accent | #8b5cf6 | violet — primary actions, focus rings, active |
| accent-2 | #22d3ee | cyan — secondary accent, used sparingly |
Status: success emerald-400/500, warning amber-400/500, danger red-400/500, running violet-400 — as `-500/10` bg, `-500/30` border, `-300` text.
Primary gradient: violet-600 → indigo-600 (buttons). Brand gradient: violet-500 → cyan-400 (logo tile, single hero highlight). Text gradient: #c4b5fd → #67e8f9 (one phrase per page max).
No other hues. No pink, no orange, no neon green, no purple-pink gradients.

## Typography
- Sans: Inter (500 body, 600 for labels). 14px base UI, 15–16px marketing body.
- Display: Inter Display Bold 700, tight tracking (-0.02em). Hero 56–72px / 1.05.
- Mono: JetBrains Mono — repo slugs, job ids, step numbers, durations, logs.
- Eyebrow: 12px uppercase, tracking 0.16em, muted.
No serif or decorative fonts.

## Spacing, radius, elevation
- 4px grid. Content max-w 1152px (settings 768px). Gutters 16 / 24px. Header 56px.
- Radius: cards 16px, buttons/inputs 12px, small controls 8px, badges full.
- Borders over shadows. Shadows only: primary button `0 0 0 1px rgb(255 255 255/0.08) inset, 0 8px 24px -8px rgb(139 92 246/0.6)`; logo glow `0 0 20px -4px rgb(139 92 246/0.8)`; subtle card `0 1px 0 rgb(255 255 255/0.03) inset`.
- Background: faint 48px grid with radial mask + soft violet/cyan radial glow at top only.

## Components
- Header: sticky, blurred bg/70, 1px bottom border. Logo = gradient tile (violet-500→cyan-400) with lucide Clapperboard icon + "DemoForge" wordmark. Nav links (Dashboard/Jobs, Docs, Settings) ghost style; right side primary "New demo" small button.
- Buttons: primary gradient; secondary panel-2 + border; ghost; destructive red tint. Sizes 32 / 40 / 48px.
- Inputs: 40–48px, panel bg, line border, violet focus ring at 30%. Repo input has GitHub icon prefix and mono text.
- Badges: pill, status-tinted, with leading dot.
- StatusDot: 24px circle — completed check (emerald), running spinner (violet), failed x (red), skipped minus (amber), pending dot.
- Cards: panel/80, line border, 16px radius, optional header row with title + action.
- Icons: lucide, 16px, stroke 1.75.

## Motion
150–200ms ease-out on hover/focus. Shimmer sweep for running stages. Spinner for active stage. No bouncy or large motion.

## Rules
Use ONLY the fonts, colors, spacing and component styles above. Do not introduce new fonts, colors or visual styles.
