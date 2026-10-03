"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CornerDownRight } from "lucide-react";
import type { ActionItem, Meeting, MeetingLink, Participant, Segment, Thread, ThreadEvent } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn, formatMs } from "@/lib/utils";
import { CopyMoment } from "./copy-moment";
import { KIND_LABEL, actionInvolves, actionsForDecision, eventInvolves, forYou, threadInvolves, threadsOf } from "./model";
import { SpeakerDot } from "./speaker-dot";
import { TimeChip } from "./time-chip";

type Ctx = {
  people: Map<string, Participant>;
  segs: Map<string, Segment>;
  threads: Map<string, Thread>;
  meeting: Meeting;
  focusId: string | null;
  onFocus: (id: string, part?: "reason") => void;
  /** "Viewing as" participant; null = everyone. Only emphasises, never hides. */
  viewer: string | null;
};

export function OutcomesPanel({
  meeting,
  focusId,
  onFocus,
  viewer,
}: {
  meeting: Meeting;
  focusId: string | null;
  onFocus: Ctx["onFocus"];
  viewer: string | null;
}) {
  const ctx: Ctx = {
    people: new Map(meeting.participants.map((p) => [p.id, p])),
    segs: new Map(meeting.segments.map((s) => [s.id, s])),
    threads: new Map(meeting.threads.map((t) => [t.id, t])),
    meeting,
    focusId,
    onFocus,
    viewer,
  };
  const decisions = threadsOf(meeting, "decision");
  // Decisions that changed during the meeting lead; the path to their final state is the point.
  decisions.sort((a, b) => Number(hasHistory(b)) - Number(hasHistory(a)));
  return (
    <div className="px-4 py-5">
      <h1 className="mb-3 text-[15px] font-semibold">What changed?</h1>
      <div className="space-y-7">
      {viewer && <ForYou meeting={meeting} ctx={ctx} />}
      <Section title="Decisions" count={decisions.length}>
        {decisions.map((t) => (hasHistory(t) ? <EvolvedDecision key={t.id} thread={t} ctx={ctx} /> : <StableDecision key={t.id} thread={t} ctx={ctx} />))}
      </Section>
      <Section title="New constraints" count={threadsOf(meeting, "constraint").length}>
        {threadsOf(meeting, "constraint").map((t) => (
          <ThreadCard key={t.id} thread={t} ctx={ctx} status={<Badge variant="outline">{t.current}</Badge>} />
        ))}
      </Section>
      <Section title="Open questions" count={threadsOf(meeting, "question").length}>
        {threadsOf(meeting, "question").map((t) => (
          <ThreadCard key={t.id} thread={t} ctx={ctx} status={<Badge variant="outline">Unresolved</Badge>} />
        ))}
      </Section>
      <Section title="Action items" count={meeting.actionItems.length}>
        <ActionItems items={meeting.actionItems} ctx={ctx} />
      </Section>
      </div>
    </div>
  );
}

const hasHistory = (t: Thread) => t.events.some((e) => e.state === "superseded");
const DIM = "opacity-55 transition-opacity hover:opacity-100 focus-within:opacity-100";
const dimThread = (t: Thread, ctx: Ctx) => (ctx.viewer && !threadInvolves(t, ctx.viewer) ? DIM : "");

function ForYou({ meeting, ctx }: { meeting: Meeting; ctx: Ctx }) {
  const p = ctx.people.get(ctx.viewer!)!;
  const items = forYou(meeting, p.id);
  return (
    <section className="rounded-md border border-accent/30 bg-accent-soft/60 p-3.5" aria-label={`Relevant to ${p.name}`}>
      <h2 className="flex items-center gap-1.5 text-xs font-semibold">
        <SpeakerDot index={p.colorIndex} /> For {p.name.split(" ")[0]}
        <span className="font-normal text-muted-foreground">· {items.length} of {meeting.threads.length + meeting.actionItems.length} items involve you</span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">Nothing in this meeting was assigned to, raised by, or affects {p.name.split(" ")[0]}.</p>
      ) : (
        <ul className="mt-1.5 space-y-0.5">
          {items.map((it) => (
            <li key={`${it.label}-${it.focusId}`}>
              <button
                type="button"
                onClick={() => ctx.onFocus(it.focusId)}
                className={cn("-mx-1.5 flex w-[calc(100%+12px)] items-baseline gap-2 rounded-md px-1.5 py-1 text-left hover:bg-card", ctx.focusId === it.focusId && "bg-card")}
              >
                <span className="w-[86px] shrink-0 text-[11px] font-medium text-accent">{it.label}</span>
                <span className="min-w-0 flex-1 text-[13px] leading-snug">
                  {it.title}
                  {it.detail && <span className="text-xs text-muted-foreground"> · {it.detail}</span>}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-accent">{formatMs(it.atMs)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Everything else stays below, dimmed, not hidden.</p>
    </section>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title} <span className="font-normal">{count}</span>
      </h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function EvolvedDecision({ thread, ctx }: { thread: Thread; ctx: Ctx }) {
  const current = thread.events.findLast((e) => e.state === "current")!;
  return (
    <article className={cn("rounded-md border bg-card p-3.5 shadow-xs", dimThread(thread, ctx))}>
      <div className="text-xs text-muted-foreground">{thread.title}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <span className="text-xl font-semibold tracking-tight">{thread.current}</span>
        <Badge variant="soft">Current</Badge>
        <span className="text-xs text-muted-foreground">
          changed at <TimeChip ms={current.atMs} active={ctx.focusId === current.id} onClick={() => ctx.onFocus(current.id)} />
        </span>
      </div>
      <EvolutionChain thread={thread} ctx={ctx} />
      <h3 className="mt-3 mb-1 text-[11px] font-medium text-muted-foreground">How it got here</h3>
      <EventPath thread={thread} ctx={ctx} />
      <MeetingLinks links={thread.links} viewer={ctx.viewer} />
    </article>
  );
}

/** One-line path: each earlier position, what challenged it, and the current state, all jumpable. */
function EvolutionChain({ thread, ctx }: { thread: Thread; ctx: Ctx }) {
  // A proposal is only shown when it is the sole earlier position (otherwise the agreement replaces it).
  const settled = thread.events.some((e) => e.state === "superseded" && e.kind !== "proposed");
  const steps = thread.events.filter((e) => (e.value != null && (e.kind !== "proposed" || !settled)) || e.kind === "challenged");
  return (
    <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs" aria-label={`${thread.title} history`}>
      {steps.map((e, i) => {
        const related = e.relatedThreadId ? ctx.threads.get(e.relatedThreadId) : null;
        const label = e.value ?? (related?.kind === "constraint" ? "Blocker" : KIND_LABEL[e.kind]);
        return (
          <li key={e.id} className="flex items-center gap-1">
            {i > 0 && <ArrowRight aria-hidden className="size-3 text-muted-foreground" />}
            <button
              type="button"
              onClick={() => ctx.onFocus(e.id)}
              className={cn(
                "flex items-center gap-1 rounded-md border px-1.5 py-0.5 hover:bg-muted",
                e.state === "current" && "border-accent/40 bg-accent-soft font-medium text-accent hover:bg-accent-soft",
                ctx.focusId === e.id && "ring-2 ring-ring",
              )}
              title={e.claim}
            >
              <span className={cn(e.state === "superseded" && "text-muted-foreground line-through decoration-muted-foreground/60")}>{label}</span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{formatMs(e.atMs)}</span>
            </button>
          </li>
        );
      })}
      <OwnerStep thread={thread} ctx={ctx} />
    </ol>
  );
}

/** Last chain step: who now owns the follow-through (actions tied to the blocker first), "+N" for the rest. */
function OwnerStep({ thread, ctx }: { thread: Thread; ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const actions = actionsForDecision(ctx.meeting, thread, ctx.viewer);
  if (!actions.length) return null;
  const [first, ...rest] = actions;
  const chip = (a: ActionItem) => {
    const p = ctx.people.get(a.ownerId)!;
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => ctx.onFocus(a.id)}
        className={cn("flex items-center gap-1 rounded-md border px-1.5 py-0.5 hover:bg-muted", ctx.focusId === a.id && "ring-2 ring-ring")}
        title={`${p.name}: ${a.text}${a.due ? ` (due ${a.due})` : ""}`}
      >
        <SpeakerDot index={p.colorIndex} />
        <span className="font-medium">{p.name.split(" ")[0]}</span>
        <span className="text-muted-foreground">{a.short}</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{formatMs(a.assignedAtMs)}</span>
      </button>
    );
  };
  return (
    <>
      <li className="flex items-center gap-1">
        <ArrowRight aria-hidden className="size-3 text-muted-foreground" />
        {chip(first)}
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={rest.map((a) => `${ctx.people.get(a.ownerId)!.name.split(" ")[0]}: ${a.short}`).join(", ")}
          >
            {open ? "less" : `+${rest.length}`}
          </button>
        )}
      </li>
      {open && <li className="flex basis-full flex-wrap gap-1 pl-4">{rest.map(chip)}</li>}
    </>
  );
}

/** "Answered later in …" / "Follows up …": hand-authored seed links between meetings, never inferred. */
function MeetingLinks({ links, viewer }: { links: MeetingLink[]; viewer: string | null }) {
  if (!links.length) return null;
  const label = (l: MeetingLink) =>
    l.direction === "later"
      ? { answers: "Answered later in", picks_up: "Picked up later in", changes: "Changed later in" }[l.relation]
      : { answers: "Answers a question from", picks_up: "Follows up", changes: "Changes a decision from" }[l.relation];
  return (
    <div className="mt-2 space-y-0.5">
      {links.map((l) => (
        <Link
          key={`${l.direction}-${l.meetingId}-${l.focusId}`}
          href={`/m/${l.meetingId}?e=${l.focusId}${viewer ? `&as=${viewer}` : ""}`}
          className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          {label(l)} {l.meetingTitle} <ArrowRight className="size-3" />
        </Link>
      ))}
    </div>
  );
}

function StableDecision({ thread, ctx }: { thread: Thread; ctx: Ctx }) {
  const e = thread.events[thread.events.length - 1];
  return (
    <article
      className={cn("cursor-pointer rounded-md border bg-card px-3.5 py-2.5 hover:bg-muted/50", ctx.focusId === e.id && "border-accent/50", dimThread(thread, ctx))}
      onClick={() => ctx.onFocus(e.id)}
    >
      <div className="text-xs text-muted-foreground">{thread.title}</div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{thread.current}</span>
        <span className="text-xs text-muted-foreground">
          {KIND_LABEL[e.kind]?.toLowerCase()} at <TimeChip ms={e.atMs} active={ctx.focusId === e.id} onClick={() => ctx.onFocus(e.id)} /> · unchanged
        </span>
      </div>
      <MeetingLinks links={thread.links} viewer={ctx.viewer} />
    </article>
  );
}

function ThreadCard({ thread, ctx, status }: { thread: Thread; ctx: Ctx; status: React.ReactNode }) {
  return (
    <article className={cn("rounded-md border bg-card p-3.5", dimThread(thread, ctx))}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-snug">{thread.title}</h3>
        {status}
      </div>
      <div className="mt-2">
        <EventPath thread={thread} ctx={ctx} />
      </div>
      <MeetingLinks links={thread.links} viewer={ctx.viewer} />
    </article>
  );
}

function EventPath({ thread, ctx }: { thread: Thread; ctx: Ctx }) {
  return (
    <ol className="relative space-y-1">
      <span aria-hidden className="absolute top-2 bottom-2 left-[5px] w-px bg-border" />
      {thread.events.map((e) => (
        <EventStep key={e.id} event={e} ctx={ctx} />
      ))}
    </ol>
  );
}

function EventStep({ event: e, ctx }: { event: ThreadEvent; ctx: Ctx }) {
  const focused = ctx.focusId === e.id;
  const by = ctx.people.get(e.by)!;
  const mine = ctx.viewer != null && eventInvolves(e, ctx.viewer);
  const related = e.relatedThreadId ? ctx.threads.get(e.relatedThreadId) : null;
  const pivotal = e.state === "current" || e.kind === "challenged";
  return (
    <li
      className={cn("group/step relative cursor-pointer rounded-md py-1.5 pr-2 pl-5 hover:bg-muted/60", focused && "bg-accent-soft hover:bg-accent-soft")}
      onClick={() => ctx.onFocus(e.id)}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-[11px] left-[2px] size-[7px] rounded-full border-2 border-card",
          pivotal ? "bg-accent" : e.state === "superseded" ? "bg-muted-foreground/40" : "bg-muted-foreground/70",
        )}
      />
      <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
        <TimeChip ms={e.atMs} active={focused} onClick={() => ctx.onFocus(e.id)} className="-ml-1" />
        <span className="font-medium">{KIND_LABEL[e.kind] ?? e.kind}</span>
        {e.value && (
          <span className={cn("font-medium", e.state === "superseded" && "text-muted-foreground line-through decoration-muted-foreground/60")}>
            {e.value}
          </span>
        )}
        {e.state === "superseded" && <Badge variant="outline">superseded</Badge>}
        {e.interrupted && <Badge variant="outline">cut off</Badge>}
        {mine && <Badge variant="soft">{e.by === ctx.viewer ? "you" : "affects you"}</Badge>}
        <span className="flex items-center gap-1 text-muted-foreground">
          <SpeakerDot index={by.colorIndex} /> {by.name.split(" ")[0]}
        </span>
        <CopyMoment target={{ e: e.id }} className="ml-auto opacity-0 [@media(hover:none)]:opacity-100 group-hover/step:opacity-100 focus-visible:opacity-100" />
      </div>
      <p className="mt-0.5 text-[13px] leading-snug text-foreground/90">{e.claim}</p>
      {e.reason && (
        <p className="mt-1 text-xs leading-snug">
          <span className="font-medium">Why: </span>
          {e.reason}{" "}
          {e.reasonSegmentIds[0] && (
            <TimeChip ms={ctx.segs.get(e.reasonSegmentIds[0])!.startMs} onClick={() => ctx.onFocus(e.id, "reason")} />
          )}
        </p>
      )}
      {related && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <CornerDownRight className="size-3" /> {related.kind === "constraint" ? "New constraint" : "Related"}: {related.title}
        </p>
      )}
    </li>
  );
}

function ActionItems({ items, ctx }: { items: ActionItem[]; ctx: Ctx }) {
  const byOwner = new Map<string, ActionItem[]>();
  for (const a of items) byOwner.set(a.ownerId, [...(byOwner.get(a.ownerId) ?? []), a]);
  return (
    <div className="divide-y rounded-md border bg-card">
      {[...byOwner].map(([owner, list]) => {
        const p = ctx.people.get(owner)!;
        return (
          <div key={owner} className="px-3.5 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <SpeakerDot index={p.colorIndex} /> {p.name}
              <span className="font-normal text-muted-foreground">· {p.role}</span>
            </div>
            {list.map((a) => (
              <div
                key={a.id}
                onClick={() => ctx.onFocus(a.id)}
                className={cn(
                  "group/action -mx-1.5 mt-1 cursor-pointer rounded-md px-1.5 py-1 hover:bg-muted/60",
                  ctx.focusId === a.id && "bg-accent-soft hover:bg-accent-soft",
                  ctx.viewer && !actionInvolves(a, ctx.viewer) && DIM,
                )}
              >
                <p className="text-[13px] leading-snug">{a.text}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {a.due && <span>Due {a.due} ·</span>}
                  <span>assigned at</span>
                  <TimeChip ms={a.assignedAtMs} active={ctx.focusId === a.id} onClick={() => ctx.onFocus(a.id)} />
                  {a.threadIds.length > 0 && <span>· from {a.threadIds.map((t) => ctx.threads.get(t)?.title).join(", ")}</span>}
                  <CopyMoment target={{ e: a.id }} className="ml-auto opacity-0 [@media(hover:none)]:opacity-100 group-hover/action:opacity-100 focus-visible:opacity-100" />
                </div>
                <MeetingLinks links={a.links} viewer={ctx.viewer} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
