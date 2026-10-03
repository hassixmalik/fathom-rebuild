"use client";
import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMs } from "@/lib/utils";

/** Absolute URL for a moment; keeps the current "Viewing as" so the recipient sees the same lens. */
export function momentUrl(target: { e?: string; ms?: number }) {
  const u = new URL(window.location.href);
  for (const k of ["e", "t", "view"]) u.searchParams.delete(k);
  if (target.e) u.searchParams.set("e", target.e);
  else if (target.ms != null) u.searchParams.set("t", formatMs(target.ms));
  return u.toString();
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API unavailable (insecure context / denied): fall back to a hidden textarea.
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export function CopyMoment({ target, className, label = "Copy link to this moment" }: { target: { e?: string; ms?: number }; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={done ? "Copied" : label}
      onClick={async (ev) => {
        ev.stopPropagation();
        await copy(momentUrl(target));
        setDone(true);
        window.setTimeout(() => setDone(false), 1500);
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1 text-[11px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        done && "text-accent",
        className,
      )}
    >
      {done ? <Check className="size-3" /> : <Link2 className="size-3" />}
      {done && "Copied"}
    </button>
  );
}
