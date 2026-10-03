# CAPTURE-TEST

## 1. Setup

- **Tool:** Claude Code CLI `2.1.287`, running as a Claude Code on the web (remote cloud) session.
- **Model:** `claude-opus-5-5` (Opus 5.5) both plans and executes. There's no separate planner model and no subagents so far. The first, misconfigured test session ran its reply on `claude-sonnet-5-5`, which was the headless default. That shows up in its log.
- **Automatic mechanism:** yes. Claude Code hooks are lifecycle events set in `.claude/settings.json`, and each one runs a shell command with a JSON payload on stdin.

## 2. Mechanism

- **Config changed:** `.claude/settings.json`, which is project-level and committed.
- **Script:** `.claude/hooks/agent_capture.py`, written in Python with only the standard library.
  - `UserPromptSubmit` takes the `prompt` field from the hook payload and appends it verbatim as a `PROMPT` entry.
  - `Stop` (end of turn) reads `transcript_path`. It starts at the turn's last assistant message and walks the `parentUuid` chain back to the user prompt. It logs only the assistant **text** that comes after the last tool round-trip, which is the final response. Thinking, tool calls and intermediate text are left out. The model is taken from that message's `message.model`.
  - `SessionStart` is wired up so that a model can be stored if the payload ever includes one. Right now it doesn't, so the model on a first prompt comes from the `--model` argument of the `claude` process, then `ANTHROPIC_MODEL`, then the settings `model`.
- **Output:** one file per session, `.agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md`, in the requested format. The script only appends entries. The only thing it rewrites is the front-matter counters (`total_exchanges`, `last_prompt_time`, the model list).
- **Backfill:** if `Stop` finds a turn whose prompt `UserPromptSubmit` never logged (for example a prompt sent before the hooks existed), it logs that prompt using the transcript timestamp. This is how the setup prompt in this session gets recorded.
- The script never blocks Claude. Errors go to stderr and it always exits 0.

## 3. Canary log paths

- Session 1, this session (`d52d7c42…`): `.agent-logs/2026-10-02_17-39-19_d52d7c42-401d-541c-b94f-0c399add22e4.md`
- Session 2, a new session started with `claude -p --session-id <new uuid>`: `.agent-logs/2026-10-02_17-40-11_f3e7f85d-b795-4bc7-83c0-910f4833fd7d.md`

## 4. Canary entries (raw)

### Second session (`f3e7f85d`)

```
[LOG_ENTRY type=PROMPT num=1 session=f3e7f85d]
timestamp: 2026-10-02T17:40:11.780Z
model: claude-opus-5-5

CAPTURE TEST — 8x assignment, hassixmalik (second session, after model-detection fix). Reply with one short line confirming receipt.


[LOG_ENTRY type=RESPONSE num=1 session=f3e7f85d]
timestamp: 2026-10-02T17:40:13.330Z
model: claude-opus-5-5

I got the capture test (8x assignment, hassixmalik, second session after the model-detection fix).
```

### This session (`d52d7c42`)

The hooks were added partway through this session, and they fire here: `UserPromptSubmit` logged the canary below on its own. The `Stop` hook had already backfilled the setup prompt as entry 2 and logged my reply to it as `RESPONSE num=2`.

```
[LOG_ENTRY type=PROMPT num=3 session=d52d7c42]
timestamp: 2026-10-03T07:08:06.037Z
model: claude-opus-5-5

CAPTURE TEST — 8x assignment, Muhammad Hassan Raza
```

The matching `RESPONSE num=3` is written by the `Stop` hook when this turn ends. That is after this commit, so it is committed with the next turn's work. See the log file.

## 5. What I tried first that didn't work

1. **Headless `claude -p` from inside this session, without isolating it.** The child inherited `CLAUDE_CODE_SESSION_ID`. So it was not a second session. It wrote its prompt into **this** session's transcript, and the hooks logged it under this session's ID (entry 1 in the `d52d7c42` log, with the reply on `claude-sonnet-5-5`). Entry 1 is a test artifact, and I left it in rather than deleting it. Fix: unset `CLAUDE_CODE_SESSION_ID` and `CLAUDE_CODE_CHILD_SESSION` and pass `--session-id <new uuid>`.
2. **Model field on the first prompt of a new session showed `unknown`** (log `b83d7408`). I had assumed the `SessionStart` payload contained `model`. I dumped the payload and it has only `session_id, transcript_path, cwd, scratchpad_dir, source`. Fix: read `--model` from the `claude` process command line (log `f3e7f85d` shows it working). A debug run (`6fac4664`) from that investigation is also kept.
3. **"Last user message in the transcript" is the wrong way to find a turn's prompt.** Because of mistake 1, the transcript holds rows from two writers. Fix: walk the `parentUuid` chain from the final assistant message.

Known limitation: if a prompt contains a line that *starts* with `[LOG_ENTRY type=…]`, the entry counter can misparse it. Indented examples, like the ones in the setup brief, are not affected.
