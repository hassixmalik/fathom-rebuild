# Flagship seed outline — "Ledger v2 launch sync"

Status: **draft for approval**. No transcript is generated yet.

- **Fictional company:** Tally, a B2B invoicing SaaS.
- **What's launching:** Ledger v2, a new billing data model. Every existing workspace has to be migrated to it.
- **Meeting:** 60:00, 8 people, a Google Meet recording, with the media replaced by a virtual clock.
- **Target size:** about 9,000 words and about 1,150 segments (median 6 s), 7 chapters.

## Participants

| # | Name | Role | Target talk share | Notes |
|---|---|---|---|---|
| 1 | Priya Shah | Head of Product (runs the meeting) | 22% | Proposes Friday and drives the replan |
| 2 | Lena Fischer | Engineering lead | 17% | Raises the blocker at 27:00 |
| 3 | Omar Haddad | Backend engineer | 13% | Gets the migration plan at 48:00. Hero of "Viewing as" |
| 4 | Marcus Bell | Marketing lead | 15% | Pushes for Friday, cross-talk with Lena, starts the tangent |
| 5 | Sofia Alvarez | Customer success | 12% | Owns the large-tenant comms |
| 6 | Daniel Kim | Product designer | 11% | Joins the tangent, light otherwise |
| 7 | Aisha Rahman | QA engineer | **~4% (quiet)** | One unresolved question at 52:00, directed at Omar |
| 8 | Tom Becker | Support lead | **~3% (quiet)** | Joins late at 02:10, is interrupted at 31:30, raises the point again at 57:00 and it stays unresolved |

The remaining ~3% is crosstalk and fragments ("yeah", "mm-hm").

## Chapters

| Chapter | Span | Content |
|---|---|---|
| 1. Kickoff & agenda | 00:00–04:00 | Small talk, Tom joins late, Priya sets the agenda |
| 2. Launch readiness | 04:00–15:30 | Status from each area → **Friday agreed (12:00)** |
| 3. Comms & rollout | 15:30–22:00 | Marcus's announcement plan, Sofia's customer emails, feature-flag rollout |
| 4. Tangent: dashboard redesign | 22:00–25:30 | Marcus and Daniel drift off topic; Priya pulls the meeting back |
| 5. Migration risk | 25:30–36:00 | **Blocker (27:00)**, cross-talk (29:00–29:40), **interruption (31:30)** |
| 6. Options & replan | 36:00–44:00 | Two options are weighed → **Monday supersedes Friday (41:00)** |
| 7. Owners, next steps & wrap | 44:00–60:00 | **Omar assigned (48:00)**, other owners, unresolved questions |

## Key moments (the evidence the UI links to)

| Time | Who | What happens | Thread / event |
|---|---|---|---|
| 09:40 | Priya | Proposes launching this Friday, since all areas report green | T1 *proposed: Friday* |
| **12:00** | Priya, Marcus, Lena | "So we're agreed, Friday." Marcus: "Locking the announcement." Lena: "Eng is fine with Friday." | T1 **agreed: Friday** |
| 19:50 | Sofia | Large tenants get a heads-up email two days before | (context) |
| 20:30 | Lena | Rollout behind a feature flag, largest tenants last | T3 **agreed** (a stable decision with no history, for contrast) |
| 22:00 | Marcus | "Unrelated, but has anyone seen the new dashboard mocks?" | Start of tangent |
| 25:20 | Priya | "Let's park that, it's not today's meeting." | End of tangent |
| **27:00** | Lena | Dry run on a production snapshot: 4 of the 120 largest workspaces failed to migrate, and rollback takes about 3 h. Not safe in business hours on a Friday. | T2 **raised (constraint)**, T1 **challenged** |
| 28:30 | Omar | Root cause: legacy multi-currency invoices. A fix needs about 2 days plus a second dry run. | T2 *detail* |
| 29:00–29:40 | Marcus ↔ Lena | Overlapping cross-talk: "the press date is set" vs. "then we ship broken billing" | (messiness) |
| **31:30** | Tom → Marcus | Tom starts "If this slips into the weekend, support—", Marcus talks over him, and the point is dropped | T4 *raised*, cut off |
| 37:10 | Priya | Option A: ship Friday but exclude the 4 tenants. Option B: move to Monday, with the migration running in a weekend window | T1 *options* |
| 39:00 | Sofia | Rejects A: two of the four are the biggest accounts, so excluding them is worse than a delay | (reason) |
| **41:00** | Priya | "OK, decision: we move launch to Monday. Migration runs Saturday night." Lena and Marcus agree, Marcus reluctantly | T1 **changed → Monday (current)**. Friday becomes superseded |
| 43:00 | Marcus | "Do we still publish the Friday teaser post?" Nobody answers before the next topic | T6 **open** |
| 45:10 | Priya → Marcus | Move the announcement to Monday | Action item |
| **48:00** | Priya → Omar | "Omar, can you own the migration plan, including the multi-currency fix and a rollback runbook, by Thursday EOD?" Omar: "Yes, I'll own it." | Action item, linked to T2 and T1 |
| 49:30 | Lena | Schedules the second dry run for Thursday afternoon | Action item |
| 50:30 | Sofia | Will email the 4 affected tenants about the weekend window | Action item |
| 52:00 | Aisha → Omar | "Do we have regression tests for the rollback path?" Omar: "Partially… let's take it offline." | T5 **open** (involves Omar) |
| 57:00 | Tom | Raises the 31:30 point again: who staffs support during the Saturday migration? Priya: "Good question, let's figure it out async." | T4 **open (unresolved)** |
| 59:30 | Priya | Wrap-up and recap | (end) |

## Threads (internal model) → what the UI shows

| Thread | Kind | UI section | Final state |
|---|---|---|---|
| T1 Launch date | decision | Decisions | **Monday (current)**, with Friday shown as superseded. Events at 09:40, 12:00, 27:00, 41:00 |
| T2 Migration fails on large legacy workspaces | constraint | New constraints | Active, mitigation owned by Omar |
| T3 Rollout behind a feature flag, largest tenants last | decision | Decisions | Current, unchanged |
| T4 Weekend support staffing | question | Open questions | Unresolved (31:30 cut off, 57:00 deferred) |
| T5 Regression tests for the rollback path | question | Open questions | Unresolved |
| T6 Keep the Friday teaser post? | question | Open questions | Unresolved |

**Action items, grouped by owner in the UI:**
- Omar: migration plan (48:00)
- Lena: second dry run (49:30)
- Sofia: tenant emails (50:30)
- Marcus: move the announcement (45:10)

**"Viewing as" relevance is deterministic, based on speaker and addressee tags:**
- Omar → his action item, T2, T1, T5.
- Tom → T4, the only thing he raised.
- Aisha → T5.

## Acceptance test this seed must support

Someone who wasn't on the call answers three questions in under 60 seconds and can check each answer in the transcript:
1. When do we launch? Monday.
2. Why did it change? The migration failed on 4 large workspaces (27:00).
3. Who is handling the fix? Omar, by Thursday (48:00).

## Generation plan (after approval)

1. This outline becomes a structured beat sheet: chapter, beats, speakers, talk-share targets.
2. Generate the transcript chapter by chapter, with key-moment lines written verbatim from this table.
3. A validator script checks:
   - each key moment's evidence segment exists within ±10 s of its timestamp and contains the key phrase;
   - talk shares are within ±3 percentage points;
   - quiet participants stay under 5%;
   - the cross-talk segments overlap in time.
4. Threads, action items and chapters are written by hand as JSON that references segment IDs. They are pre-generated, so nothing is extracted at runtime.
