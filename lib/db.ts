import "server-only";
import { Pool } from "pg";
import type { Meeting, MeetingLink, MeetingSummary, Thread } from "./types";

// One pool per server instance; the seed is read-only at runtime.
const globalForPool = globalThis as unknown as { pgPool?: Pool };
function pool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  globalForPool.pgPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return globalForPool.pgPool;
}

export async function listMeetings(): Promise<MeetingSummary[]> {
  const { rows } = await pool().query(
    `SELECT m.id, m.title, m.company, m.platform, m.started_at, m.duration_ms,
            (SELECT array_agg(p.name ORDER BY p.color_index) FROM fathom.participants p WHERE p.meeting_id = m.id) AS names,
            (SELECT count(*)::int FROM fathom.threads t WHERE t.meeting_id = m.id AND t.kind = 'decision') AS decisions,
            (SELECT count(DISTINCT e.thread_id)::int FROM fathom.thread_events e
              WHERE e.meeting_id = m.id AND e.state = 'superseded') AS changed,
            (SELECT count(*)::int FROM fathom.threads t WHERE t.meeting_id = m.id AND t.kind = 'question') AS open_questions,
            (SELECT count(*)::int FROM fathom.action_items a WHERE a.meeting_id = m.id) AS actions
       FROM fathom.meetings m ORDER BY m.started_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id, title: r.title, company: r.company, platform: r.platform, startedAt: r.started_at.toISOString(),
    durationMs: r.duration_ms, participantNames: r.names ?? [], decisions: r.decisions, changedDecisions: r.changed,
    openQuestions: r.open_questions, actionItems: r.actions,
  }));
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const db = pool();
  const m = (await db.query("SELECT * FROM fathom.meetings WHERE id = $1", [id])).rows[0];
  if (!m) return null;
  const q = (sql: string) => db.query(sql, [id]).then((r) => r.rows);
  const [participants, chapters, segments, threads, events, actions, later, earlier] = await Promise.all([
    q("SELECT * FROM fathom.participants WHERE meeting_id = $1 ORDER BY color_index"),
    q("SELECT * FROM fathom.chapters WHERE meeting_id = $1 ORDER BY idx"),
    q("SELECT * FROM fathom.segments WHERE meeting_id = $1 ORDER BY seq"),
    q("SELECT * FROM fathom.threads WHERE meeting_id = $1 ORDER BY sort"),
    q("SELECT * FROM fathom.thread_events WHERE meeting_id = $1 ORDER BY thread_id, seq"),
    q("SELECT * FROM fathom.action_items WHERE meeting_id = $1 ORDER BY sort"),
    // Later meetings pointing at this one. Land on the source thread's last event, or the action.
    q(`SELECT l.*, m.title, m.started_at,
              CASE WHEN l.source_kind = 'action' THEN l.source_id
                   ELSE (SELECT e.id FROM fathom.thread_events e WHERE e.meeting_id = l.meeting_id AND e.thread_id = l.source_id
                         ORDER BY e.seq DESC LIMIT 1) END AS focus_id
         FROM fathom.links l JOIN fathom.meetings m ON m.id = l.meeting_id
        WHERE l.target_meeting_id = $1 ORDER BY m.started_at`),
    // This meeting pointing at earlier ones. Land on the target thread's first event.
    q(`SELECT l.*, m.title, m.started_at,
              (SELECT e.id FROM fathom.thread_events e WHERE e.meeting_id = l.target_meeting_id AND e.thread_id = l.target_thread_id
                ORDER BY e.seq LIMIT 1) AS focus_id
         FROM fathom.links l JOIN fathom.meetings m ON m.id = l.target_meeting_id
        WHERE l.meeting_id = $1`),
  ]);
  const link = (r: Record<string, any>, direction: MeetingLink["direction"]): MeetingLink => ({
    direction, relation: r.relation, meetingId: direction === "later" ? r.meeting_id : r.target_meeting_id,
    meetingTitle: r.title, startedAt: r.started_at.toISOString(), focusId: r.focus_id,
  });
  return {
    id: m.id, title: m.title, company: m.company, platform: m.platform,
    startedAt: m.started_at.toISOString(), durationMs: m.duration_ms, wordCount: m.word_count, mediaUrl: m.media_url,
    participants: participants.map((p) => ({
      id: p.id, name: p.name, role: p.role, quiet: p.quiet, colorIndex: p.color_index,
      segmentCount: p.segment_count, wordCount: p.word_count,
    })),
    chapters: chapters.map((c) => ({ id: c.id, index: c.idx, title: c.title, startMs: c.start_ms, endMs: c.end_ms })),
    segments: segments.map((s) => ({
      id: s.id, seq: s.seq, participantId: s.participant_id, startMs: s.start_ms, endMs: s.end_ms, text: s.text, overlap: s.overlap,
    })),
    threads: threads.map((t): Thread => ({
      id: t.id, kind: t.kind, title: t.title, current: t.current_value,
      links: [
        ...later.filter((l) => l.target_thread_id === t.id).map((l) => link(l, "later")),
        ...earlier.filter((l) => l.source_kind === "thread" && l.source_id === t.id).map((l) => link(l, "earlier")),
      ],
      events: events.filter((e) => e.thread_id === t.id).map((e) => ({
        id: e.id, seq: e.seq, kind: e.kind, value: e.value, state: e.state, atMs: e.at_ms, by: e.by_participant_id,
        claim: e.claim, reason: e.reason, interrupted: e.interrupted, relatedThreadId: e.related_thread_id,
        evidenceSegmentIds: e.evidence_segment_ids, reasonSegmentIds: e.reason_segment_ids,
        affectedParticipantIds: e.affected_participant_ids,
      })),
    })),
    actionItems: actions.map((a) => ({
      id: a.id, ownerId: a.owner_id, text: a.text, short: a.short, due: a.due,
      links: earlier.filter((l) => l.source_kind === "action" && l.source_id === a.id).map((l) => link(l, "earlier")), assignedAtMs: a.assigned_at_ms,
      evidenceSegmentIds: a.evidence_segment_ids, threadIds: a.thread_ids, affectedParticipantIds: a.affected_participant_ids,
    })),
  };
}

export type SearchHit = {
  meetingId: string;
  meetingTitle: string;
  startedAt: string;
  kind: "transcript" | "decision" | "constraint" | "question" | "action";
  text: string;
  speaker: string | null;
  atMs: number;
  /** Where the result lands: an outcome event/action (?e=) or a transcript moment (?t=). */
  focusId: string | null;
};

/** Plain case-insensitive substring match over transcripts and outcome titles/claims. No ranking, no generation. */
export async function search(query: string, limit = 60): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { rows } = await pool().query(
    `WITH hits AS (
       SELECT t.meeting_id, t.kind, t.title AS text, NULL::text AS speaker,
              (SELECT e.at_ms FROM fathom.thread_events e WHERE e.meeting_id = t.meeting_id AND e.thread_id = t.id ORDER BY e.seq DESC LIMIT 1) AS at_ms,
              (SELECT e.id FROM fathom.thread_events e WHERE e.meeting_id = t.meeting_id AND e.thread_id = t.id ORDER BY e.seq DESC LIMIT 1) AS focus_id,
              0 AS rank
         FROM fathom.threads t WHERE t.title ILIKE $1 OR t.current_value ILIKE $1
       UNION ALL
       SELECT e.meeting_id, t.kind, e.claim, NULL, e.at_ms, e.id, 1
         FROM fathom.thread_events e JOIN fathom.threads t ON t.meeting_id = e.meeting_id AND t.id = e.thread_id
        WHERE e.claim ILIKE $1 AND NOT (t.title ILIKE $1 OR t.current_value ILIKE $1)
       UNION ALL
       SELECT a.meeting_id, 'action', a.text, NULL, a.assigned_at_ms, a.id, 1 FROM fathom.action_items a WHERE a.text ILIKE $1
       UNION ALL
       SELECT s.meeting_id, 'transcript', s.text, p.name, s.start_ms, NULL, 2
         FROM fathom.segments s JOIN fathom.participants p ON p.meeting_id = s.meeting_id AND p.id = s.participant_id
        WHERE s.text ILIKE $1
     )
     SELECT h.*, m.title AS meeting_title, m.started_at
       FROM hits h JOIN fathom.meetings m ON m.id = h.meeting_id
      ORDER BY m.started_at DESC, h.rank, h.at_ms
      LIMIT $2`,
    [like, limit],
  );
  return rows.map((r) => ({
    meetingId: r.meeting_id, meetingTitle: r.meeting_title, startedAt: r.started_at.toISOString(), kind: r.kind,
    text: r.text, speaker: r.speaker, atMs: r.at_ms, focusId: r.focus_id,
  }));
}

/** Everyone who appears in any meeting (for the index's Viewing-as picker). */
export async function listPeople(): Promise<{ id: string; name: string; role: string | null }[]> {
  const { rows } = await pool().query(
    "SELECT DISTINCT ON (id) id, name, role, color_index FROM fathom.participants ORDER BY id, color_index",
  );
  return rows.sort((a, b) => a.color_index - b.color_index).map((r) => ({ id: r.id, name: r.name, role: r.role }));
}
