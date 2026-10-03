"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ActionItem, Meeting, MeetingLink, Thread } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn, formatMs } from "@/lib/utils";
import { actionsForDecision, eventInvolves, threadsOf } from "./model";
import { SpeakerDot } from "./speaker-dot";

type Moment = { id: string; atMs: number };
type Card = { key: string; eyebrow: string; body: React.ReactNode; moment: Moment | null };

/**
 * Catch-up: the same seeded outcomes, stepped through one question at a time
 * (Now → Why → Who owns it → Still open). No new text is generated; empty steps are skipped.
 */
export function CatchUp({ meeting, viewer, onSeeMoment }: { meeting: Meeting; viewer: string | null; onSeeMoment: (id: string) => void }) {
  const cards = useMemo(() => buildCards(meeting, viewer), [meeting, viewer]);
  const [i, setI] = useState(0);
  const idx = Math.min(i, cards.length - 1);
  const card = cards[idx];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "SELECT") return;
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, cards.length - 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length]);

  if (!card) return <p className="mx-auto max-w-xl px-6 py-24 text-muted-foreground">Nothing changed in this meeting.</p>;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 sm:py-16">
      <ol className="flex items-center gap-2 text-xs" aria-label="Catch-up steps">
        {cards.map((c, n) => (
          <li key={c.key}>
            <button
              type="button"
              onClick={() => setI(n)}
              aria-current={n === idx ? "step" : undefined}
              className={cn(
                "rounded-full px-2.5 py-1 transition-colors",
                n === idx ? "bg-accent-soft font-medium text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c.eyebrow}
            </button>
          </li>
        ))}
      </ol>

      <article key={card.key} className="card-in mt-10 flex-1 sm:mt-14" aria-live="polite">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {idx + 1} / {cards.length} · {card.eyebrow}
        </p>
        <div className="mt-4">{card.body}</div>
        {card.moment && (
          <button
            type="button"
            onClick={() => onSeeMoment(card.moment!.id)}
            className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            See the moment <span className="font-mono text-xs tabular-nums">{formatMs(card.moment.atMs)}</span> <ArrowRight className="size-4" />
          </button>
        )}
      </article>

      <div className="mt-12 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setI(idx - 1)} disabled={idx === 0}>
          <ArrowLeft /> Back
        </Button>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">← → to step</span>
        <Button variant={idx === cards.length - 1 ? "outline" : "default"} onClick={() => setI(idx + 1)} disabled={idx === cards.length - 1}>
          Next <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function buildCards(meeting: Meeting, viewer: string | null): Card[] {
  const people = new Map(meeting.participants.map((p) => [p.id, p]));
  const first = (id: string) => people.get(id)?.name.split(" ")[0] ?? id;
  const decisions = threadsOf(meeting, "decision");
  const changed = decisions.filter((t) => t.events.some((e) => e.state === "superseded"));
  const lead = changed[0] ?? decisions[0];
  const cards: Card[] = [];

  // Now: the current state, with what it replaced.
  if (lead) {
    const cur = lead.events.findLast((e) => e.value != null)!;
    const was = lead.events.filter((e) => e.state === "superseded" && e.kind !== "proposed");
    const wasValue = (was.length ? was : lead.events.filter((e) => e.state === "superseded")).at(-1);
    const others = decisions.filter((t) => t !== lead);
    cards.push({
      key: "now",
      eyebrow: "Now",
      moment: { id: cur.id, atMs: cur.atMs },
      body: (
        <>
          <p className="text-sm text-muted-foreground">{lead.title}</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{lead.current}</p>
          {wasValue && (
            <p className="mt-3 text-base text-muted-foreground">
              was <s className="decoration-muted-foreground/60">{wasValue.value}</s> until {formatMs(cur.atMs)}
            </p>
          )}
          {others.length > 0 && (
            <ul className="mt-10 space-y-1.5 border-t pt-5 text-sm">
              {others.map((t) => (
                <li key={t.id} className="text-muted-foreground">
                  <span className="text-foreground">{t.title}:</span> {t.current}
                  {t.events.some((e) => e.state === "superseded") && <span className="text-accent"> · also changed</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    });
  }

  // Why: what challenged the earlier position, and the stated reason for the new one.
  if (lead && changed.includes(lead)) {
    const challenge = lead.events.find((e) => e.kind === "challenged");
    const change = lead.events.findLast((e) => e.state === "current");
    if (challenge || change?.reason) {
      cards.push({
        key: "why",
        eyebrow: "Why",
        moment: challenge ? { id: challenge.id, atMs: challenge.atMs } : change ? { id: change.id, atMs: change.atMs } : null,
        body: (
          <>
            {challenge && (
              <p className="text-2xl leading-snug font-medium tracking-tight sm:text-[28px]">{challenge.claim}</p>
            )}
            {challenge && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                <SpeakerDot index={people.get(challenge.by)!.colorIndex} /> raised by {first(challenge.by)} at {formatMs(challenge.atMs)}
              </p>
            )}
            {change?.reason && <p className="mt-8 max-w-prose text-base leading-relaxed text-foreground/85">{change.reason}</p>}
          </>
        ),
      });
    }
  }

  // Who owns it: follow-through first (actions tied to the change), the viewer's own leading.
  const tied = lead ? actionsForDecision(meeting, lead, viewer) : [];
  const owned = [...tied, ...meeting.actionItems.filter((a) => !tied.includes(a))];
  if (viewer) owned.sort((a, b) => Number(b.ownerId === viewer) - Number(a.ownerId === viewer));
  if (owned.length) {
    cards.push({
      key: "owners",
      eyebrow: "Who owns it",
      moment: { id: owned[0].id, atMs: owned[0].assignedAtMs },
      body: (
        <ul className="space-y-5">
          {owned.map((a, n) => (
            <OwnerRow key={a.id} a={a} lead={n === 0} you={a.ownerId === viewer} name={people.get(a.ownerId)!.name} color={people.get(a.ownerId)!.colorIndex} />
          ))}
        </ul>
      ),
    });
  }

  // Still open: unanswered questions; a later meeting that answered one is linked, not inferred.
  const open = threadsOf(meeting, "question");
  if (open.length) {
    const mineFirst = viewer ? [...open].sort((a, b) => Number(raisedBy(b, viewer)) - Number(raisedBy(a, viewer))) : open;
    const firstEv = mineFirst[0].events[0];
    cards.push({
      key: "open",
      eyebrow: "Still open",
      moment: { id: firstEv.id, atMs: firstEv.atMs },
      body: (
        <ul className="space-y-6">
          {mineFirst.map((t) => (
            <li key={t.id}>
              <p className="text-lg leading-snug font-medium">{t.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                raised by {first(t.events[0].by)}
                {viewer && raisedBy(t, viewer) && <span className="text-accent"> (you)</span>}
                {t.events.some((e) => e.interrupted) && " · cut off the first time"}
                {viewer && !raisedBy(t, viewer) && t.events.some((e) => eventInvolves(e, viewer)) && <span className="text-accent"> · affects you</span>}
              </p>
              <LaterLinks links={t.links} viewer={viewer} />
            </li>
          ))}
        </ul>
      ),
    });
  }
  return cards;
}

const raisedBy = (t: Thread, pid: string) => t.events.some((e) => e.by === pid && e.kind === "raised");

function OwnerRow({ a, lead, you, name, color }: { a: ActionItem; lead: boolean; you: boolean; name: string; color: number }) {
  return (
    <li>
      <p className={cn("flex items-center gap-1.5 text-sm", lead ? "font-medium" : "text-muted-foreground")}>
        <SpeakerDot index={color} /> {you ? "You" : name}
        {a.due && <span className="font-normal text-muted-foreground">· due {a.due}</span>}
      </p>
      <p className={cn("mt-0.5 leading-snug", lead ? "text-2xl font-medium tracking-tight" : "text-base")}>{a.text}</p>
    </li>
  );
}

function LaterLinks({ links, viewer }: { links: MeetingLink[]; viewer: string | null }) {
  const later = links.filter((l) => l.direction === "later");
  if (!later.length) return null;
  return (
    <>
      {later.map((l) => (
        <Link
          key={l.meetingId + l.focusId}
          href={`/m/${l.meetingId}?e=${l.focusId}${viewer ? `&as=${viewer}` : ""}`}
          className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          {l.relation === "answers" ? "Answered later in" : "Picked up later in"} {l.meetingTitle} <ArrowRight className="size-3.5" />
        </Link>
      ))}
    </>
  );
}
