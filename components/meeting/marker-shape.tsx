import type { MarkerKind } from "./model";

/** Shape carries the type; the single accent colour carries emphasis. */
export function MarkerShape({ kind, size = 12, dim = false }: { kind: MarkerKind; size?: number; dim?: boolean }) {
  const stroke = "var(--accent)";
  const fill = dim ? "color-mix(in oklch, var(--accent) 35%, var(--card))" : "var(--accent)";
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="block overflow-visible">
      {kind === "decision" && <rect x="2.5" y="2.5" width="7" height="7" transform="rotate(45 6 6)" fill={fill} stroke="var(--card)" strokeWidth="1" />}
      {kind === "replaced" && <rect x="2.75" y="2.75" width="6.5" height="6.5" transform="rotate(45 6 6)" fill="var(--card)" stroke={dim ? fill : stroke} strokeWidth="1.5" />}
      {kind === "constraint" && <path d="M6 1.5 L10.8 10 H1.2 Z" fill={fill} stroke="var(--card)" strokeWidth="1" />}
      {kind === "question" && <circle cx="6" cy="6" r="3.6" fill="var(--card)" stroke={dim ? fill : stroke} strokeWidth="1.5" />}
      {kind === "action" && <rect x="2.6" y="2.6" width="6.8" height="6.8" rx="1" fill={dim ? fill : "color-mix(in oklch, var(--accent) 60%, var(--card))"} stroke="var(--card)" strokeWidth="1" />}
    </svg>
  );
}
