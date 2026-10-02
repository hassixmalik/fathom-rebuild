#!/usr/bin/env python3
"""Append-only prompt/response capture for Claude Code -> .agent-logs/.

Wired in .claude/settings.json:
  SessionStart      -> remember the session's model (prompt entries need it before any reply exists)
  UserPromptSubmit  -> log PROMPT verbatim from the hook payload
  Stop              -> log the final assistant text of the turn, read from the transcript
Never blocks Claude: every failure is swallowed and exits 0.
"""
import datetime, glob, json, os, re, sys, tempfile, time

AUTHOR = "hassixmalik"
PROJECT = "fathom-rebuild"
TOOL = "claude-code"
STATE_DIR = os.path.join(tempfile.gettempdir(), "agent-capture")


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def log_dir(payload):
    root = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    d = os.path.join(root, ".agent-logs")
    os.makedirs(d, exist_ok=True)
    return d


def read_transcript(path):
    rows = []
    try:
        with open(path) as f:
            for line in f:
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
    except OSError:
        pass
    return rows


def is_real_prompt(r):
    if r.get("type") != "user" or r.get("isMeta") or r.get("isSidechain"):
        return False
    c = (r.get("message") or {}).get("content")
    if isinstance(c, str):
        return True
    return isinstance(c, list) and any(b.get("type") == "text" for b in c) and not any(
        b.get("type") == "tool_result" for b in c)


def prompt_text(r):
    c = r["message"]["content"]
    return c if isinstance(c, str) else "\n".join(b.get("text", "") for b in c if b.get("type") == "text")


def last_model(rows):
    for r in reversed(rows):
        m = (r.get("message") or {}).get("model") if r.get("type") == "assistant" else None
        if m and m != "<synthetic>":
            return m
    return None


def session_model(sid, rows):
    m = last_model(rows)
    if m:
        return m
    try:
        with open(os.path.join(STATE_DIR, sid + ".model")) as f:
            return f.read().strip() or "unknown"
    except OSError:
        return configured_model() or "unknown"


def configured_model():
    """Model before any reply exists: --model on the claude process, else env, else settings."""
    pid = os.getppid()
    for _ in range(6):
        try:
            with open("/proc/%d/cmdline" % pid, "rb") as f:
                args = f.read().decode(errors="replace").split("\0")
            for i, a in enumerate(args):
                if a == "--model" and i + 1 < len(args):
                    return args[i + 1]
                if a.startswith("--model="):
                    return a.split("=", 1)[1]
            with open("/proc/%d/stat" % pid) as f:
                pid = int(f.read().rsplit(")", 1)[1].split()[1])
        except (OSError, ValueError, IndexError):
            break
    if os.environ.get("ANTHROPIC_MODEL"):
        return os.environ["ANTHROPIC_MODEL"]
    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    for sp in (os.path.join(root, ".claude/settings.local.json"), os.path.join(root, ".claude/settings.json"),
               os.path.expanduser("~/.claude/settings.json")):
        try:
            with open(sp) as f:
                m = json.load(f).get("model")
            if m:
                return m
        except (OSError, ValueError):
            pass
    return None


def session_file(d, sid, first_time):
    hits = glob.glob(os.path.join(d, "*_%s.md" % sid))
    if hits:
        return hits[0]
    ts = datetime.datetime.strptime(first_time[:19], "%Y-%m-%dT%H:%M:%S")
    return os.path.join(d, "%s_%s.md" % (ts.strftime("%Y-%m-%d_%H-%M-%S"), sid))


ENTRY_RE = re.compile(r"^\[LOG_ENTRY type=(PROMPT|RESPONSE) num=(\d+) session=\S+\]\ntimestamp: (\S+)", re.M)


def append(path, sid, kind, num, ts, model, body):
    short = sid[:8]
    existing = ""
    if os.path.exists(path):
        with open(path) as f:
            existing = f.read()
    body_start = existing.find("\n---\n\n[LOG_ENTRY")
    entries = existing[body_start + len("\n---\n\n"):] if body_start != -1 else ""
    entries += "[LOG_ENTRY type=%s num=%d session=%s]\ntimestamp: %s\nmodel: %s\n\n%s\n\n\n" % (
        kind, num, short, ts, model, body.rstrip("\n"))
    prompts = [m for m in ENTRY_RE.finditer(entries) if m.group(1) == "PROMPT"]
    first, last = prompts[0].group(3), prompts[-1].group(3)
    models = []
    for m in re.findall(r"^model: (\S+)$", entries, re.M):
        if m not in models:
            models.append(m)
    header = (
        "---\nsession_id: %s\ndate: %s\nauthor: %s\nmodel: %s\ntool: %s\nproject: %s\n"
        "total_exchanges: %d\nfirst_prompt_time: %s\nlast_prompt_time: %s\n---\n\n"
        "# Session Log - %s\n\nSession: `%s` | Project: `%s` | Author: `%s`\n\n---\n\n"
    ) % (sid, first[:10], AUTHOR, ", ".join(models), TOOL, PROJECT, len(prompts), first, last,
         first[:10], short, PROJECT, AUTHOR)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(header + entries)
    os.replace(tmp, path)


def last_entry(path):
    if not os.path.exists(path):
        return None, 0
    with open(path) as f:
        found = ENTRY_RE.findall(f.read())
    return (found[-1][0], int(found[-1][1])) if found else (None, 0)


def on_session_start(p):
    if p.get("model"):
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(os.path.join(STATE_DIR, p["session_id"] + ".model"), "w") as f:
            f.write(p["model"] if isinstance(p["model"], str) else json.dumps(p["model"]))


def on_prompt(p):
    sid, ts = p["session_id"], now_iso()
    model = session_model(sid, read_transcript(p.get("transcript_path", "")))
    path = session_file(log_dir(p), sid, ts)
    _, n = last_entry(path)
    append(path, sid, "PROMPT", n + 1, ts, model, p.get("prompt", ""))


def on_stop(p):
    sid = p["session_id"]
    rows = []
    # The transcript can lag the Stop event slightly; wait for the turn's final assistant text.
    for _ in range(10):
        rows = read_transcript(p.get("transcript_path", ""))
        tail = [r for r in rows if r.get("type") in ("user", "assistant") and not r.get("isSidechain")]
        if tail and tail[-1]["type"] == "assistant" and any(
                b.get("type") == "text" for b in (tail[-1]["message"].get("content") or [])):
            break
        time.sleep(0.3)
    # Walk the parentUuid chain back from the final reply to this turn's prompt. Robust even when
    # another process appends to the same transcript (rows are not guaranteed contiguous).
    by_uuid = {r["uuid"]: r for r in rows if r.get("uuid")}
    last = next((r for r in reversed(rows) if r.get("type") == "assistant" and not r.get("isSidechain")), None)
    chain, prompt, r = [], None, last
    while r is not None:
        if is_real_prompt(r):
            prompt = r
            break
        chain.append(r)
        r = by_uuid.get(r.get("parentUuid"))
    chain.reverse()
    # Final response = assistant text emitted after the last tool round-trip of the turn.
    last_tool = max((i for i, r in enumerate(chain) if r.get("type") == "user"), default=-1)
    texts, ts, model = [], None, None
    for r in chain[last_tool + 1:]:
        if r.get("type") != "assistant":
            continue
        for b in r["message"].get("content") or []:
            if b.get("type") == "text" and b.get("text", "").strip():
                texts.append(b["text"])
                ts, model = r.get("timestamp"), r["message"].get("model")
    model = model or session_model(sid, rows)
    path = session_file(log_dir(p), sid, (prompt or {}).get("timestamp") or now_iso())
    kind, n = last_entry(path)
    if prompt is not None and (kind != "PROMPT" or last_prompt_body(path) != prompt_text(prompt).rstrip("\n")):
        # UserPromptSubmit did not record this turn (e.g. prompt sent before the hook existed): backfill it.
        n += 1
        append(path, sid, "PROMPT", n, prompt.get("timestamp") or now_iso(),
               session_model(sid, rows[:rows.index(prompt)]), prompt_text(prompt))
    append(path, sid, "RESPONSE", max(n, 1), ts or now_iso(), model,
           "\n\n".join(texts) if texts else "(no text response captured)")


def last_prompt_body(path):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        parts = re.split(r"^\[LOG_ENTRY type=(PROMPT|RESPONSE) num=\d+ session=\S+\]\n", f.read(), flags=re.M)
    for i in range(len(parts) - 2, 0, -2):
        if parts[i] == "PROMPT":
            return parts[i + 1].split("\n\n", 1)[1].rstrip("\n")
    return None


def main():
    try:
        p = json.load(sys.stdin)
        {"SessionStart": on_session_start, "UserPromptSubmit": on_prompt, "Stop": on_stop}.get(
            p.get("hook_event_name"), lambda _: None)(p)
    except Exception as e:  # never break the session
        sys.stderr.write("agent_capture: %r\n" % e)
    sys.exit(0)


if __name__ == "__main__":
    main()
