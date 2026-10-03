#!/usr/bin/env node
// Loads seed/compiled.json (all meetings) into Postgres. Runs on every build, so each deploy resets the
// seed to its committed state. Idempotent and serialized with an advisory lock (preview + production
// builds may run at once). Never prints the connection string.
import { readFileSync } from "node:fs";
import pg from "pg";

const SCHEMA_VERSION = 3;
const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.VERCEL) {
    console.error("seed-db: DATABASE_URL is not set in this Vercel environment");
    process.exit(1);
  }
  console.log("seed-db: DATABASE_URL not set, skipping (local build)");
  process.exit(0);
}

const { meetings } = JSON.parse(readFileSync(new URL("../seed/compiled.json", import.meta.url), "utf8"));

const DDL = `
CREATE TABLE meetings (id text PRIMARY KEY, title text NOT NULL, company text, platform text,
  started_at timestamptz NOT NULL, duration_ms int NOT NULL, word_count int NOT NULL,
  media_url text); -- null = no recording: the player runs on a virtual clock, shown as "Audio only"
CREATE TABLE participants (meeting_id text REFERENCES meetings ON DELETE CASCADE, id text, name text NOT NULL,
  role text, quiet boolean NOT NULL, color_index int NOT NULL, segment_count int NOT NULL, word_count int NOT NULL,
  PRIMARY KEY (meeting_id, id));
CREATE TABLE chapters (meeting_id text REFERENCES meetings ON DELETE CASCADE, id text, idx int NOT NULL,
  title text NOT NULL, start_ms int NOT NULL, end_ms int NOT NULL, PRIMARY KEY (meeting_id, id));
CREATE TABLE segments (meeting_id text REFERENCES meetings ON DELETE CASCADE, id text, seq int NOT NULL,
  participant_id text NOT NULL, start_ms int NOT NULL, end_ms int NOT NULL, text text NOT NULL,
  overlap boolean NOT NULL, PRIMARY KEY (meeting_id, id));
CREATE INDEX segments_by_time ON segments (meeting_id, start_ms);
CREATE TABLE threads (meeting_id text REFERENCES meetings ON DELETE CASCADE, id text, sort int NOT NULL,
  kind text NOT NULL, title text NOT NULL, current_value text NOT NULL, PRIMARY KEY (meeting_id, id));
CREATE TABLE thread_events (meeting_id text REFERENCES meetings ON DELETE CASCADE, id text, thread_id text NOT NULL,
  seq int NOT NULL, kind text NOT NULL, value text, state text, at_ms int NOT NULL, by_participant_id text NOT NULL,
  claim text NOT NULL, reason text, interrupted boolean NOT NULL, related_thread_id text,
  evidence_segment_ids text[] NOT NULL, reason_segment_ids text[] NOT NULL, affected_participant_ids text[] NOT NULL,
  PRIMARY KEY (meeting_id, id));
CREATE TABLE action_items (meeting_id text REFERENCES meetings ON DELETE CASCADE, id text, sort int NOT NULL,
  owner_id text NOT NULL, text text NOT NULL, short text NOT NULL, due text, assigned_at_ms int NOT NULL,
  evidence_segment_ids text[] NOT NULL, thread_ids text[] NOT NULL, affected_participant_ids text[] NOT NULL,
  PRIMARY KEY (meeting_id, id));
-- A later meeting's thread or action that answers / picks up / changes an earlier meeting's thread.
CREATE TABLE links (meeting_id text REFERENCES meetings ON DELETE CASCADE, source_kind text NOT NULL, source_id text NOT NULL,
  target_meeting_id text NOT NULL, target_thread_id text NOT NULL, relation text NOT NULL);
CREATE INDEX links_by_target ON links (target_meeting_id);
`;

async function insert(client, table, cols, rows) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const params = [];
    const values = chunk.map((r) => `(${cols.map((c) => (params.push(r[c]), `$${params.length}`)).join(",")})`);
    await client.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${values.join(",")}`, params);
  }
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(727274)");
  await client.query("CREATE SCHEMA IF NOT EXISTS fathom");
  await client.query("SET LOCAL search_path TO fathom");
  await client.query("CREATE TABLE IF NOT EXISTS schema_version (version int NOT NULL)");
  const v = (await client.query("SELECT version FROM schema_version")).rows[0]?.version;
  if (v !== SCHEMA_VERSION) {
    for (const t of ["links", "action_items", "thread_events", "threads", "segments", "chapters", "participants", "meetings"])
      await client.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    await client.query(DDL);
    await client.query("DELETE FROM schema_version");
    await client.query("INSERT INTO schema_version VALUES ($1)", [SCHEMA_VERSION]);
  }
  // Whole seed is replaced: the database holds exactly what is committed, nothing else.
  await client.query("DELETE FROM meetings");
  for (const data of meetings) {
    const m = data.meeting;
    const mid = m.id;
    await insert(client, "meetings", ["id", "title", "company", "platform", "started_at", "duration_ms", "word_count", "media_url"],
      [{ ...m, media_url: m.media_url ?? null }]);
    await insert(client, "participants", ["meeting_id", "id", "name", "role", "quiet", "color_index", "segment_count", "word_count"],
      data.participants.map((p) => ({ ...p, meeting_id: mid, segment_count: p.segments, word_count: p.words })));
    await insert(client, "chapters", ["meeting_id", "id", "idx", "title", "start_ms", "end_ms"],
      data.chapters.map((c) => ({ ...c, meeting_id: mid, idx: c.index })));
    await insert(client, "segments", ["meeting_id", "id", "seq", "participant_id", "start_ms", "end_ms", "text", "overlap"],
      data.segments.map((s) => ({ ...s, meeting_id: mid })));
    await insert(client, "threads", ["meeting_id", "id", "sort", "kind", "title", "current_value"],
      data.threads.map((t, i) => ({ ...t, meeting_id: mid, sort: i, current_value: t.current })));
    await insert(client, "thread_events", ["meeting_id", "id", "thread_id", "seq", "kind", "value", "state", "at_ms", "by_participant_id",
      "claim", "reason", "interrupted", "related_thread_id", "evidence_segment_ids", "reason_segment_ids", "affected_participant_ids"],
      data.threads.flatMap((t) => t.events.map((e) => ({ ...e, meeting_id: mid, thread_id: t.id, by_participant_id: e.by }))));
    await insert(client, "action_items", ["meeting_id", "id", "sort", "owner_id", "text", "short", "due", "assigned_at_ms",
      "evidence_segment_ids", "thread_ids", "affected_participant_ids"],
      data.action_items.map((a, i) => ({ ...a, meeting_id: mid, sort: i })));
    await insert(client, "links", ["meeting_id", "source_kind", "source_id", "target_meeting_id", "target_thread_id", "relation"], [
      ...data.threads.flatMap((t) => t.resolves.map((l) => ({ source_kind: "thread", source_id: t.id, ...l }))),
      ...data.action_items.flatMap((a) => a.resolves.map((l) => ({ source_kind: "action", source_id: a.id, ...l }))),
    ].map((l) => ({ ...l, meeting_id: mid, target_meeting_id: l.meeting, target_thread_id: l.thread })));
  }
  await client.query("COMMIT");
  console.log(`seed-db: loaded ${meetings.length} meetings (${meetings.map((x) => x.meeting.id).join(", ")})`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("seed-db: failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
