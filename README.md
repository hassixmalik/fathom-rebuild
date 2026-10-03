# Fathom rebuild: what changed in the meeting

**Live:** https://fathom-rebuild-three.vercel.app
**Flagship meeting:** https://fathom-rebuild-three.vercel.app/m/ledger-v2-launch-sync
(add `?view=catchup`, `?as=tom` or `?as=omar` to the URL to try the other views)

This is a one-day rebuild of [fathom.video](https://fathom.video), built with Next.js, Tailwind, shadcn/ui and Neon Postgres, and deployed on Vercel.

## Thesis

Meeting tools are good at remembering everything. This rebuild is about finding the **few moments that changed something**.

On a 60-minute call with 8 people, summarising isn't the hard part:
- Decisions change partway through.
- Who owns a piece of work changes.
- Conversations branch off.
- Most of the transcript doesn't matter to any one person.

Fathom already pulls out decisions and action items well. When something changes mid-discussion, though, you still have to piece together the path yourself: the earlier position, why it changed, and where it ended up. Its output is also organised around the meeting, so on a big call you have to work out for yourself what's relevant to you.

**The transcript is the source of truth. AI is the navigation layer over it.**

### The demo case

*Ledger v2 launch sync* is the flagship meeting: 8 people, 60 minutes, at a fictional invoicing SaaS called Tally.

```
Launch date   ~~Friday~~ 12:00 → Blocker 27:00 → Monday 41:00 → Omar: migration plan 48:00  +3
```

- The team agrees to Friday at 12:00.
- Engineering raises a blocker at 27:00: the migration fails on 4 of the 120 largest workspaces.
- The decision changes to Monday at 41:00.
- Omar is assigned the fix at 48:00.

Every step links to the moment it happened. The meeting also includes the messy parts of a real call:
- two quiet participants;
- cross-talk;
- an interruption (Tom is talked over at 31:30 and brings the point up again at 57:00);
- an off-topic tangent;
- three unresolved questions.

**Acceptance test.** Someone who wasn't on the call can answer these three questions in under 60 seconds, and check each answer against the transcript:
1. When do we launch?
2. Why did it change?
3. Who is handling the fix?

## Left side explains, right side proves

The meeting page is split in two.

**Left: "What changed?"** Structured outcomes:
- **Decisions**, each with its history (earlier position → what challenged it → current state → who owns the follow-through).
- **New constraints.**
- **Open questions.**
- **Action items**, grouped by owner.

Each item is one line saying what happened. There are no transcript quotes on the left.

**Right: the proof.** Playback (a simulated clock for this meeting) with a timeline, and the transcript.
- Clicking any event, timestamp or timeline marker jumps playback to that moment, scrolls the transcript and highlights the evidence.
- The reason for a change is highlighted more lightly, so the cause and the change can be seen together.

The order of importance is **outcomes > topics > people > transcript**. That decides what gets read first, not how much screen space each part gets.

### Other features

| Feature | What it does |
|---|---|
| **Viewing as** (`?as=`) | A filter, not a login. It adds a "For [name]" box (your actions → what you raised → what affects you), and tags matching items "you" or "affects you". Everything else is dimmed, never hidden. **Tom** sees his question that was cut off at 31:30 and is still unresolved. **Omar** sees his migration plan first. |
| **Catch-up** (`?view=catchup`) | Four calm cards, one at a time: Now → Why → Who owns it → Still open. Each has "See the moment →", which opens the full view at that point. Uses the Viewing-as setting. |
| **Cross-meeting follow-through** | Links written by hand in the seed data, never guessed. Example: "Answered later in *Weekend support plan* →" on Tom's question. Links work in both directions. |
| **Share a moment** | "Copy link to this moment" on events, action items and transcript lines. The link keeps `?as=`, so the recipient sees the same view. |
| **Search** (index page) | Plain case-insensitive matching over transcripts, decisions, questions and action items. Each result opens at its moment. |
| **Timeline** | Marker shape shows the type: decision, replaced decision, constraint, question, action. Chapter ticks, hover/focus tooltips, and a legend. |
| **Keyboard** | `space` plays/pauses; `j`/`k` jump to the previous/next chapter; `←`/`→` step through Catch-up. |

## What's stubbed

- **Recording bot and calendar:** not built. Meetings come from committed seed data (`seed/meetings/*`).
- **Recording:** the flagship meeting has no audio or video. A **simulated media clock** handles play, pause, seek and 1×/1.5×/2× speed through the same interface a `<video>` element would, so real media can be swapped in later.
- **Transcription and AI extraction:** pre-written, not generated at runtime.
  - The transcript is hand-written in a plain-text format. Each line has a start time, a speaker and an optional `{#key}` tag that outcomes can point to.
  - Outcomes (`outcomes.json`) point to those keys, not to raw segment IDs.
  - `scripts/build-seed.mjs` turns this into data and **fails the build** if any of these checks fail:
    - every piece of evidence resolves to a real transcript line;
    - each event is within 10 s of its timestamp and was said by the right speaker;
    - the evidence actually contains the phrases that back up the claim;
    - each decision's events are in time order, and the "current" value really is the latest one;
    - quiet participants stay quiet;
    - cross-talk segments actually overlap;
    - cross-meeting links point to an earlier meeting.
- **Density:** the transcripts are intentionally thin. The flagship is about 2,000 words, where a real hour is closer to 9,000. Speech is dense around the key moments and lighter elsewhere.

## What I cut, and why

- **Summary templates, highlights and clips, editing, comments, auth, CRM, billing, settings, calendar.** None of them help prove the thesis. Fathom already does them well, and each costs build time without adding evidence for "what changed".
- **Writes from visitors.** The site is public with no login, and none of the thesis needs anyone to change data. With zero runtime writes, the seed can't be altered and there's nothing to abuse. The app only reads from the database.
- **Live AI generation.** Pre-generated outcomes keep the demo deterministic and let it be checked. The hard real-world problem, correctly linking a 41:00 reversal back to 12:00, is out of scope and named here rather than faked.
- **Talk-time charts.** Talk-time stats are stored, but there's no chart for them; they would compete with the outcomes for attention.
- **Transcript virtualization.** A plain list is fast enough at this size. I tried CSS `content-visibility`, then removed it: its estimated row heights changed during smooth scrolling, so jumps landed on the wrong line.

## Architecture

```
seed/meetings/<id>/transcript.txt  ┐  scripts/build-seed.mjs   seed/compiled.json   scripts/seed-db.mjs   Neon (schema "fathom")
seed/meetings/<id>/outcomes.json   ┘  compile + validate   →   (committed)       →  runs on every build →  read-only at runtime
```

- **Seed data:** **threads** are the internal model: a decision, constraint or question, with timestamped **events**. Each event has evidence segment IDs, the people affected, and an optional link to a related thread. The UI never shows the word "thread"; it shows Decisions, New constraints, Open questions and Action items.
- **Database reset:** every Vercel build reloads Neon from `seed/compiled.json` in a single transaction, locked so two builds can't collide. Each deploy resets the database to exactly what's committed.
  - Preview builds write to the same database as production. That's acceptable only because the data is identical.
- **Skipped deploys:** commits that only change `.agent-logs/` don't trigger a deploy (`vercel.json` → `ignoreCommand`).
- **Code layout:** `app/` holds the routes, `components/meeting/` the meeting UI, `lib/db.ts` the queries, and `components/meeting/model.ts` the Viewing-as and timeline logic.

## Running locally

```bash
npm install
# any Postgres works; the build seeds it
export DATABASE_URL=postgres://user:pass@localhost:5432/fathom
npm run build && npm start      # or: npm run seed:build && npm run db:seed && npm run dev
```

`DATABASE_URL` lives only in Vercel's environment and is never committed or printed.

## What's next

1. **Real extraction behind the same data model.** Generate threads and events from a transcript, but keep the build-time checks (evidence must exist and must back up the claim) as a guardrail at runtime.
2. **Threads across meetings.** Today's links are written by hand. Next would be decisions that keep their history across meetings ("Launch date" across the sync, the comms check-in and the retro).
3. **One real short recording** with genuine playback, using the media interface the simulated clock already follows.
4. **Viewing as from identity.** Once there's a login, the default view is the signed-in person.
5. **Proper virtualization** for transcripts well beyond about 1,500 segments.

## Process

The AI capture setup and its verification are in [`CAPTURE-TEST.md`](CAPTURE-TEST.md). Every prompt and final response is in [`.agent-logs/`](.agent-logs/), committed automatically as I worked, wrong turns included.
