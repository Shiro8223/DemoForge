# DemoForge — Superdesign init

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 (CSS-first `@theme` in globals.css, no tailwind.config) via `@tailwindcss/postcss` · shadcn-style primitives built with class-variance-authority + clsx + tailwind-merge (`cn`) · `@radix-ui/react-slot` · lucide-react icons · local fonts (Inter Medium, Inter Display Bold, JetBrains Mono). Dark-only UI.

# Shared UI components (`src/components/ui/`)

## cn (utility)
- Path: `src/lib/utils.ts`
- className merger used by every primitive.

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## Button
- Path: `src/components/ui/button.tsx`
- Gradient primary / secondary / ghost / destructive button; supports asChild.
- Key props: variant (default|secondary|ghost|destructive), size (default|sm|lg|icon), asChild

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_0_0_1px_rgb(255_255_255/0.08)_inset,0_8px_24px_-8px_rgb(139_92_246/0.6)] hover:brightness-110",
        secondary: "border border-line bg-panel-2 text-fg hover:bg-[#1b1f2c]",
        ghost: "text-muted hover:bg-panel-2 hover:text-fg",
        destructive: "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
```

## Card, CardHeader, CardTitle, CardDescription, CardContent
- Path: `src/components/ui/card.tsx`
- Rounded-2xl translucent panel with blur.

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-panel/80 backdrop-blur", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-base font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
```

## Badge
- Path: `src/components/ui/badge.tsx`
- Pill status label.
- Key props: variant (default|success|warning|danger|accent)

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3", {
  variants: {
    variant: {
      default: "border-line bg-panel-2 text-muted",
      success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      danger: "border-red-500/30 bg-red-500/10 text-red-300",
      accent: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

## Input, Textarea
- Path: `src/components/ui/input.tsx`
- Dark rounded-xl form fields with accent focus ring.

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg placeholder:text-muted/70 focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
        className,
      )}
      {...props}
    />
  );
}
```

## StatusDot
- Path: `src/components/generation/status-dot.tsx`
- Job/stage status indicator dot, reused by landing and job views.
- Key props: status

```tsx
import { Check, Loader2, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobStatus, StageStatus } from "@/types";

export function StatusDot({ status, className }: { status: StageStatus | JobStatus; className?: string }) {
  const base = "grid size-6 shrink-0 place-items-center rounded-full border [&_svg]:size-3.5";
  switch (status) {
    case "completed":
      return <span className={cn(base, "border-emerald-500/40 bg-emerald-500/15 text-emerald-300", className)}><Check /></span>;
    case "running":
      return <span className={cn(base, "border-violet-500/50 bg-violet-500/15 text-violet-300", className)}><Loader2 className="animate-spin" /></span>;
    case "failed":
      return <span className={cn(base, "border-red-500/40 bg-red-500/15 text-red-300", className)}><X /></span>;
    case "skipped":
      return <span className={cn(base, "border-amber-500/30 bg-amber-500/10 text-amber-300", className)}><Minus /></span>;
    default:
      return <span className={cn(base, "border-line bg-panel-2", className)}><span className="size-1.5 rounded-full bg-muted/50" /></span>;
  }
}
```
