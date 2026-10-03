import Link from "next/link";
import { Search } from "lucide-react";
import { listMeetings, search, type SearchHit } from "@/lib/db";
import { formatDate, formatDuration } from "@/lib/format";
import { formatMs } from "@/lib/utils";

export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const KIND: Record<SearchHit["kind"], string> = {
  transcript: "Transcript",
  decision: "Decision",
  constraint: "Constraint",
  question: "Open question",
  action: "Action item",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const [meetings, hits] = await Promise.all([listMeetings(), q ? search(q) : Promise.resolve([])]);
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-lg font-semibold">Meetings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Recorded calls for Tally. Open one to see what changed and jump to the moment it happened.</p>

      <form action="/" className="relative mt-6" role="search">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search all meetings: transcripts, decisions, questions, actions"
          aria-label="Search all meetings"
          className="h-10 w-full rounded-md border bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>

      {q ? <Results q={q} hits={hits} /> : <MeetingList meetings={meetings} />}
    </main>
  );
}

function MeetingList({ meetings }: { meetings: Awaited<ReturnType<typeof listMeetings>> }) {
  return (
    <ul className="mt-4 divide-y rounded-md border bg-card">
      {meetings.map((m) => (
        <li key={m.id}>
          <Link href={`/m/${m.id}`} className="block px-4 py-3.5 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span className="font-medium">{m.title}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDate(m.startedAt)} · {formatDuration(m.durationMs)} · {m.platform}
              </span>
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{m.participantNames.map((n) => n.split(" ")[0]).join(", ")}</div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs">
              {m.changedDecisions > 0 && <span className="font-medium text-accent">{plural(m.changedDecisions, "decision")} changed</span>}
              {m.decisions > 0 && <span className="text-muted-foreground">{plural(m.decisions, "decision")}</span>}
              {m.openQuestions > 0 && <span className="text-muted-foreground">{plural(m.openQuestions, "open question")}</span>}
              {m.actionItems > 0 && <span className="text-muted-foreground">{plural(m.actionItems, "action item")}</span>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Results({ q, hits }: { q: string; hits: SearchHit[] }) {
  const byMeeting = new Map<string, SearchHit[]>();
  for (const h of hits) byMeeting.set(h.meetingId, [...(byMeeting.get(h.meetingId) ?? []), h]);
  return (
    <div className="mt-4">
      <p className="text-xs text-muted-foreground">
        {hits.length === 0 ? `No matches for “${q}”.` : `${plural(hits.length, "match", "matches")} in ${plural(byMeeting.size, "meeting")}`}{" "}
        · <Link href="/" className="text-accent hover:underline">Clear</Link>
      </p>
      {[...byMeeting].map(([id, list]) => (
        <section key={id} className="mt-4 rounded-md border bg-card">
          <h2 className="flex items-baseline justify-between gap-4 border-b px-4 py-2.5">
            <Link href={`/m/${id}`} className="font-medium hover:underline">{list[0].meetingTitle}</Link>
            <span className="text-xs text-muted-foreground">{formatDate(list[0].startedAt)}</span>
          </h2>
          <ul className="divide-y">
            {list.map((h, i) => (
              <li key={i}>
                <Link
                  href={`/m/${id}?${h.focusId ? `e=${h.focusId}` : `t=${formatMs(h.atMs)}`}`}
                  className="grid grid-cols-[44px_1fr] gap-x-2 px-4 py-2 hover:bg-muted/60"
                >
                  <span className="pt-px font-mono text-[11px] tabular-nums text-accent">{formatMs(h.atMs)}</span>
                  <span className="min-w-0 text-[13px] leading-snug">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {KIND[h.kind]}
                      {h.speaker && ` · ${h.speaker}`}
                    </span>
                    <br />
                    <Highlight text={h.text} q={q} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i < 0) return <>{text}</>;
  const n = q.trim().length;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-accent-soft px-0.5 text-accent">{text.slice(i, i + n)}</mark>
      {text.slice(i + n)}
    </>
  );
}
