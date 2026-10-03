// Deterministic on server and client (locale/ICU differences would break hydration).
export function formatDate(iso: string) {
  const d = new Date(iso);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${day} ${d.getUTCDate()} ${mon} ${d.getUTCFullYear()}`;
}

/** Meeting length as "15 min" (a bare "15:00" next to a date reads as a time of day). */
export const formatDuration = (ms: number) => `${Math.round(ms / 60000)} min`;
