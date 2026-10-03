export type Participant = {
  id: string;
  name: string;
  role: string | null;
  quiet: boolean;
  colorIndex: number;
  segmentCount: number;
  wordCount: number;
};

export type Chapter = { id: string; index: number; title: string; startMs: number; endMs: number };

export type Segment = {
  id: string;
  seq: number;
  participantId: string;
  startMs: number;
  endMs: number;
  text: string;
  overlap: boolean;
};

export type ThreadKind = "decision" | "constraint" | "question";

export type ThreadEvent = {
  id: string;
  seq: number;
  kind: string;
  value: string | null;
  /** For valued events: the decision's current value, or one it replaced. */
  state: "current" | "superseded" | "earlier" | null;
  atMs: number;
  by: string;
  claim: string;
  reason: string | null;
  interrupted: boolean;
  relatedThreadId: string | null;
  evidenceSegmentIds: string[];
  reasonSegmentIds: string[];
  affectedParticipantIds: string[];
};

export type LinkRelation = "answers" | "picks_up" | "changes";

/** A cross-meeting link, seen from either end. `focusId` is the event/action to land on in the other meeting. */
export type MeetingLink = {
  direction: "later" | "earlier";
  relation: LinkRelation;
  meetingId: string;
  meetingTitle: string;
  startedAt: string;
  focusId: string;
};

export type Thread = {
  id: string;
  kind: ThreadKind;
  title: string;
  current: string;
  events: ThreadEvent[];
  /** Later meetings that answered / picked up / changed this thread, and earlier threads this one follows up. */
  links: MeetingLink[];
};

export type ActionItem = {
  id: string;
  ownerId: string;
  text: string;
  short: string;
  due: string | null;
  assignedAtMs: number;
  evidenceSegmentIds: string[];
  threadIds: string[];
  affectedParticipantIds: string[];
  links: MeetingLink[];
};

export type Meeting = {
  id: string;
  title: string;
  company: string | null;
  platform: string | null;
  startedAt: string;
  durationMs: number;
  wordCount: number;
  participants: Participant[];
  chapters: Chapter[];
  segments: Segment[];
  threads: Thread[];
  actionItems: ActionItem[];
};

export type MeetingSummary = Pick<Meeting, "id" | "title" | "company" | "platform" | "startedAt" | "durationMs"> & {
  participantNames: string[];
  decisions: number;
  changedDecisions: number;
  openQuestions: number;
  actionItems: number;
};
