import Link from "next/link";
import { cn } from "@/lib/utils";

/** Delta mark + name; links to the meetings index, carrying the "Viewing as" lens if one is set. */
export function AppLogo({ viewer, className }: { viewer?: string | null; className?: string }) {
  return (
    <Link
      href={indexHref(viewer)}
      aria-label="Delta: all meetings"
      className={cn("flex shrink-0 items-center gap-1.5 rounded-md text-[13px] font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <rect width="18" height="18" rx="5" fill="var(--accent)" />
        <path d="M5 11.5 L8 6.5 L10.5 10 L13 7" fill="none" stroke="var(--accent-foreground)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Delta
    </Link>
  );
}

export const indexHref = (viewer?: string | null) => (viewer ? `/?as=${encodeURIComponent(viewer)}` : "/");
