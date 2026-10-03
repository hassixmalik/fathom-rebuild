import Link from "next/link";
import { listMeetings } from "@/lib/db";
import { formatDate, formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function Home() {
  const meetings = await listMeetings();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-lg font-semibold">Meetings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Recorded calls for Tally. Open one to see what changed and jump to the moment it happened.</p>
      <ul className="mt-6 divide-y rounded-md border bg-card">
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
                <span className="text-muted-foreground">{plural(m.decisions, "decision")}</span>
                {m.openQuestions > 0 && <span className="text-muted-foreground">{plural(m.openQuestions, "open question")}</span>}
                {m.actionItems > 0 && <span className="text-muted-foreground">{plural(m.actionItems, "action item")}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
