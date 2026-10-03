import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium leading-4 whitespace-nowrap", {
  variants: {
    variant: {
      default: "bg-accent text-accent-foreground",
      soft: "bg-accent-soft text-accent",
      muted: "bg-muted text-muted-foreground",
      outline: "border text-muted-foreground",
    },
  },
  defaultVariants: { variant: "muted" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
