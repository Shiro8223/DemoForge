# DemoForge — Superdesign init

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 (CSS-first `@theme` in globals.css, no tailwind.config) via `@tailwindcss/postcss` · shadcn-style primitives built with class-variance-authority + clsx + tailwind-merge (`cn`) · `@radix-ui/react-slot` · lucide-react icons · local fonts (Inter Medium, Inter Display Bold, JetBrains Mono). Dark-only UI.

# Theme

## Part 1 — Token summary

Defined via Tailwind v4 `@theme` in `src/app/globals.css` (utilities: `bg-bg`, `bg-panel`, `bg-panel-2`, `border-line`, `text-muted`, `text-fg`, `ring-accent`, `font-display`, `font-mono`). Dark only (`color-scheme: dark`), no light theme.

**Colors**
| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | #08090d | page background |
| `--color-panel` | #0f1117 | cards, inputs (often /70–/80 opacity + backdrop-blur) |
| `--color-panel-2` | #151823 | raised surfaces, secondary buttons, icon tiles |
| `--color-line` | #1f2330 | borders, dividers |
| `--color-muted` | #8b90a5 | secondary text |
| `--color-fg` | #e8eaf2 | primary text |
| `--color-accent` | #8b5cf6 | violet accent, focus rings |
| `--color-accent-2` | #22d3ee | cyan secondary accent |

Also used directly: Tailwind violet-200/300/500/600, indigo-600, cyan-400; status colors emerald/amber/red at -500/30 border, -500/10 bg, -300 text. Primary button gradient `from-violet-600 to-indigo-600`; logo tile `from-violet-500 to-cyan-400`; `.text-gradient` #c4b5fd → #67e8f9.

**Typography**
- Sans: Inter Medium (500) — `--font-inter`
- Display: Inter Display Bold (700) — `font-display`, tight tracking; hero `text-4xl sm:text-6xl md:text-7xl leading-[1.05]`
- Mono: JetBrains Mono — `font-mono` for step numbers, repo ids, code
- Section eyebrow: `text-sm uppercase tracking-[0.16em] text-muted`

**Radius**: cards rounded-2xl, buttons/inputs rounded-xl, small buttons/icon tiles rounded-lg, badges rounded-full.
**Shadows**: primary button `0 0 0 1px rgb(255 255 255/0.08) inset, 0 8px 24px -8px rgb(139 92 246/0.6)`; logo glow `0 0 20px -4px rgb(139 92 246/0.8)`.
**Effects**: `.glow` (violet + cyan radial gradients), `.bg-grid` (48px grid, radial mask), `.shimmer` loading sweep, `backdrop-blur` on header/cards.
**Layout**: content `max-w-6xl` (settings `max-w-3xl`), gutters `px-4 sm:px-6`, header h-14. Breakpoints: Tailwind defaults (sm 640, md 768, lg 1024).

## Part 2 — Raw sources

### `src/app/globals.css`
```css
@import "tailwindcss";

@theme {
  --color-bg: #08090d;
  --color-panel: #0f1117;
  --color-panel-2: #151823;
  --color-line: #1f2330;
  --color-muted: #8b90a5;
  --color-fg: #e8eaf2;
  --color-accent: #8b5cf6;
  --color-accent-2: #22d3ee;
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-inter-display), var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, SFMono-Regular, monospace;
}

html {
  color-scheme: dark;
}

body {
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

.bg-grid {
  background-image:
    linear-gradient(to right, rgb(255 255 255 / 0.035) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(255 255 255 / 0.035) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%);
}

.glow {
  background:
    radial-gradient(600px 300px at 30% 0%, rgb(139 92 246 / 0.22), transparent 70%),
    radial-gradient(500px 260px at 75% 10%, rgb(34 211 238 / 0.14), transparent 70%);
}

.text-gradient {
  background: linear-gradient(90deg, #c4b5fd, #67e8f9);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

@keyframes shimmer {
  from { background-position: -200% 0; }
  to { background-position: 200% 0; }
}
.shimmer {
  background: linear-gradient(90deg, transparent, rgb(139 92 246 / 0.25), transparent);
  background-size: 200% 100%;
  animation: shimmer 1.8s linear infinite;
}
```

### `postcss.config.mjs`
```js
const config = { plugins: { "@tailwindcss/postcss": {} } };

export default config;
```

### Font loading (`src/app/layout.tsx`)
```tsx
import localFont from "next/font/local";
const inter = localFont({ src: "../../assets/fonts/Inter-Medium.otf", variable: "--font-inter", weight: "500" });
const interDisplay = localFont({ src: "../../assets/fonts/InterDisplay-Bold.otf", variable: "--font-inter-display", weight: "700" });
const jetbrains = localFont({ src: "../../assets/fonts/JetBrainsMono-Regular.ttf", variable: "--font-jetbrains", weight: "400" });
```
