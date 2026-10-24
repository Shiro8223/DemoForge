import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-3 border-black text-sm font-bold text-black shadow-brutal-sm brutal-press focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pop-blue disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-pop-pink",
        secondary: "bg-white hover:bg-pop-cyan",
        ghost: "border-transparent shadow-none hover:border-black hover:bg-pop-yellow",
        destructive: "bg-pop-red",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-lg border-2 px-3 text-xs",
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
