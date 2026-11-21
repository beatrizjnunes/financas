// Duplicados "prováveis": movimentos que não são exatamente iguais a um já gravado (o hash é
// diferente), mas que têm o mesmo valor à mesma hora — ex.: o banco mudou a descrição entre
// exportações, ou o mesmo pagamento foi importado na conta errada.

export type DuplicateCandidate = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  accountName: string;
};

/** Com hora nos dois: até 15 min de diferença. Sem hora (00:00:00) num deles: até 1 dia. */
const MAX_MINUTES_WITH_TIME = 15;
const MAX_DAYS_WITHOUT_TIME = 1;

const hasTime = (date: string) => date.length >= 19 && date.slice(11, 19) !== "00:00:00";

function toMinutes(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const [hh = 0, mm = 0] = date.slice(11, 16).split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) / 60_000;
}

export function looksLikeSameTransaction(
  a: { date: string; amountCents: number },
  b: { date: string; amountCents: number },
) {
  if (a.amountCents !== b.amountCents) return false;
  const diff = Math.abs(toMinutes(a.date) - toMinutes(b.date));
  return hasTime(a.date) && hasTime(b.date) ? diff <= MAX_MINUTES_WITH_TIME : diff <= MAX_DAYS_WITHOUT_TIME * 24 * 60;
}

/** O movimento já gravado mais próximo no tempo que parece ser o mesmo, ou null. */
export function findPossibleDuplicate<T extends DuplicateCandidate>(
  row: { date: string; amountCents: number },
  existing: T[],
): T | null {
  let best: T | null = null;
  for (const e of existing) {
    if (!looksLikeSameTransaction(row, e)) continue;
    if (
      !best ||
      Math.abs(toMinutes(e.date) - toMinutes(row.date)) < Math.abs(toMinutes(best.date) - toMinutes(row.date))
    ) {
      best = e;
    }
  }
  return best;
}

/** Intervalo de datas a pedir à BD para comparar um ficheiro inteiro. */
export function candidateWindow(dates: string[]): { from: string; to: string } {
  const sorted = [...dates].sort();
  const shift = (date: string, days: number) => {
    const [y, m, d] = date.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  };
  return {
    from: shift(sorted[0], -MAX_DAYS_WITHOUT_TIME),
    to: `${shift(sorted.at(-1)!, MAX_DAYS_WITHOUT_TIME)} 23:59:59`,
  };
}
