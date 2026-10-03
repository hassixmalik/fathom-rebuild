import { cn } from "@/lib/utils";

export function SpeakerDot({ index, className }: { index: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 shrink-0 rounded-full", className)}
      style={{ background: `var(--speaker-${index % 8})` }}
    />
  );
}
