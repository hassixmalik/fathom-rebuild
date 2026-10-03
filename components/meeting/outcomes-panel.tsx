"use client";
import { ArrowRight, CornerDownRight } from "lucide-react";
import type { ActionItem, Meeting, Participant, Segment, Thread, ThreadEvent } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn, formatMs } from "@/lib/utils";
import { KIND_LABEL, threadsOf } from "./model";
import { SpeakerDot } from "./speaker-dot";
import { TimeChip } from "./time-chip";

type Ctx = {
  people: Map<string, Participant>;
  segs: Map<string, Segment>;
  threads: Map<string, Thread>;
  focusId: string | null;
  onFocus: (id: string, part?: "reason") => void;
};

export function OutcomesPanel({ meeting, focusId, onFocus }: { meeting: Meeting; focusId: string | null; onFocus: Ctx["onFocus"] }) {
  const ctx: Ctx = {
    people: new Map(meeting.participants.map((p) => [p.id, p])),
    segs: new Map(meeting.segments.map((s) => [s.id, s])),
    threads: new Map(meeting.threads.map((t) => [t.id, t])),
    focusId,
    onFocus,
  };
  const decisions = threadsOf(meeting, "decision");
  // Decisions that changed during the meeting lead; the path to their final state is the point.
  decisions.sort((a, b) => Number(hasHistory(b)) - Number(hasHistory(a)));
  return (
    <div className="space-y-7 px-4 py-5">
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
  );
}

const hasHistory = (t: Thread) => t.events.some((e) => e.state === "superseded");

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
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
    <article className="rounded-md border bg-card p-3.5 shadow-xs">
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
    </article>
  );
}

/** One-line path: each earlier position, what challenged it, and the current state, all jumpable. */
function EvolutionChain({ thread, ctx }: { thread: Thread; ctx: Ctx }) {
  const steps = thread.events.filter((e) => (e.value != null && e.kind !== "proposed") || e.kind === "challenged");
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
    </ol>
  );
}

function StableDecision({ thread, ctx }: { thread: Thread; ctx: Ctx }) {
  const e = thread.events[thread.events.length - 1];
  return (
    <article
      className={cn("cursor-pointer rounded-md border bg-card px-3.5 py-2.5 hover:bg-muted/50", ctx.focusId === e.id && "border-accent/50")}
      onClick={() => ctx.onFocus(e.id)}
    >
      <div className="text-xs text-muted-foreground">{thread.title}</div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{thread.current}</span>
        <span className="text-xs text-muted-foreground">
          {KIND_LABEL[e.kind]?.toLowerCase()} at <TimeChip ms={e.atMs} active={ctx.focusId === e.id} onClick={() => ctx.onFocus(e.id)} /> · unchanged
        </span>
      </div>
    </article>
  );
}

function ThreadCard({ thread, ctx, status }: { thread: Thread; ctx: Ctx; status: React.ReactNode }) {
  return (
    <article className="rounded-md border bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-snug">{thread.title}</h3>
        {status}
      </div>
      <div className="mt-2">
        <EventPath thread={thread} ctx={ctx} />
      </div>
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
  const quote = ctx.segs.get(e.evidenceSegmentIds[0])?.text;
  const related = e.relatedThreadId ? ctx.threads.get(e.relatedThreadId) : null;
  const pivotal = e.state === "current" || e.kind === "challenged";
  return (
    <li
      className={cn("relative cursor-pointer rounded-md py-1.5 pr-2 pl-5 hover:bg-muted/60", focused && "bg-accent-soft hover:bg-accent-soft")}
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
        <span className="flex items-center gap-1 text-muted-foreground">
          <SpeakerDot index={by.colorIndex} /> {by.name.split(" ")[0]}
        </span>
      </div>
      <p className="mt-0.5 text-[13px] leading-snug text-foreground/90">{e.claim}</p>
      {quote && <p className="mt-1 line-clamp-2 border-l-2 pl-2 text-xs leading-snug text-muted-foreground italic">“{quote}”</p>}
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
                className={cn("-mx-1.5 mt-1 cursor-pointer rounded-md px-1.5 py-1 hover:bg-muted/60", ctx.focusId === a.id && "bg-accent-soft hover:bg-accent-soft")}
              >
                <p className="text-[13px] leading-snug">{a.text}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {a.due && <span>Due {a.due} ·</span>}
                  <span>assigned at</span>
                  <TimeChip ms={a.assignedAtMs} active={ctx.focusId === a.id} onClick={() => ctx.onFocus(a.id)} />
                  {a.threadIds.length > 0 && <span>· from {a.threadIds.map((t) => ctx.threads.get(t)?.title).join(", ")}</span>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
