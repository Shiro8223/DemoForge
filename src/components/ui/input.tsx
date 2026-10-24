import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-xl border-3 border-black bg-white px-3 text-sm text-fg placeholder:text-muted/70 focus-visible:bg-pop-yellow/20 focus-visible:shadow-brutal-sm focus-visible:outline-none disabled:opacity-50",
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
        "flex w-full rounded-xl border-3 border-black bg-white px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus-visible:bg-pop-yellow/20 focus-visible:shadow-brutal-sm focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}
