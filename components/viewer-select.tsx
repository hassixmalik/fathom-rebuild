"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type Person = { id: string; name: string; role: string | null };

/** "Viewing as" picker. Controlled when given onChange (meeting page); otherwise it rewrites ?as= in the URL (index). */
export function ViewerSelect({ people, value, onChange }: { people: Person[]; value: string | null; onChange?: (v: string | null) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="hidden sm:inline">Viewing as</span>
      <select
        aria-label="Viewing as"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value || null;
          if (onChange) return onChange(v);
          const next = new URLSearchParams(params);
          if (v) next.set("as", v);
          else next.delete("as");
          router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
        }}
        className="h-8 max-w-[52vw] rounded-md border bg-card px-2 text-[13px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Everyone</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.role ? ` · ${p.role}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
