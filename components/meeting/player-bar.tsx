"use client";
import { Pause, Play } from "lucide-react";
import type { Meeting } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn, formatMs } from "@/lib/utils";

type Marker = { id: string; atMs: number; label: string; strong: boolean };

export function PlayerBar({
  meeting,
  currentMs,
  playing,
  rate,
  onToggle,
  onSeek,
  onRate,
  onMarker,
  focusId,
}: {
  meeting: Meeting;
  currentMs: number;
  playing: boolean;
  rate: number;
  onToggle: () => void;
  onSeek: (ms: number) => void;
  onRate: (r: number) => void;
  onMarker: (id: string) => void;
  focusId: string | null;
}) {
  const d = meeting.durationMs;
  const pct = (ms: number) => `${(ms / d) * 100}%`;
  const chapter = meeting.chapters.findLast((c) => c.startMs <= currentMs) ?? meeting.chapters[0];
  // Only moments that changed something get a marker: decided values, constraints, assignments.
  const markers: Marker[] = [
    ...meeting.threads.flatMap((t) =>
      t.events
        .filter((e) => e.value != null || e.kind === "challenged" || (t.kind === "constraint" && e.kind === "raised"))
        .map((e) => ({ id: e.id, atMs: e.atMs, label: `${t.title}: ${e.value ?? e.kind}`, strong: e.state === "current" })),
    ),
    ...meeting.actionItems.map((a) => ({ id: a.id, atMs: a.assignedAtMs, label: `Action: ${a.text}`, strong: false })),
  ];

  return (
    <div className="border-b bg-card px-4 pt-3 pb-2">
      <div className="flex items-center gap-3">
        <Button size="icon" onClick={onToggle} aria-label={playing ? "Pause (space)" : "Play (space)"} title="Play/pause (space)">
          {playing ? <Pause /> : <Play />}
        </Button>
        <div className="font-mono text-xs tabular-nums">
          {formatMs(currentMs)} <span className="text-muted-foreground">/ {formatMs(d)}</span>
        </div>
        <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title="Previous/next chapter: j / k">
          {chapter?.title}
        </div>
        <div className="flex rounded-md border text-xs">
          {[1, 1.5, 2].map((r) => (
            <button
              key={r}
              onClick={() => onRate(r)}
              className={cn("px-2 py-1 tabular-nums first:rounded-l-md last:rounded-r-md", rate === r ? "bg-muted font-medium" : "text-muted-foreground")}
            >
              {r}×
            </button>
          ))}
        </div>
        <span className="hidden text-[11px] text-muted-foreground sm:inline" title="Virtual media clock: the flagship meeting has no recording">
          virtual clock
        </span>
      </div>

      <div
        className="relative mt-3 h-6 cursor-pointer select-none"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - r.left) / r.width) * d);
        }}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={d}
        aria-valuenow={Math.round(currentMs)}
        tabIndex={-1}
      >
        <div className="absolute inset-x-0 top-[15px] h-1 rounded-full bg-muted" />
        <div className="absolute left-0 top-[15px] h-1 rounded-full bg-accent/35" style={{ width: pct(currentMs) }} />
        {meeting.chapters.slice(1).map((c) => (
          <div key={c.id} className="absolute top-[12px] h-2.5 w-px bg-border" style={{ left: pct(c.startMs) }} title={c.title} />
        ))}
        {markers.map((m) => (
          <button
            key={m.id}
            title={`${formatMs(m.atMs)} · ${m.label}`}
            onClick={(e) => {
              e.stopPropagation();
              onMarker(m.id);
            }}
            className={cn(
              "absolute top-0 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] border border-card",
              m.strong ? "bg-accent" : "bg-accent/45",
              focusId === m.id && "ring-2 ring-ring",
            )}
            style={{ left: pct(m.atMs) }}
          />
        ))}
        <div className="absolute top-[11px] size-3 -translate-x-1/2 rounded-full border-2 border-card bg-accent shadow" style={{ left: pct(currentMs) }} />
      </div>
    </div>
  );
}
