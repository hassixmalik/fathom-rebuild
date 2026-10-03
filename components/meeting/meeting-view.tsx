"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Meeting } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { formatMs } from "@/lib/utils";
import { formatDate, formatDuration } from "@/lib/format";
import { focusForId, segmentIndexAt, type Focus } from "./model";
import { OutcomesPanel } from "./outcomes-panel";
import { PlayerBar } from "./player-bar";
import { SpeakerDot } from "./speaker-dot";
import { Transcript, type TranscriptHandle } from "./transcript";
import { useVirtualClock } from "./use-virtual-clock";

export function MeetingView({
  meeting,
  initialMs,
  initialFocusId,
  initialViewer,
}: {
  meeting: Meeting;
  initialMs: number | null;
  initialFocusId: string | null;
  initialViewer: string | null;
}) {
  const initialFocus = useMemo(() => focusForId(meeting, initialFocusId), [meeting, initialFocusId]);
  const clock = useVirtualClock(meeting.durationMs, initialFocus?.atMs ?? initialMs ?? 0);
  const [focus, setFocus] = useState<Focus | null>(initialFocus);
  const [follow, setFollow] = useState(true);
  const [viewer, setViewerState] = useState<string | null>(
    initialViewer && meeting.participants.some((p) => p.id === initialViewer) ? initialViewer : null,
  );
  const transcript = useRef<TranscriptHandle>(null);

  const { segments } = meeting;
  const activeIdx = segmentIndexAt(segments, clock.currentMs);
  const activeIds = useMemo(() => {
    const ids = new Set<string>();
    // The latest-started segment plus anything still being spoken over it (cross-talk).
    for (let i = activeIdx; i >= 0 && i >= activeIdx - 4; i--)
      if (i === activeIdx || segments[i].endMs > clock.currentMs) ids.add(segments[i].id);
    return ids;
  }, [activeIdx, segments, clock.currentMs]);
  const activeId = activeIdx >= 0 ? segments[activeIdx].id : null;

  const setViewer = useCallback((v: string | null) => {
    setViewerState(v);
    const u = new URL(window.location.href);
    if (v) u.searchParams.set("as", v);
    else u.searchParams.delete("as");
    window.history.replaceState(null, "", u);
  }, []);

  const syncUrl = useCallback((f: Focus | null, ms: number) => {
    const u = new URL(window.location.href);
    u.searchParams.delete("e");
    u.searchParams.delete("t");
    if (f) u.searchParams.set("e", f.id);
    else u.searchParams.set("t", formatMs(ms));
    window.history.replaceState(null, "", u);
  }, []);

  const jumpTo = useCallback(
    (f: Focus, part?: "reason") => {
      const ids = part === "reason" && f.reason.length ? f.reason : f.evidence;
      const start = segments.find((s) => s.id === ids[0])?.startMs ?? f.atMs;
      setFocus(f);
      setFollow(true);
      clock.seek(start);
      if (ids[0]) transcript.current?.scrollToSegment(ids[0]);
      syncUrl(f, start);
    },
    [clock, segments, syncUrl],
  );

  const onFocus = useCallback(
    (id: string, part?: "reason") => {
      const f = focusForId(meeting, id);
      if (f) jumpTo(f, part);
    },
    [meeting, jumpTo],
  );

  const seekFree = useCallback(
    (ms: number) => {
      setFocus(null);
      setFollow(true);
      clock.seek(ms);
      transcript.current?.scrollToSegment(segments[Math.max(0, segmentIndexAt(segments, ms))].id);
      syncUrl(null, ms);
    },
    [clock, segments, syncUrl],
  );

  // Initial deep link (?e= or ?t=): land on the moment without animation.
  useEffect(() => {
    const target = initialFocus?.evidence[0] ?? (initialMs != null ? segments[Math.max(0, segmentIndexAt(segments, initialMs))].id : null);
    if (target) requestAnimationFrame(() => transcript.current?.scrollToSegment(target, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow playback.
  useEffect(() => {
    if (clock.playing && follow && activeId) transcript.current?.scrollToSegment(activeId);
  }, [activeId, clock.playing, follow]);

  // Keyboard: space play/pause, j/k previous/next chapter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        clock.toggle();
      } else if (e.key === "j" || e.key === "k") {
        const cur = meeting.chapters.findLastIndex((c) => c.startMs <= clock.currentMs + 500);
        const next = meeting.chapters[e.key === "k" ? cur + 1 : Math.max(0, clock.currentMs - meeting.chapters[cur].startMs > 3000 ? cur : cur - 1)];
        if (next) seekFree(next.startMs);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clock, meeting.chapters, seekFree]);

  const evidenceIds = useMemo(() => new Set(focus?.evidence ?? []), [focus]);
  const reasonIds = useMemo(() => new Set(focus?.reason ?? []), [focus]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-card px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold">{meeting.title}</h1>
          <p className="text-xs text-muted-foreground">
            {meeting.company} · {meeting.platform} ·{" "}
            {formatDate(meeting.startedAt)} · {formatDuration(meeting.durationMs)}
          </p>
        </div>
        <ul className="ml-auto hidden flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground xl:flex" aria-label="Participants">
          {meeting.participants.map((p) => (
            <li key={p.id} className="flex items-center gap-1" title={`${p.name}, ${p.role}${p.quiet ? " (spoke little)" : ""}`}>
              <SpeakerDot index={p.colorIndex} /> {p.name.split(" ")[0]}
            </li>
          ))}
        </ul>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground xl:ml-0">
          Viewing as
          <select
            value={viewer ?? ""}
            onChange={(e) => setViewer(e.target.value || null)}
            className="h-8 rounded-md border bg-card px-2 text-[13px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Everyone</option>
            {meeting.participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.role}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] lg:grid-cols-[minmax(380px,460px)_1fr] lg:grid-rows-1">
        <aside className="max-h-[55dvh] overflow-y-auto border-b bg-background lg:max-h-none lg:border-r lg:border-b-0" aria-label="Outcomes">
          <OutcomesPanel meeting={meeting} focusId={focus?.id ?? null} onFocus={onFocus} viewer={viewer} />
        </aside>
        <section className="flex min-h-0 flex-col" aria-label="Recording and transcript">
          <PlayerBar
            meeting={meeting}
            currentMs={clock.currentMs}
            playing={clock.playing}
            rate={clock.rate}
            onToggle={clock.toggle}
            onSeek={seekFree}
            onRate={clock.setRate}
            onMarker={onFocus}
            focusId={focus?.id ?? null}
            viewer={viewer}
          />
          <div className="relative min-h-0 flex-1">
            <Transcript
              ref={transcript}
              meeting={meeting}
              activeIds={activeIds}
              evidenceIds={evidenceIds}
              reasonIds={reasonIds}
              onSeek={seekFree}
              onUserScroll={() => setFollow(false)}
              viewer={viewer}
            />
            {!follow && clock.playing && (
              <Button variant="outline" size="sm" className="absolute right-4 bottom-4 shadow-sm" onClick={() => setFollow(true)}>
                Follow playback
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
