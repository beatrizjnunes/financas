import Link from "next/link";
import { monthLong, nextMonth, prevMonth } from "@/lib/analytics";

/** Seletor de mês por links (?mes=AAAA-MM), limitado aos meses com dados. */
export function MonthPicker({ month, first, last, basePath }: { month: string; first: string; last: string; basePath: string }) {
  const prev = prevMonth(month);
  const next = nextMonth(month);
  const btn = "flex size-8 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink";
  const off = "flex size-8 items-center justify-center rounded-full text-ink-3 opacity-35";
  return (
    <div className="card flex items-center gap-1 rounded-full p-1">
      {prev >= first ? (
        <Link href={`${basePath}?mes=${prev}`} className={btn} aria-label="Mês anterior">
          ‹
        </Link>
      ) : (
        <span className={off}>‹</span>
      )}
      <span className="min-w-32 text-center text-sm font-medium first-letter:uppercase">{monthLong(month)}</span>
      {next <= last ? (
        <Link href={`${basePath}?mes=${next}`} className={btn} aria-label="Mês seguinte">
          ›
        </Link>
      ) : (
        <span className={off}>›</span>
      )}
    </div>
  );
}

export function pickMonth(requested: string | undefined, months: string[]): string {
  if (requested && /^\d{4}-\d{2}$/.test(requested) && months.includes(requested)) return requested;
  return months.at(-1)!;
}
