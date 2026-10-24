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
