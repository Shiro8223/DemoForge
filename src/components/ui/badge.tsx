import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full border-2 border-black px-2.5 py-0.5 text-xs font-bold text-black [&_svg]:size-3", {
  variants: {
    variant: {
      default: "bg-white",
      success: "bg-pop-green",
      warning: "bg-pop-yellow",
      danger: "bg-pop-red",
      accent: "bg-pop-purple",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
