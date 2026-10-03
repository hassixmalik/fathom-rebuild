import type { Meeting, Segment, Thread } from "@/lib/types";

/** Index of the last segment that started at or before t (segments sorted by start). */
export function segmentIndexAt(segments: Segment[], t: number) {
  let lo = 0, hi = segments.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].startMs <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export type Focus = { id: string; evidence: string[]; reason: string[]; atMs: number };

export function focusForId(meeting: Meeting, id: string | null): Focus | null {
  if (!id) return null;
  for (const t of meeting.threads)
    for (const e of t.events)
      if (e.id === id) return { id, evidence: e.evidenceSegmentIds, reason: e.reasonSegmentIds, atMs: startOf(meeting, e.evidenceSegmentIds, e.atMs) };
  const a = meeting.actionItems.find((x) => x.id === id);
  return a ? { id, evidence: a.evidenceSegmentIds, reason: [], atMs: startOf(meeting, a.evidenceSegmentIds, a.assignedAtMs) } : null;
}

function startOf(meeting: Meeting, ids: string[], fallback: number) {
  const first = meeting.segments.find((s) => s.id === ids[0]);
  return first ? first.startMs : fallback;
}

export const KIND_LABEL: Record<string, string> = {
  proposed: "Proposed",
  agreed: "Agreed",
  challenged: "Challenged",
  changed: "Changed",
  raised: "Raised",
  detailed: "Detailed",
  deferred: "Deferred",
};

export function threadsOf(meeting: Meeting, kind: Thread["kind"]) {
  return meeting.threads.filter((t) => t.kind === kind);
}
