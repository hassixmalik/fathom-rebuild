import { formatMs, cn } from "@/lib/utils";

/** A timestamp that jumps to evidence. The primary affordance linking generated content to the transcript. */
export function TimeChip({ ms, active, onClick, className }: { ms: number; active?: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "rounded px-1 font-mono text-[11px] tabular-nums leading-5 text-accent outline-none hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-accent text-accent-foreground hover:bg-accent",
        className,
      )}
      title="Jump to this moment"
    >
      {formatMs(ms)}
    </button>
  );
}
