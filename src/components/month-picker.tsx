import Link from "next/link";
import { monthLong, nextMonth, prevMonth } from "@/lib/analytics";

/** Seletor de mês por links (?mes=AAAA-MM), limitado aos meses com dados. */
export function MonthPicker({ month, first, last, basePath }: { month: string; first: string; last: string; basePath: string }) {
  const prev = prevMonth(month);
  const next = nextMonth(month);
  const btn = "flex size-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 transition hover:border-line-strong hover:text-ink";
  const off = "flex size-8 items-center justify-center rounded-lg border border-line text-ink-3 opacity-40";
  return (
    <div className="flex items-center gap-2">
      {prev >= first ? (
        <Link href={`${basePath}?mes=${prev}`} className={btn} aria-label="Mês anterior">
          ‹
        </Link>
      ) : (
        <span className={off}>‹</span>
      )}
      <span className="min-w-36 text-center text-sm font-medium first-letter:uppercase">{monthLong(month)}</span>
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
