import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-lg font-semibold">Meeting not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">The link may be outdated.</p>
      <Link href="/" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
        Back to all meetings
      </Link>
    </main>
  );
}
