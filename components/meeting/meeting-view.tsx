"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Meeting } from "@/lib/types";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { cn, formatMs } from "@/lib/utils";
import { formatDate, formatDuration } from "@/lib/format";
import { CatchUp } from "./catch-up";
import { focusForId, segmentIndexAt, type Focus } from "./model";
import { OutcomesPanel } from "./outcomes-panel";
import { MediaCard } from "./media-card";
import { SpeakerDot } from "./speaker-dot";
import { Transcript, type TranscriptHandle } from "./transcript";
import { useVirtualClock } from "./use-virtual-clock";

export function MeetingView({
  meeting,
  initialMs,
  initialFocusId,
  initialViewer,
  initialView,
}: {
  meeting: Meeting;
  initialMs: number | null;
  initialFocusId: string | null;
  initialViewer: string | null;
  initialView: "catchup" | "full";
}) {
  const [view, setViewState] = useState(initialView);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const initialFocus = useMemo(() => focusForId(meeting, initialFocusId), [meeting, initialFocusId]);
  const mediaRef = useRef<HTMLVideoElement>(null);
  const clock = useVirtualClock(meeting.durationMs, initialFocus?.atMs ?? initialMs ?? 0, meeting.mediaUrl ? mediaRef : undefined);
  const [focus, setFocus] = useState<Focus | null>(initialFocus);
  const [follow, setFollow] = useState(true);
  const [viewer, setViewerState] = useState<string | null>(
    initialViewer && meeting.participants.some((p) => p.id === initialViewer) ? initialViewer : null,
  );
  const transcript = useRef<TranscriptHandle>(null);
  const proofPane = useRef<HTMLElement>(null);

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

  const setView = useCallback((v: "catchup" | "full") => {
    setViewState(v);
    const u = new URL(window.location.href);
    if (v === "catchup") u.searchParams.set("view", "catchup");
    else u.searchParams.delete("view");
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
      // Single-column layout: bring the proof (player + transcript) into view.
      if (window.matchMedia("(max-width: 1023px)").matches) proofPane.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // "See the moment" from catch-up: switch views, then focus once the transcript is mounted.
  useEffect(() => {
    if (view === "full" && pendingFocus) {
      const id = pendingFocus;
      setPendingFocus(null);
      requestAnimationFrame(() => onFocus(id));
    }
  }, [view, pendingFocus, onFocus]);

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
    if (view !== "full") return;
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
  }, [clock, meeting.chapters, seekFree, view]);

  const evidenceIds = useMemo(() => new Set(focus?.evidence ?? []), [focus]);
  const reasonIds = useMemo(() => new Set(focus?.reason ?? []), [focus]);

  return (
    <div className="flex flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-card px-4 py-2.5">
        <AppLogo viewer={viewer} className="self-start pt-0.5 sm:border-r sm:pr-4" />
        <div className="min-w-0">
          <Link
            href={viewer ? `/?as=${encodeURIComponent(viewer)}` : "/"}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Meetings
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="truncate text-[15px] font-semibold">{meeting.title}</h1>
            <div className="flex rounded-md border p-0.5 text-xs" role="tablist" aria-label="View">
              {(["catchup", "full"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn("rounded px-2 py-0.5 transition-colors", view === v ? "bg-accent-soft font-medium text-accent" : "text-muted-foreground hover:text-foreground")}
                >
                  {v === "catchup" ? "Catch-up" : "Full meeting"}
                </button>
              ))}
            </div>
          </div>
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

      {view === "catchup" ? (
        <CatchUp
          meeting={meeting}
          viewer={viewer}
          onSeeMoment={(id) => {
            setPendingFocus(id);
            setView("full");
          }}
        />
      ) : (
      <>
      {/* Desktop: two independently scrolling panes. Mobile: one page scroll, outcomes first, proof pane below at full height. */}
      <div className="grid grid-cols-[minmax(0,1fr)] lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(380px,460px)_minmax(0,1fr)]">
        <aside className="border-b bg-background lg:overflow-y-auto lg:border-r lg:border-b-0" aria-label="Outcomes">
          <OutcomesPanel meeting={meeting} focusId={focus?.id ?? null} onFocus={onFocus} viewer={viewer} />
        </aside>
        <section ref={proofPane} className="flex h-dvh min-h-0 scroll-mt-0 flex-col lg:h-auto" aria-label="Recording and transcript">
          <MediaCard
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
            mediaRef={mediaRef}
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
      </>
      )}
    </div>
  );
}
