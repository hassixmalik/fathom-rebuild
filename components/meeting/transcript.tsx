"use client";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { Meeting } from "@/lib/types";
import { cn, formatMs } from "@/lib/utils";
import { SpeakerDot } from "./speaker-dot";

export type TranscriptHandle = { scrollToSegment: (id: string, smooth?: boolean) => void };

/**
 * Plain DOM list. content-visibility was tried and dropped: its placeholder heights shift during a
 * smooth scroll, so evidence landed in the wrong place. Revisit (virtualize) if a meeting gets far
 * past ~1.5k segments.
 */
export const Transcript = forwardRef<
  TranscriptHandle,
  {
    meeting: Meeting;
    activeIds: Set<string>;
    evidenceIds: Set<string>;
    reasonIds: Set<string>;
    onSeek: (ms: number) => void;
    onUserScroll: () => void;
    viewer: string | null;
  }
>(function Transcript({ meeting, activeIds, evidenceIds, reasonIds, onSeek, onUserScroll, viewer }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const people = useMemo(() => new Map(meeting.participants.map((p) => [p.id, p])), [meeting.participants]);
  const chapterAt = useMemo(() => {
    const m = new Map<string, (typeof meeting.chapters)[number]>();
    for (const c of meeting.chapters) {
      const first = meeting.segments.find((s) => s.startMs >= c.startMs);
      if (first && !m.has(first.id)) m.set(first.id, c);
    }
    return m;
  }, [meeting]);

  useImperativeHandle(ref, () => ({
    scrollToSegment(id, smooth = true) {
      const el = container.current?.querySelector<HTMLElement>(`[data-seg="${id}"]`);
      const box = container.current;
      if (!el || !box) return;
      const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight * 0.3;
      box.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
    },
  }));

  return (
    <div
      ref={container}
      onWheel={onUserScroll}
      onTouchMove={onUserScroll}
      className="absolute inset-0 overflow-y-auto overscroll-contain px-2 py-3"
    >
      {meeting.segments.map((s, i) => {
        const p = people.get(s.participantId)!;
        const prev = meeting.segments[i - 1];
        const chapter = chapterAt.get(s.id);
        const sameSpeaker = !chapter && prev?.participantId === s.participantId && !s.overlap;
        const isEvidence = evidenceIds.has(s.id);
        const isReason = reasonIds.has(s.id);
        return (
          <div key={s.id}>
            {chapter && (
              <div className="mx-2 mt-5 mb-1 flex items-baseline gap-2 border-t pt-3 first:mt-0">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{chapter.title}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{formatMs(chapter.startMs)}</span>
              </div>
            )}
            <div
              data-seg={s.id}
              onClick={() => onSeek(s.startMs)}
              className={cn(
                "group grid cursor-pointer grid-cols-[44px_1fr] gap-x-2 rounded-md border-l-2 border-transparent px-2",
                sameSpeaker ? "py-0.5" : "pt-2 pb-0.5",
                activeIds.has(s.id) && "bg-muted",
                isReason && "border-accent/40 bg-accent-soft/50",
                isEvidence && "border-accent bg-accent-soft",
              )}
            >
              <span className="pt-px font-mono text-[11px] tabular-nums text-muted-foreground group-hover:text-accent">
                {formatMs(s.startMs)}
              </span>
              <div className="min-w-0">
                {!sameSpeaker && (
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <SpeakerDot index={p.colorIndex} />
                    {p.name}
                    {viewer === p.id && <span className="font-normal text-accent">(you)</span>}
                    {s.overlap && <span className="font-normal text-muted-foreground">· talking over</span>}
                  </div>
                )}
                <p className={cn("text-[13.5px] leading-relaxed", !isEvidence && !activeIds.has(s.id) && "text-foreground/85")}>{s.text}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});
