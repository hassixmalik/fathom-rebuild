"use client";
import { useMemo, useState, type RefObject } from "react";
import { AudioLines, Pause, Play, Video } from "lucide-react";
import type { Meeting, Segment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn, formatMs } from "@/lib/utils";
import { MARKER_LABEL, markersOf, type Marker, type MarkerKind } from "./model";
import { MarkerShape } from "./marker-shape";
import { segmentIndexAt } from "./model";

/**
 * Top of the proof pane. A real recording shows as video; otherwise the card is honest about
 * being audio-only and shows who is speaking, derived from transcript segments on the clock.
 */
export function MediaCard({
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
  mediaRef,
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
  mediaRef: RefObject<HTMLVideoElement | null>;
}) {
  const d = meeting.durationMs;
  const frac = (ms: number) => ms / d;
  const chapter = meeting.chapters.findLast((c) => c.startMs <= currentMs) ?? meeting.chapters[0];
  const markers = useMemo(() => markersOf(meeting), [meeting]);
  const kinds = useMemo(() => [...new Set(markers.map((m) => m.kind))], [markers]);
  const [hover, setHover] = useState<Marker | null>(null);

  return (
    <div className="border-b bg-background p-3">
      <div className="rounded-lg border bg-card px-3 pt-2.5 pb-2 shadow-xs">
      <div className="flex items-center gap-3">
        <Button size="icon" onClick={onToggle} aria-label={playing ? "Pause" : "Play"} title="Play/pause (space)">
          {playing ? <Pause /> : <Play />}
        </Button>
        <div className="font-mono text-xs whitespace-nowrap tabular-nums">
          {formatMs(currentMs)} <span className="hidden text-muted-foreground sm:inline">/ {formatMs(d)}</span>
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
        {meeting.mediaUrl ? (
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
            <Video className="size-3.5" /> Video
          </span>
        ) : (
          <span
            className="flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground"
            title="No recording for this meeting: playback runs on a virtual clock and speakers are derived from the transcript"
          >
            <AudioLines className="size-3.5" /> Audio only
          </span>
        )}
      </div>

      {meeting.mediaUrl ? (
        <video
          ref={mediaRef}
          src={meeting.mediaUrl}
          preload="metadata"
          playsInline
          className="mt-2.5 max-h-[32dvh] w-full rounded-md bg-black object-contain"
        />
      ) : (
        <>
          <SpeakerTiles meeting={meeting} currentMs={currentMs} viewer={viewer} />
          <ActivityStrip meeting={meeting} onSeek={onSeek} />
        </>
      )}

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
    </div>
  );
}

/** Segments being spoken at t (several during cross-talk). Silence = none. */
function speakingAt(segments: Segment[], t: number) {
  const ids = new Set<string>();
  for (let i = segmentIndexAt(segments, t); i >= 0 && i >= segmentIndexAt(segments, t) - 8; i--)
    if (segments[i].startMs <= t && t < segments[i].endMs) ids.add(segments[i].participantId);
  return ids;
}

function SpeakerTiles({ meeting, currentMs, viewer }: { meeting: Meeting; currentMs: number; viewer: string | null }) {
  const speaking = speakingAt(meeting.segments, currentMs);
  return (
    <ul className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]" aria-label="Participants (lit while speaking)">
      {meeting.participants.map((p) => {
        const on = speaking.has(p.id);
        const color = `var(--speaker-${p.colorIndex % 8})`;
        const initials = p.name.split(" ").map((w) => w[0]).join("").slice(0, 2);
        return (
          <li
            key={p.id}
            aria-label={`${p.name}${on ? ", speaking" : ""}${viewer === p.id ? " (you)" : ""}`}
            className="relative flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-md border px-1.5 py-1.5 transition-colors duration-200 sm:min-w-0"
            style={on ? { borderColor: color, background: `color-mix(in oklch, ${color} 12%, var(--card))` } : undefined}
          >
            <span
              className="grid size-7 place-items-center rounded-full text-[11px] font-semibold transition-shadow duration-200"
              style={{
                color,
                background: `color-mix(in oklch, ${color} 16%, var(--card))`,
                boxShadow: on ? `0 0 0 2px var(--card), 0 0 0 4px ${color}` : undefined,
              }}
            >
              {initials}
            </span>
            <span className={cn("max-w-full truncate text-[11px] leading-none", on ? "font-medium text-foreground" : "text-muted-foreground")}>
              {p.name.split(" ")[0]}
            </span>
            {viewer === p.id && (
              <span className="absolute top-0.5 right-0.5 rounded bg-accent px-1 text-[9px] leading-[13px] font-medium text-accent-foreground">you</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Talking vs silence across the meeting; darker where people talk over each other. */
function ActivityStrip({ meeting, onSeek }: { meeting: Meeting; onSeek: (ms: number) => void }) {
  const N = 300;
  const buckets = useMemo(() => {
    const size = meeting.durationMs / N;
    const cover = new Float32Array(N);
    const overlap = new Uint8Array(N);
    const count = new Uint8Array(N);
    for (const s of meeting.segments) {
      const a = Math.floor(s.startMs / size), b = Math.min(N - 1, Math.floor((s.endMs - 1) / size));
      for (let i = a; i <= b; i++) {
        const lo = Math.max(s.startMs, i * size), hi = Math.min(s.endMs, (i + 1) * size);
        cover[i] = Math.min(1, cover[i] + (hi - lo) / size);
        if (++count[i] > 1 && s.overlap) overlap[i] = 1;
      }
    }
    return Array.from(cover, (c, i) => ({ c, x: overlap[i] === 1 }));
  }, [meeting]);
  return (
    <svg
      viewBox={`0 0 ${N} 10`}
      preserveAspectRatio="none"
      className="mt-2 block h-2.5 w-full cursor-pointer"
      role="img"
      aria-label="Speech activity over the meeting"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - r.left) / r.width) * meeting.durationMs);
      }}
    >
      <rect x="0" y="9.4" width={N} height="0.6" fill="var(--border)" />
      {buckets.map((b, i) =>
        b.c > 0 ? (
          <rect
            key={i}
            x={i}
            width="1"
            y={10 - (2 + 8 * b.c)}
            height={2 + 8 * b.c}
            fill="var(--muted-foreground)"
            opacity={b.x ? 0.6 : 0.25}
          />
        ) : null,
      )}
    </svg>
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
