import { notFound } from "next/navigation";
import { getMeeting } from "@/lib/db";
import { parseTime } from "@/lib/utils";
import { MeetingView } from "@/components/meeting/meeting-view";

export const dynamic = "force-dynamic";

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; e?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const meeting = await getMeeting(id);
  if (!meeting) notFound();
  return <MeetingView meeting={meeting} initialMs={parseTime(sp.t)} initialFocusId={sp.e ?? null} />;
}
