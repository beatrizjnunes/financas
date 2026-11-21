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

/** Os `n` meses anteriores a `month` (do mais antigo para o mais recente), sem recuar antes de `first`. */
export function monthsBefore(month: string, n: number, first?: string): string[] {
  const out: string[] = [];
  for (let m = prevMonth(month), i = 0; i < n; i++, m = prevMonth(m)) {
    if (first && m < first) break;
    out.unshift(m);
  }
  return out;
}

export type CategoryAverage = { key: string; name: string; avgCents: number };

/**
 * Gasto médio mensal por categoria nos `n` meses anteriores a `month` (só conta meses dentro do
 * período com dados, para não diluir a média com meses em que ainda não havia extratos).
 */
export function averageByCategory(txs: ATx[], month: string, n = 3): Map<string, CategoryAverage> {
  const first = txs.length ? monthOf(txs[0].date) : month;
  const window = new Set(monthsBefore(month, n, first));
  const out = new Map<string, CategoryAverage>();
  if (!window.size) return out;
  for (const t of txs) {
    if (t.amountCents >= 0 || !window.has(monthOf(t.date))) continue;
    const key = t.categoryId ?? "sem";
    const cur = out.get(key) ?? { key, name: t.categoryName ?? "Sem categoria", avgCents: 0 };
    cur.avgCents += -t.amountCents;
    out.set(key, cur);
  }
  for (const c of out.values()) c.avgCents = Math.round(c.avgCents / window.size);
  return out;
}

/** Arredonda um valor sugerido para cima, a múltiplos de 5 €. */
export const roundUpToFive = (cents: number) => Math.ceil(cents / 500) * 500;

export type BudgetLine = {
  key: string;
  name: string;
  budgetCents: number | null;
  spentCents: number;
  avgCents: number;
  /** Gasto previsto no fim do mês, ao ritmo atual (só no mês corrente). */
  projectedCents: number | null;
  status: "sem" | "ok" | "atencao" | "excedido";
};

/**
 * Estado de cada orçamento. "atenção" quando já se gastou ≥ 85% ou a previsão passa o limite;
 * "excedido" quando o gasto já o ultrapassou.
 */
export function budgetLines(
  txs: ATx[],
  month: string,
  categories: { id: string; name: string }[],
  budgets: Map<string, number>,
  progress: { day: number; days: number } | null,
): BudgetLine[] {
  const split = spendSplit(txs, month);
  const avg = averageByCategory(txs, month);
  return categories.map((c) => {
    const budgetCents = budgets.get(c.id) ?? null;
    const s = split.get(c.id) ?? { steady: 0, variable: 0 };
    const spentCents = s.steady + s.variable;
    const projectedCents = progress ? project(s, progress) : null;
    return {
      key: c.id,
      name: c.name,
      budgetCents,
      spentCents,
      avgCents: avg.get(c.id)?.avgCents ?? 0,
      projectedCents,
      status: budgetStatus(spentCents, budgetCents, projectedCents),
    };
  });
}

/** "excedido" se já passou o limite; "atenção" se a previsão do mês o passa; senão "ok". */
export function budgetStatus(spent: number, budget: number | null, projected: number | null): BudgetLine["status"] {
  if (budget == null) return "sem";
  if (spent > budget) return "excedido";
  if (projected != null && projected > budget) return "atencao";
  return "ok";
}

type Split = { steady: number; variable: number };

/**
 * Gasto do mês por categoria, separado em "certo" (fixas e pontuais, que não se repetem ao longo do mês)
 * e variável (que se pode extrapolar pelo ritmo diário).
 */
export function spendSplit(txs: ATx[], month: string): Map<string, Split> {
  const out = new Map<string, Split>();
  for (const t of txs) {
    if (t.amountCents >= 0 || monthOf(t.date) !== month) continue;
    const key = t.categoryId ?? "sem";
    const cur = out.get(key) ?? { steady: 0, variable: 0 };
    if (t.kind === "variavel") cur.variable += -t.amountCents;
    else cur.steady += -t.amountCents;
    out.set(key, cur);
  }
  return out;
}

/** Previsão para o fim do mês: o que é certo fica igual, o variável segue o ritmo diário. */
export const project = (s: Split, p: { day: number; days: number }) => s.steady + Math.round((s.variable / Math.max(p.day, 1)) * p.days);

/** Previsão do gasto total do mês (null se o mês já fechou ou ainda vai no início). */
export function projectMonth(txs: ATx[], month: string, p: { day: number; days: number } | null): number | null {
  if (!p || p.day <= 3) return null;
  let steady = 0;
  let variable = 0;
  for (const s of spendSplit(txs, month).values()) {
    steady += s.steady;
    variable += s.variable;
  }
  return project({ steady, variable }, p);
}

export type Recurring = {
  key: string;
  name: string;
  categoryName: string | null;
  monthlyCents: number;
  annualCents: number;
  months: number;
  lastDate: string;
};

/** Normaliza descrições para agrupar o mesmo comerciante: sem números, pontuação nem espaços repetidos. */
export const merchantKey = (d: string) =>
  d
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0-9*#/\\.,:;_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * Despesas que se repetem todos os meses com valor parecido (subscrições, renda, ginásio, seguros…).
 * Olha para os 6 meses até `month`: o comerciante tem de aparecer em ≥ 3 meses, no máximo ~1 vez por mês,
 * com ≥ 75% dos meses a ±25% da mediana, e ainda estar ativo (visto neste mês ou no anterior).
 */
/** Categorias de compras do dia a dia: um supermercado ir 1×/mês com valores parecidos não é uma subscrição. */
const NOT_RECURRING = new Set(["Supermercado", "Restaurantes", "Cafés e snacks", "Transferências"]);

export function recurringExpenses(txs: ATx[], month: string): Recurring[] {
  const window = new Set([...monthsBefore(month, 5), month]);
  const groups = new Map<string, { name: string; cat: string | null; byMonth: Map<string, number>; count: number; last: string }>();
  for (const t of txs) {
    if (t.amountCents >= 0 || (t.categoryName && NOT_RECURRING.has(t.categoryName))) continue;
    const m = monthOf(t.date);
    if (!window.has(m)) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    const g = groups.get(key) ?? { name: t.description, cat: t.categoryName, byMonth: new Map(), count: 0, last: "" };
    g.byMonth.set(m, (g.byMonth.get(m) ?? 0) + -t.amountCents);
    g.count += 1;
    if (t.date >= g.last) {
      g.last = t.date;
      g.name = t.description;
      g.cat = t.categoryName;
    }
    groups.set(key, g);
  }
  const out: Recurring[] = [];
  for (const [key, g] of groups) {
    const vals = [...g.byMonth.values()];
    if (vals.length < 3 || g.count / vals.length > 1.5) continue;
    if (monthOf(g.last) < prevMonth(month)) continue;
    const med = median(vals);
    const steady = vals.filter((v) => Math.abs(v - med) <= med * 0.25).length / vals.length;
    if (steady < 0.75) continue;
    out.push({ key, name: g.name, categoryName: g.cat, monthlyCents: med, annualCents: med * 12, months: vals.length, lastDate: g.last });
  }
  return out.sort((a, b) => b.monthlyCents - a.monthlyCents);
}

/** N.º de meses de `from` até `to` (ex.: 2026-11 → 2027-06 = 7). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export type GoalPlan = { ratio: number; remainingCents: number; monthsLeft: number | null; perMonthCents: number | null; done: boolean; late: boolean };

/** Progresso de um objetivo e quanto falta poupar por mês para chegar a tempo. */
export function goalPlan(g: { targetCents: number; savedCents: number; targetMonth: string | null }, currentMonth: string): GoalPlan {
  const remainingCents = Math.max(0, g.targetCents - g.savedCents);
  const done = remainingCents === 0;
  const monthsLeft = g.targetMonth ? monthsBetween(currentMonth, g.targetMonth) : null;
  const late = !done && monthsLeft != null && monthsLeft <= 0;
  const perMonthCents = done || monthsLeft == null ? null : Math.ceil(remainingCents / Math.max(monthsLeft, 1));
  return { ratio: g.targetCents > 0 ? Math.min(g.savedCents / g.targetCents, 1) : 0, remainingCents, monthsLeft, perMonthCents, done, late };
}

/** Se `month` é o mês corrente, devolve o dia de hoje e o n.º de dias do mês; senão null (mês fechado). */
export function monthProgress(month: string, now = new Date()): { day: number; days: number } | null {
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return month === cur ? { day: now.getDate(), days: daysInMonth(month) } : null;
}

/** Categorias que fazem sentido orçamentar (sem receitas nem transferências). */
export function expenseCategories<T extends { name: string; groupName: string }>(cats: T[]): T[] {
  return cats.filter((c) => c.groupName !== "Receitas" && c.name !== "Transferências");
}

/** Média de gasto mensal nos `n` meses completos anteriores a `month` (null se não houver nenhum). */
export function averageMonthlySpend(flow: MonthFlow[], month: string, n = 3): number | null {
  const months = new Set(monthsBefore(month, n));
  const xs = flow.filter((f) => months.has(f.month));
  if (!xs.length) return null;
  return Math.round(xs.reduce((s, f) => s + f.spentCents, 0) / xs.length);
}
