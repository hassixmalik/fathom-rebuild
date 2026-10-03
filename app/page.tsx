import Link from "next/link";
import { listMeetings } from "@/lib/db";
import { formatMs } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  const meetings = await listMeetings();
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-lg font-semibold">Meetings</h1>
      <ul className="mt-4 divide-y rounded-md border bg-card">
        {meetings.map((m) => (
          <li key={m.id}>
            <Link href={`/m/${m.id}`} className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-muted">
              <span className="font-medium">{m.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {m.company} · {m.participantCount} people · {formatMs(m.durationMs)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
