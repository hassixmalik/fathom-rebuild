import "server-only";
import { Pool } from "pg";
import type { Meeting, MeetingSummary, Thread } from "./types";

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
  const [participants, chapters, segments, threads, events, actions] = await Promise.all([
    q("SELECT * FROM fathom.participants WHERE meeting_id = $1 ORDER BY color_index"),
    q("SELECT * FROM fathom.chapters WHERE meeting_id = $1 ORDER BY idx"),
    q("SELECT * FROM fathom.segments WHERE meeting_id = $1 ORDER BY seq"),
    q("SELECT * FROM fathom.threads WHERE meeting_id = $1 ORDER BY sort"),
    q("SELECT * FROM fathom.thread_events WHERE meeting_id = $1 ORDER BY thread_id, seq"),
    q("SELECT * FROM fathom.action_items WHERE meeting_id = $1 ORDER BY sort"),
  ]);
  return {
    id: m.id, title: m.title, company: m.company, platform: m.platform,
    startedAt: m.started_at.toISOString(), durationMs: m.duration_ms, wordCount: m.word_count,
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
      events: events.filter((e) => e.thread_id === t.id).map((e) => ({
        id: e.id, seq: e.seq, kind: e.kind, value: e.value, state: e.state, atMs: e.at_ms, by: e.by_participant_id,
        claim: e.claim, reason: e.reason, interrupted: e.interrupted, relatedThreadId: e.related_thread_id,
        evidenceSegmentIds: e.evidence_segment_ids, reasonSegmentIds: e.reason_segment_ids,
        affectedParticipantIds: e.affected_participant_ids,
      })),
    })),
    actionItems: actions.map((a) => ({
      id: a.id, ownerId: a.owner_id, text: a.text, due: a.due, assignedAtMs: a.assigned_at_ms,
      evidenceSegmentIds: a.evidence_segment_ids, threadIds: a.thread_ids, affectedParticipantIds: a.affected_participant_ids,
    })),
  };
}
