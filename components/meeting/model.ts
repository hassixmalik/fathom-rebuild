import type { ActionItem, Meeting, Segment, Thread, ThreadEvent } from "@/lib/types";

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

// ---- Viewing as: a deterministic lens over seeded speaker/affected tags. Nothing is hidden. ----

export const eventInvolves = (e: ThreadEvent, pid: string) => e.by === pid || e.affectedParticipantIds.includes(pid);
export const threadInvolves = (t: Thread, pid: string) => t.events.some((e) => eventInvolves(e, pid));
export const actionInvolves = (a: ActionItem, pid: string) => a.ownerId === pid || a.affectedParticipantIds.includes(pid);

export type ForYouItem = { focusId: string; label: string; title: string; detail: string; atMs: number };

export function forYou(meeting: Meeting, pid: string): ForYouItem[] {
  const name = (id: string) => meeting.participants.find((p) => p.id === id)?.name.split(" ")[0] ?? id;
  const owned = meeting.actionItems.filter((a) => a.ownerId === pid);
  const raised = meeting.threads.filter((t) => t.kind !== "decision" && t.events.some((e) => e.by === pid && e.kind === "raised"));
  const affected = meeting.threads.filter((t) => !raised.includes(t) && threadInvolves(t, pid));
  const involved = meeting.actionItems.filter((a) => a.ownerId !== pid && a.affectedParticipantIds.includes(pid));
  return [
    ...owned.map((a) => ({ focusId: a.id, label: "Your action", title: a.text, detail: a.due ? `Due ${a.due}` : "", atMs: a.assignedAtMs })),
    ...raised.map((t) => {
      const mine = t.events.filter((e) => e.by === pid && e.kind === "raised");
      const cut = mine.find((e) => e.interrupted);
      return {
        focusId: mine[0].id,
        label: t.kind === "question" ? "You raised" : "You flagged",
        title: t.title,
        detail: [t.current, cut ? "you were cut off the first time" : "", mine.length > 1 ? `raised ${mine.length}×` : ""].filter(Boolean).join(" · "),
        atMs: mine[0].atMs,
      };
    }),
    ...affected.map((t) => {
      const last = t.events.findLast((e) => eventInvolves(e, pid))!;
      const changed = t.events.some((e) => e.state === "superseded");
      return {
        focusId: last.id,
        label: "Affects you",
        title: t.kind === "decision" ? `${t.title}: ${t.current}` : t.title,
        detail: changed ? "changed during the meeting" : t.kind === "question" ? t.current : "",
        atMs: last.atMs,
      };
    }),
    ...involved.map((a) => ({ focusId: a.id, label: "Involves you", title: a.text, detail: `Owner: ${name(a.ownerId)}`, atMs: a.assignedAtMs })),
  ];
}

// ---- Timeline markers ----

export type MarkerKind = "decision" | "replaced" | "constraint" | "question" | "action";
export type Marker = { id: string; kind: MarkerKind; atMs: number; title: string; text: string; relevant: (pid: string) => boolean };

export const MARKER_LABEL: Record<MarkerKind, string> = {
  decision: "Decision",
  replaced: "Replaced decision",
  constraint: "New constraint",
  question: "Open question",
  action: "Action item",
};

export function markersOf(meeting: Meeting): Marker[] {
  const out: Marker[] = [];
  for (const t of meeting.threads)
    for (const e of t.events) {
      let kind: MarkerKind | null = null;
      if (t.kind === "decision" && e.value != null) kind = e.state === "current" ? "decision" : "replaced";
      else if (t.kind === "constraint" && e.kind === "raised") kind = "constraint";
      else if (t.kind === "question" && e.kind === "raised") kind = "question";
      if (kind) out.push({ id: e.id, kind, atMs: e.atMs, title: e.value ? `${t.title}: ${e.value}` : t.title, text: e.claim, relevant: (p) => eventInvolves(e, p) });
    }
  for (const a of meeting.actionItems) {
    const owner = meeting.participants.find((p) => p.id === a.ownerId)?.name ?? a.ownerId;
    out.push({ id: a.id, kind: "action", atMs: a.assignedAtMs, title: `${owner}: ${a.text}`, text: a.due ? `Due ${a.due}` : "", relevant: (p) => actionInvolves(a, p) });
  }
  return out.sort((x, y) => x.atMs - y.atMs);
}

/**
 * Actions that follow from a decision: those tied to the constraint that challenged it come first
 * (they are the fix), then those tied to the decision itself. The viewer's own action leads.
 */
export function actionsForDecision(meeting: Meeting, t: Thread, viewer: string | null): ActionItem[] {
  const blockers = new Set(t.events.map((e) => e.relatedThreadId).filter((x): x is string => !!x));
  const rank = (a: ActionItem) =>
    (viewer && a.ownerId === viewer ? 0 : 10) + (a.threadIds.some((id) => blockers.has(id)) ? 0 : 1) + (a.threadIds.includes(t.id) ? 0 : 2);
  return meeting.actionItems
    .filter((a) => a.threadIds.includes(t.id) || a.threadIds.some((id) => blockers.has(id)))
    .sort((x, y) => rank(x) - rank(y) || x.assignedAtMs - y.assignedAtMs);
}
