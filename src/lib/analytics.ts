// Agregações para os gráficos. Funções puras sobre movimentos que "contam" (Pessoal + Casal).

import type { Kind } from "./labels";

export type ATx = {
  date: string;
  amountCents: number;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  kind: Kind;
};

export const monthOf = (date: string) => date.slice(0, 7);

export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const monthShort = (month: string) => MONTHS_SHORT[Number(month.slice(5, 7)) - 1];
export const monthLong = (month: string) => `${MONTHS_LONG[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

export type MonthFlow = { month: string; incomeCents: number; spentCents: number; netCents: number; savingsRate: number | null };

/** Entradas, saídas (positivas) e saldo por mês, do mais antigo para o mais recente, sem meses em falta. */
export function monthlyFlow(txs: ATx[]): MonthFlow[] {
  if (!txs.length) return [];
  const by = new Map<string, { inc: number; out: number }>();
  for (const t of txs) {
    const m = monthOf(t.date);
    const cur = by.get(m) ?? { inc: 0, out: 0 };
    if (t.amountCents > 0) cur.inc += t.amountCents;
    else cur.out += -t.amountCents;
    by.set(m, cur);
  }
  const months = [...by.keys()].sort();
  const out: MonthFlow[] = [];
  for (let m = months[0]; m <= months.at(-1)!; m = nextMonth(m)) {
    const { inc, out: spent } = by.get(m) ?? { inc: 0, out: 0 };
    out.push({
      month: m,
      incomeCents: inc,
      spentCents: spent,
      netCents: inc - spent,
      savingsRate: inc > 0 ? (inc - spent) / inc : null,
    });
  }
  return out;
}

export type CategorySpend = { key: string; name: string; cents: number; prevCents: number };

/** Gasto por categoria no mês, com o mês anterior para comparar. Ordenado do maior para o menor. */
export function spendByCategory(txs: ATx[], month: string): CategorySpend[] {
  const prev = prevMonth(month);
  const by = new Map<string, CategorySpend>();
  for (const t of txs) {
    if (t.amountCents >= 0) continue;
    const m = monthOf(t.date);
    if (m !== month && m !== prev) continue;
    const key = t.categoryId ?? "sem";
    const cur = by.get(key) ?? { key, name: t.categoryName ?? "Sem categoria", cents: 0, prevCents: 0 };
    if (m === month) cur.cents += -t.amountCents;
    else cur.prevCents += -t.amountCents;
    by.set(key, cur);
  }
  return [...by.values()].filter((c) => c.cents > 0).sort((a, b) => b.cents - a.cents);
}

export function spendByKind(txs: ATx[], month: string): Record<Kind, number> {
  const out: Record<Kind, number> = { fixa: 0, variavel: 0, pontual: 0 };
  for (const t of txs) if (t.amountCents < 0 && monthOf(t.date) === month) out[t.kind] += -t.amountCents;
  return out;
}

export function topMerchants(txs: ATx[], month: string, n = 6) {
  const by = new Map<string, { name: string; cents: number; count: number }>();
  for (const t of txs) {
    if (t.amountCents >= 0 || monthOf(t.date) !== month) continue;
    const key = t.description.trim().toLowerCase();
    const cur = by.get(key) ?? { name: t.description, cents: 0, count: 0 };
    cur.cents += -t.amountCents;
    cur.count += 1;
    by.set(key, cur);
  }
  return [...by.values()].sort((a, b) => b.cents - a.cents).slice(0, n);
}

/** Gasto acumulado dia a dia (índice 0 = dia 1). */
export function cumulativeByDay(txs: ATx[], month: string): number[] {
  const days = new Array(daysInMonth(month)).fill(0);
  for (const t of txs) {
    if (t.amountCents >= 0 || monthOf(t.date) !== month) continue;
    days[Number(t.date.slice(8, 10)) - 1] += -t.amountCents;
  }
  for (let i = 1; i < days.length; i++) days[i] += days[i - 1];
  return days;
}

export type Insight = { tone: "up" | "down" | "neutral"; text: string };

/** Frases curtas sobre o mês: variações relevantes por categoria e no total. */
export function insights(txs: ATx[], month: string, fmt: (c: number) => string): Insight[] {
  const out: Insight[] = [];
  const flow = monthlyFlow(txs);
  const cur = flow.find((f) => f.month === month);
  const prev = flow.find((f) => f.month === prevMonth(month));
  if (cur && prev && prev.spentCents > 0) {
    const d = (cur.spentCents - prev.spentCents) / prev.spentCents;
    if (Math.abs(d) >= 0.1)
      out.push({
        tone: d > 0 ? "up" : "down",
        text: `Gastaste ${pct(Math.abs(d))} ${d > 0 ? "mais" : "menos"} do que em ${monthLong(prev.month).split(" ")[0]} (${fmt(cur.spentCents)} vs ${fmt(prev.spentCents)}).`,
      });
  }
  const cats = spendByCategory(txs, month)
    .filter((c) => c.key !== "sem" && c.prevCents > 0 && Math.abs(c.cents - c.prevCents) >= 2000)
    .map((c) => ({ ...c, d: (c.cents - c.prevCents) / c.prevCents }))
    .filter((c) => Math.abs(c.d) >= 0.25)
    .sort((a, b) => Math.abs(b.cents - b.prevCents) - Math.abs(a.cents - a.prevCents))
    .slice(0, 3);
  for (const c of cats)
    out.push({
      tone: c.d > 0 ? "up" : "down",
      text: `${c.name}: ${c.d > 0 ? "+" : "−"}${pct(Math.abs(c.d))} face ao mês anterior (${fmt(c.cents)}).`,
    });
  const newCats = spendByCategory(txs, month).filter((c) => c.key !== "sem" && c.prevCents === 0 && c.cents >= 5000);
  for (const c of newCats.slice(0, 2)) out.push({ tone: "neutral", text: `${c.name}: ${fmt(c.cents)} este mês, sem gastos no mês anterior.` });
  const uncategorized = spendByCategory(txs, month).find((c) => c.key === "sem");
  if (uncategorized && cur && uncategorized.cents / Math.max(cur.spentCents, 1) >= 0.1)
    out.push({
      tone: "neutral",
      text: `${pct(uncategorized.cents / cur.spentCents)} dos gastos deste mês estão sem categoria — categoriza-os para estes números serem mais fiéis.`,
    });
  return out;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
