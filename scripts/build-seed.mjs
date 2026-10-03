#!/usr/bin/env node
// Compiles every seed/meetings/<id>/{transcript.txt,outcomes.json} into seed/compiled.json and validates it.
// Deterministic: same input, same output (stable segment ids). Exits 1 on any validation failure.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const seedDir = join(dirname(fileURLToPath(import.meta.url)), "..", "seed");
const toMs = (mmss) => {
  const [m, s] = mmss.split(":").map(Number);
  return (m * 60 + s) * 1000;
};
const fmt = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const words = (t) => t.split(/\s+/).filter(Boolean).length;
const naturalMs = (t) => 800 + words(t) * 400; // ~2.5 words/s

function compileMeeting(dir, errors) {
const outcomes = JSON.parse(readFileSync(join(dir, "outcomes.json"), "utf8"));
const durationMs = toMs(outcomes.meeting.duration);
const speakers = new Map(outcomes.participants.map((p) => [p.id.toUpperCase(), p.id]));

// ---- parse ----
const chapters = [];
const raw = [];
readFileSync(join(dir, "transcript.txt"), "utf8").split("\n").forEach((line, i) => {
  line = line.trim();
  if (!line || line.startsWith("# ")) return;
  const ch = line.match(/^## (\d+) \| (.+) \| (\d+:\d+)$/);
  if (ch) return chapters.push({ id: `ch-${ch[1]}`, index: +ch[1], title: ch[2], start_ms: toMs(ch[3]) });
  const m = line.match(/^(?:@(\d+:\d+) )?(~)?([A-Z]+): (.+?)(?: \{#([a-z0-9-]+)\})?$/);
  if (!m || !speakers.has(m[3])) throw new Error(`transcript.txt:${i + 1}: cannot parse: ${line}`);
  raw.push({ pin: m[1] ? toMs(m[1]) : null, overlap: !!m[2], participant_id: speakers.get(m[3]), text: m[4], key: m[5] ?? null, line: i + 1 });
});

// ---- time the main (non-overlapping) sequence between pins ----
const main = raw.filter((s) => !s.overlap);
if (main[0].pin !== 0) throw new Error("first segment must be pinned at 00:00");
const pinIdx = main.map((s, i) => (s.pin != null ? i : -1)).filter((i) => i >= 0);
pinIdx.push(main.length);
for (let p = 0; p < pinIdx.length - 1; p++) {
  const a = pinIdx[p], b = pinIdx[p + 1];
  const t0 = main[a].pin, t1 = b < main.length ? main[b].pin : durationMs;
  if (t1 <= t0) throw new Error(`pins out of order at transcript.txt:${main[a].line}`);
  const w = main.slice(a, b).map((s) => words(s.text) + 2);
  const total = w.reduce((x, y) => x + y, 0);
  let acc = 0;
  for (let k = a; k < b; k++) {
    main[k].start_ms = Math.round(t0 + ((t1 - t0) * acc) / total);
    acc += w[k - a];
  }
}
main.forEach((s, i) => {
  const next = i + 1 < main.length ? main[i + 1].start_ms : durationMs;
  s.end_ms = Math.min(next - 200, s.start_ms + naturalMs(s.text));
});
// ---- overlaps start inside the previous segment ----
let prev = null;
for (const s of raw) {
  if (s.overlap) {
    s.start_ms = s.pin ?? Math.round(prev.start_ms + 0.45 * (prev.end_ms - prev.start_ms));
    s.end_ms = s.start_ms + naturalMs(s.text);
  }
  prev = s;
}

const segments = [...raw]
  .sort((x, y) => x.start_ms - y.start_ms || x.line - y.line)
  .map((s, i) => ({ id: `seg-${String(i + 1).padStart(4, "0")}`, seq: i + 1, participant_id: s.participant_id, start_ms: s.start_ms, end_ms: s.end_ms, text: s.text, key: s.key, overlap: s.overlap }));
chapters.forEach((c, i) => (c.end_ms = i + 1 < chapters.length ? chapters[i + 1].start_ms : durationMs));

// ---- resolve outcomes ----
const byKey = new Map();
for (const s of segments) {
  if (!s.key) continue;
  if (byKey.has(s.key)) errors.push(`duplicate key {#${s.key}}`);
  byKey.set(s.key, s);
}
const ids = new Set(outcomes.participants.map((p) => p.id));
const resolve = (keys, where) =>
  keys.map((k) => {
    const s = byKey.get(k);
    if (!s) errors.push(`${where}: evidence {#${k}} does not resolve to a segment`);
    return s;
  }).filter(Boolean);
const checkSupports = (segs, phrases, where) => {
  const text = segs.map((s) => s.text).join(" ").toLowerCase().replace(/[’]/g, "'");
  for (const p of phrases ?? []) if (!text.includes(p.toLowerCase())) errors.push(`${where}: evidence does not contain "${p}"`);
};
const checkPeople = (list, where) => list.forEach((p) => ids.has(p) || errors.push(`${where}: unknown participant ${p}`));
const TOL = 10_000;

const threads = outcomes.threads.map((t) => {
  let lastAt = -1;
  const valued = t.events.filter((e) => e.value != null);
  const events = t.events.map((e, i) => {
    const where = `${t.id}#${i + 1}(${e.kind}@${e.at})`;
    const at_ms = toMs(e.at);
    const ev = resolve(e.evidence, where);
    const why = resolve(e.reason_evidence ?? [], `${where} reason`);
    checkSupports(ev, e.supports, where);
    checkSupports(why, e.reason_supports, `${where} reason`);
    checkPeople([e.by, ...e.affected], where);
    if (ev[0] && Math.abs(ev[0].start_ms - at_ms) > TOL) errors.push(`${where}: first evidence starts at ${fmt(ev[0].start_ms)}, not within 10s of ${e.at}`);
    if (ev[0] && ev[0].participant_id !== e.by) errors.push(`${where}: first evidence is spoken by ${ev[0].participant_id}, event says ${e.by}`);
    if (at_ms < lastAt) errors.push(`${where}: events out of chronological order`);
    lastAt = at_ms;
    if (e.related && !outcomes.threads.some((x) => x.id === e.related)) errors.push(`${where}: related thread ${e.related} missing`);
    const isLastValued = e.value != null && e === valued[valued.length - 1];
    const state = e.value == null ? null : isLastValued ? "current" : e.value === t.current ? "earlier" : "superseded";
    return { id: `${t.id}-${i + 1}`, seq: i + 1, kind: e.kind, value: e.value ?? null, state, at_ms, by: e.by, claim: e.claim, reason: e.reason ?? null, interrupted: !!e.interrupted, related_thread_id: e.related ?? null, evidence_segment_ids: ev.map((s) => s.id), reason_segment_ids: why.map((s) => s.id), affected_participant_ids: e.affected };
  });
  if (t.kind === "decision") {
    if (!valued.length) errors.push(`${t.id}: decision has no valued event`);
    else if (valued[valued.length - 1].value !== t.current) errors.push(`${t.id}: current "${t.current}" is not the last decided value "${valued[valued.length - 1].value}"`);
  }
  return { id: t.id, kind: t.kind, title: t.title, current: t.current, events };
});

const actionItems = outcomes.action_items.map((a) => {
  const where = `action ${a.id}`;
  const ev = resolve(a.evidence, where);
  checkSupports(ev, a.supports, where);
  checkPeople([a.owner, ...a.affected], where);
  if (!a.affected.includes(a.owner)) errors.push(`${where}: owner must be affected`);
  if (ev[0] && Math.abs(ev[0].start_ms - toMs(a.at)) > TOL) errors.push(`${where}: evidence not within 10s of ${a.at}`);
  for (const t of a.threads) if (!outcomes.threads.some((x) => x.id === t)) errors.push(`${where}: thread ${t} missing`);
  return { id: a.id, owner_id: a.owner, text: a.text, due: a.due, assigned_at_ms: toMs(a.at), evidence_segment_ids: ev.map((s) => s.id), thread_ids: a.threads, affected_participant_ids: a.affected };
});

// ---- transcript-level checks ----
const totalWords = segments.reduce((n, s) => n + words(s.text), 0);
const stats = Object.fromEntries(outcomes.participants.map((p) => {
  const mine = segments.filter((s) => s.participant_id === p.id);
  return [p.id, { segments: mine.length, words: mine.reduce((n, s) => n + words(s.text), 0) }];
}));
for (const p of outcomes.participants.filter((p) => p.quiet)) {
  const share = stats[p.id].words / totalWords;
  if (share > 0.06) errors.push(`quiet participant ${p.id} speaks ${(share * 100).toFixed(1)}% of words (max 6%)`);
}
for (const s of segments) {
  if (s.end_ms <= s.start_ms) errors.push(`${s.id}: non-positive duration`);
  if (s.end_ms > durationMs) errors.push(`${s.id}: ends after meeting end`);
}
const overlaps = segments.filter((s) => s.overlap);
if (outcomes.meeting.expect_crosstalk && !overlaps.length) errors.push("no cross-talk segments");
for (const o of overlaps) {
  const before = segments.filter((s) => s.seq < o.seq && s.participant_id !== o.participant_id).pop();
  if (!before || before.end_ms <= o.start_ms) errors.push(`${o.id}: marked cross-talk but does not overlap the previous speaker`);
}
chapters.forEach((c, i) => i && c.start_ms <= chapters[i - 1].start_ms && errors.push(`chapter ${c.index} out of order`));

const { expect_crosstalk, ...meeting } = outcomes.meeting;
return {
  meeting: { ...meeting, duration_ms: durationMs, word_count: totalWords },
  participants: outcomes.participants.map((p, i) => ({ ...p, quiet: !!p.quiet, color_index: i, ...stats[p.id] })),
  chapters,
  segments: segments.map(({ key, ...s }) => s),
  threads,
  action_items: actionItems,
};

}

const errors = [];
const meetings = [];
for (const id of readdirSync(join(seedDir, "meetings")).sort()) {
  const errs = [];
  const m = compileMeeting(join(seedDir, "meetings", id), errs);
  if (m.meeting.id !== id) errs.push(`folder ${id} holds meeting ${m.meeting.id}`);
  errors.push(...errs.map((e) => `${id}: ${e}`));
  meetings.push(m);
  const talk = m.participants.map((p) => `${p.id} ${Math.round((p.words / m.meeting.word_count) * 100)}%`).join(", ");
  console.log(`${id}: ${m.segments.length} segments, ${m.meeting.word_count} words, ${m.threads.length} threads, ${m.action_items.length} actions | ${talk}`);
}
if (errors.length) {
  console.error(`seed validation failed (${errors.length}):\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}
writeFileSync(join(seedDir, "compiled.json"), JSON.stringify({ meetings }, null, 1) + "\n");
console.log(`seed ok: ${meetings.length} meetings`);
