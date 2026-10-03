"use client";
import { useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Meeting } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn, formatMs } from "@/lib/utils";
import { MARKER_LABEL, markersOf, type Marker, type MarkerKind } from "./model";
import { MarkerShape } from "./marker-shape";

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
  viewer,
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
  viewer: string | null;
}) {
  const d = meeting.durationMs;
  const frac = (ms: number) => ms / d;
  const chapter = meeting.chapters.findLast((c) => c.startMs <= currentMs) ?? meeting.chapters[0];
  const markers = useMemo(() => markersOf(meeting), [meeting]);
  const kinds = useMemo(() => [...new Set(markers.map((m) => m.kind))], [markers]);
  const [hover, setHover] = useState<Marker | null>(null);

  return (
    <div className="border-b bg-card px-4 pt-3 pb-2">
      <div className="flex items-center gap-3">
        <Button size="icon" onClick={onToggle} aria-label={playing ? "Pause" : "Play"} title="Play/pause (space)">
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
        <span className="hidden text-[11px] text-muted-foreground sm:inline" title="Virtual media clock: this meeting has no recording">
          virtual clock
        </span>
      </div>

      <div
        className="relative mt-3 h-7 cursor-pointer select-none"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - r.left) / r.width) * d);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <div className="absolute inset-x-0 top-[19px] h-1 rounded-full bg-muted" />
        <div className="absolute left-0 top-[19px] h-1 rounded-full bg-accent/35" style={{ width: `${frac(currentMs) * 100}%` }} />
        {meeting.chapters.slice(1).map((c) => (
          <div key={c.id} className="absolute top-[16px] h-2.5 w-px bg-border" style={{ left: `${frac(c.startMs) * 100}%` }} />
        ))}
        {markers.map((m) => {
          const dim = viewer != null && !m.relevant(viewer);
          return (
            <button
              key={m.id}
              aria-label={`${MARKER_LABEL[m.kind]} at ${formatMs(m.atMs)}: ${m.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onMarker(m.id);
              }}
              onMouseEnter={() => setHover(m)}
              onFocus={() => setHover(m)}
              onBlur={() => setHover(null)}
              className={cn(
                "absolute top-0 -translate-x-1/2 rounded-sm p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                focusId === m.id && "ring-2 ring-ring",
                dim && "opacity-40",
              )}
              style={{ left: `${frac(m.atMs) * 100}%` }}
            >
              <MarkerShape kind={m.kind} />
            </button>
          );
        })}
        <div
          className="pointer-events-none absolute top-[15px] size-3 -translate-x-1/2 rounded-full border-2 border-card bg-accent shadow"
          style={{ left: `${frac(currentMs) * 100}%` }}
        />
        {hover && <MarkerTooltip marker={hover} frac={frac(hover.atMs)} />}
      </div>

      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground" aria-label="Marker legend">
        {kinds.map((k) => (
          <li key={k} className="flex items-center gap-1">
            <MarkerShape kind={k as MarkerKind} size={10} /> {MARKER_LABEL[k as MarkerKind]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MarkerTooltip({ marker: m, frac }: { marker: Marker; frac: number }) {
  // Anchor to the marker but keep the card inside the track near either edge.
  const align = frac < 0.2 ? "left" : frac > 0.8 ? "right" : "center";
  return (
    <div
      role="tooltip"
      className={cn(
        "pointer-events-none absolute top-full z-20 mt-1 w-72 rounded-md border bg-card px-3 py-2 text-xs shadow-md",
        align === "center" && "-translate-x-1/2",
        align === "right" && "-translate-x-full",
      )}
      style={{ left: `${frac * 100}%` }}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <MarkerShape kind={m.kind} size={10} />
        {MARKER_LABEL[m.kind]} · <span className="font-mono tabular-nums">{formatMs(m.atMs)}</span>
      </div>
      <div className="mt-0.5 font-medium leading-snug">{m.title}</div>
      {m.text && <div className="mt-0.5 leading-snug text-muted-foreground">{m.text}</div>}
    </div>
  );
}
