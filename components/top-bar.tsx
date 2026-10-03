import Link from "next/link";
import { AppLogo, indexHref } from "@/components/app-logo";

/** Slim app bar shared by the index and meeting pages: logo, breadcrumb, and a right-hand slot (Viewing as). */
export function TopBar({ viewer, crumb, right }: { viewer: string | null; crumb?: string; right?: React.ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
      <AppLogo viewer={viewer} />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
        <span aria-hidden className="text-border">/</span>
        {crumb ? (
          <>
            <Link href={indexHref(viewer)} className="shrink-0 hover:text-foreground">
              Meetings
            </Link>
            <span aria-hidden className="text-border">/</span>
            <span aria-current="page" className="truncate text-foreground">
              {crumb}
            </span>
          </>
        ) : (
          <span aria-current="page" className="text-foreground">
            Meetings
          </span>
        )}
      </nav>
      <div className="ml-auto shrink-0">{right}</div>
    </div>
  );
}
