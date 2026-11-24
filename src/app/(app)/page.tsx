import type { Metadata } from "next";
import Link from "next/link";
import {
  averageByCategory,
  averageMonthlySpend,
  budgetLines,
  expenseCategories,
  goalPlan,
  insights,
  monthLong,
  monthlyFlow,
  monthProgress,
  monthsBefore,
  pct,
  prevMonth,
  projectMonth,
  recurringExpenses,
  roundUpToFive,
  spendByCategory,
} from "@/lib/analytics";
import { formatDate, formatEUR } from "@/lib/format";
import { coupleBalance } from "@/lib/split";
import { requireUser } from "@/server/auth";
import {
  countSuspended,
  countToReview,
  coupleSettlements,
  coupleTransactions,
  listCategories,
  listPeople,
  myBalances,
  myBudgets,
  myCountedTransactions,
  myGoals,
  myInvestments,
  myRecentTransactions,
} from "@/server/data";
import { BudgetBar, Card, CardLink, CategoryBars, EmptyState, Gauge, PageHeader, Sparkbars, StatTile } from "@/components/charts";
import { Icon } from "@/components/icons";
import { LoadDemoButton } from "@/components/demo-banner";
import { MonthPicker, pickMonth } from "@/components/month-picker";

export const metadata: Metadata = { title: "Resumo" };

const change = (cur: number, ref: number | null | undefined) => (ref ? (cur - ref) / ref : null);
const arrow = (d: number) => `${d >= 0 ? "▲" : "▼"} ${pct(Math.abs(d))}`;

export default async function ResumoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const monthOfToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [txs, categories, budgets, balances, toReview, suspended, recent, people, coupleTx, investments, goals] = await Promise.all([
    myCountedTransactions(user.id),
    listCategories(),
    myBudgets(user.id),
    myBalances(user.id),
    countToReview(user.id),
    countSuspended(user.id),
    myRecentTransactions(user.id),
    listPeople(),
    coupleTransactions(),
    myInvestments(user.id),
    myGoals(user.id),
  ]);

  const greeting = `Olá, ${user.displayName}!`;
  if (!txs.length) {
    return (
      <div>
        <PageHeader title={greeting} subtitle="Começa por importar um extrato." />
        <EmptyState
          title="Ainda não há movimentos"
          text="Importa o extrato de uma conta em CSV. Revês tudo antes de gravar e o resumo aparece aqui."
          href="/importar"
          cta="Importar o primeiro extrato"
        />
        <div className="mt-4 text-center">
          <LoadDemoButton />
          <p className="mt-2 text-xs text-ink-3">Cria 8 meses de movimentos inventados para os dois. Apagas tudo com um clique.</p>
        </div>
      </div>
    );
  }

  const flow = monthlyFlow(txs);
  const months = flow.map((f) => f.month);
  const month = pickMonth(sp.mes, months);
  const cur = flow.find((f) => f.month === month)!;
  const before = flow.find((f) => f.month === prevMonth(month));
  const progress = monthProgress(month);
  const avgSpend = averageMonthlySpend(flow, month);
  const spark = [...monthsBefore(month, 5, months[0]), month].map((m) => flow.find((f) => f.month === m)?.spentCents ?? 0);
  const projected = projectMonth(txs, month, progress);

  // Orçamentos
  const expenseCats = expenseCategories(categories);
  const lines = budgetLines(txs, month, expenseCats, budgets, progress).filter((l) => l.budgetCents != null);
  const totalBudget = lines.reduce((s, l) => s + l.budgetCents!, 0);
  const spentBudgeted = lines.reduce((s, l) => s + l.spentCents, 0);
  const atRisk = lines.filter((l) => l.status === "excedido" || l.status === "atencao").sort((a, b) => b.spentCents / b.budgetCents! - a.spentCents / a.budgetCents!);
  const avgByCat = averageByCategory(txs, month);
  const suggestedTotal = expenseCats.reduce((s, c) => s + (avgByCat.get(c.id) ? roundUpToFive(avgByCat.get(c.id)!.avgCents) : 0), 0);
  const daysLeft = progress ? progress.days - progress.day + 1 : 0;

  // Reserva
  const withBalance = balances.filter((b) => b.balanceCents != null);
  const totalBalance = withBalance.reduce((s, b) => s + b.balanceCents!, 0);
  const investedValue = investments.reduce((s, i) => s + i.valueCents, 0);
  const topGoal = goals
    .map((g) => ({ ...g, plan: goalPlan(g, monthOfToday) }))
    .filter((g) => !g.plan.done)
    .sort((a, b) => (a.targetMonth ?? "9999").localeCompare(b.targetMonth ?? "9999"))[0];
  const runway = avgSpend && avgSpend > 0 ? totalBalance / avgSpend : null;

  // Outros
  const cats = spendByCategory(txs, month).slice(0, 5);
  const recurring = recurringExpenses(txs, month);
  const recurringMonthly = recurring.reduce((s, r) => s + r.monthlyCents, 0);
  const notes = insights(txs, month, (c) => formatEUR(c));

  let couple: React.ReactNode = null;
  if (people.length === 2 && coupleTx.length) {
    const [a, b] = people;
    const bal = coupleBalance(coupleTx, { id: a.id, name: a.name }, { id: b.id, name: b.name }, 0.5, await coupleSettlements(a.id, b.id));
    couple = !bal.debt ? (
      "Estão quites."
    ) : bal.debt.from.id === user.id ? (
      <>
        Deves <b className="num">{formatEUR(bal.debt.cents)}</b> a {bal.debt.to.name}.
      </>
    ) : (
      <>
        {bal.debt.from.name} deve-te <b className="num">{formatEUR(bal.debt.cents)}</b>.
      </>
    );
  }

  const spentChange = change(cur.spentCents, avgSpend);
  const incomeChange = change(cur.incomeCents, before?.incomeCents);
  const range = `de=${month}-01&ate=${month}-31`;

  return (
    <div>
      <PageHeader title={greeting} subtitle={`Como estão as tuas finanças em ${monthLong(month)}.`}>
        <MonthPicker month={month} first={months[0]} last={months.at(-1)!} basePath="/" />
      </PageHeader>

      {/* Indicadores */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile
          label={progress ? "Gasto até hoje" : "Gasto no mês"}
          value={formatEUR(cur.spentCents)}
          delta={spentChange != null && !progress ? `${arrow(spentChange)} vs média` : null}
          deltaGood={spentChange != null && !progress ? spentChange <= 0 : null}
        >
          <Sparkbars values={spark} />
        </StatTile>
        <StatTile
          label="Entradas"
          value={formatEUR(cur.incomeCents)}
          delta={incomeChange != null ? `${arrow(incomeChange)} vs mês anterior` : null}
          deltaGood={incomeChange != null ? incomeChange >= 0 : null}
        />
        <StatTile
          label="Poupado"
          value={formatEUR(cur.netCents, { sign: cur.netCents > 0 })}
          delta={cur.savingsRate != null ? `Taxa de ${pct(cur.savingsRate)}` : "Sem entradas"}
          deltaGood={cur.savingsRate != null ? cur.savingsRate >= 0.1 : null}
        />
        {projected != null ? (
          <StatTile
            tone="accent"
            label="Previsão para o mês"
            value={formatEUR(projected)}
            delta={avgSpend ? `${projected > avgSpend ? "acima" : "abaixo"} da média (${formatEUR(avgSpend)})` : `≈ ${formatEUR(cur.spentCents / progress!.day)}/dia`}
          />
        ) : (
          <StatTile
            tone="accent"
            label="Média de gastos (3 meses)"
            value={avgSpend != null ? formatEUR(avgSpend) : "—"}
            delta={avgSpend != null ? `≈ ${formatEUR(avgSpend * 12)}/ano` : "Ainda sem histórico"}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-4">
        {/* Orçamento */}
        <Card title="Orçamento do mês" action={<CardLink href="/orcamentos">{lines.length ? "Gerir" : "Criar"}</CardLink>}>
          {lines.length ? (
            <>
              <Gauge ratio={spentBudgeted / Math.max(totalBudget, 1)} label={pct(spentBudgeted / Math.max(totalBudget, 1))} sub={`${formatEUR(spentBudgeted)} de ${formatEUR(totalBudget)}`} />
              <p className="mt-4 text-center text-sm text-ink-2">
                {spentBudgeted > totalBudget ? (
                  <>
                    Passaste o orçamento em <b className="num text-danger">{formatEUR(spentBudgeted - totalBudget)}</b>.
                  </>
                ) : progress ? (
                  <>
                    Podes gastar <b className="num text-ink">{formatEUR((totalBudget - spentBudgeted) / daysLeft)}</b> por dia até ao fim do mês.
                  </>
                ) : (
                  <>
                    Sobraram <b className="num text-ink">{formatEUR(totalBudget - spentBudgeted)}</b> do orçamento.
                  </>
                )}
              </p>
              {atRisk.length > 0 && (
                <ul className="mt-4 space-y-3 border-t border-line pt-4">
                  {atRisk.slice(0, 3).map((l) => (
                    <li key={l.key}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate">{l.name}</span>
                        <span className={`chip ${l.status === "excedido" ? "chip-neg" : "chip-warn"}`}>
                          {l.status === "excedido" ? `+${formatEUR(l.spentCents - l.budgetCents!)}` : `${pct(l.spentCents / l.budgetCents!)}`}
                        </span>
                      </div>
                      <BudgetBar spent={l.spentCents} budget={l.budgetCents!} projected={l.projectedCents} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col">
              <p className="text-sm text-ink-2">
                Define um limite por categoria e a app avisa-te quando estiveres a chegar lá.
                {suggestedTotal > 0 && (
                  <>
                    {" "}
                    Pela tua média dos últimos meses, um orçamento realista seria cerca de <b className="num text-ink">{formatEUR(suggestedTotal)}</b>/mês.
                  </>
                )}
              </p>
              <Link href="/orcamentos" className="btn-soft mt-5 self-start">
                Criar orçamentos <Icon name="arrowRight" className="size-4" />
              </Link>
            </div>
          )}
        </Card>

        {/* Onde gastaste */}
        <Card title="Onde gastaste" subtitle="Comparado com a tua média de 3 meses" action={<CardLink href={`/analise?mes=${month}`}>Análise</CardLink>}>
          {cats.length ? (
            <CategoryBars
              color="var(--series-1)"
              prevLabel="média 3 meses"
              items={cats.map((c) => ({
                key: c.key,
                label: c.name,
                cents: c.cents,
                prevCents: avgByCat.size ? (avgByCat.get(c.key)?.avgCents ?? 0) : undefined,
                href: `/movimentos?categoria=${c.key}&${range}&ambito=contam`,
              }))}
            />
          ) : (
            <p className="text-sm text-ink-3">Sem despesas neste mês.</p>
          )}
        </Card>

        {/* Património */}
        <Card title="Património" subtitle="Contas e investimentos" action={<CardLink href="/patrimonio">Gerir</CardLink>}>
          {withBalance.length || investedValue > 0 ? (
            <>
              <p className="num text-3xl font-semibold tracking-tight">{formatEUR(totalBalance + investedValue)}</p>
              <p className="num mt-1 text-xs text-ink-3">
                {formatEUR(totalBalance)} em contas{investedValue > 0 && <> · {formatEUR(investedValue)} investidos</>}
              </p>
              {runway != null && (
                <p className="mt-2 text-sm text-ink-2">
                  <span className={`chip mr-1.5 ${runway >= 6 ? "chip-pos" : runway >= 3 ? "chip-warn" : "chip-neg"}`}>
                    <Icon name="shield" className="size-3" /> {runway.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} meses
                  </span>
                  de despesas com o dinheiro das contas.
                  <span className="mt-1 block text-xs text-ink-3">
                    {runway >= 6 ? "Boa reserva de emergência." : runway >= 3 ? "O habitual é ter entre 3 e 6 meses de reserva." : "Abaixo dos 3 meses recomendados para emergências."}
                  </span>
                </p>
              )}
              <ul className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
                {withBalance.map((b) => (
                  <li key={b.accountId} className="flex items-baseline gap-2">
                    <span>{b.name}</span>
                    <span className="text-xs text-ink-3">
                      {b.source === "manual" ? "atualizado" : "extrato"} a {formatDate(b.date!).slice(0, 5)}
                    </span>
                    <span className="num ml-auto font-medium">{formatEUR(b.balanceCents!)}</span>
                  </li>
                ))}
              </ul>
              {topGoal && (
                <div className="mt-4 border-t border-line pt-4">
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="truncate">🎯 {topGoal.name}</span>
                    <span className="num text-xs text-ink-3">{pct(topGoal.plan.ratio)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${topGoal.plan.ratio * 100}%` }} />
                  </div>
                  {topGoal.plan.perMonthCents != null && (
                    <p className="num mt-1 text-xs text-ink-3">Poupa {formatEUR(topGoal.plan.perMonthCents)}/mês para chegar a tempo.</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div>
              <p className="text-sm text-ink-3">Escreve o saldo atual de cada conta e os teus investimentos para veres quanto tens no total.</p>
              <Link href="/patrimonio" className="btn-soft mt-4">
                Adicionar saldos <Icon name="arrowRight" className="size-4" />
              </Link>
            </div>
          )}
        </Card>

        {/* O que mudou */}
        <Card title="O que mudou" subtitle="Variações que merecem atenção" className="lg:col-span-2">
          {notes.length || recurring.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {notes.map((n) => (
                <li key={n.text} className="flex gap-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
                  <span className={`mt-0.5 shrink-0 ${n.tone === "up" ? "text-danger" : n.tone === "down" ? "text-pos" : "text-ink-3"}`} aria-hidden>
                    {n.tone === "up" ? "↗" : n.tone === "down" ? "↘" : "•"}
                  </span>
                  <span className="text-ink-2">{n.text}</span>
                </li>
              ))}
              {recurring.length > 0 && (
                <li className="flex gap-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
                  <Icon name="repeat" className="mt-0.5 size-4 shrink-0 text-ink-3" />
                  <span className="text-ink-2">
                    Tens {recurring.length} {recurring.length === 1 ? "despesa recorrente" : "despesas recorrentes"} que somam{" "}
                    <b className="num text-ink">{formatEUR(recurringMonthly)}</b>/mês ({formatEUR(recurringMonthly * 12)}/ano).
                  </span>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">Nada fora do normal este mês.</p>
          )}
        </Card>

        {/* Ações e casal */}
        <div className="grid gap-3 lg:gap-4">
          {toReview + suspended > 0 ? (
            <section className="card flex flex-col items-center px-6 py-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-review-bg text-review-ink">
                <Icon name="list" />
              </span>
              <p className="mt-3 font-semibold">
                {toReview > 0 ? `${toReview} ${toReview === 1 ? "movimento" : "movimentos"} por rever` : `${suspended} possíveis duplicados`}
              </p>
              <p className="mt-0.5 text-sm text-ink-3">Confirma as categorias para os números serem fiéis.</p>
              <Link href={toReview > 0 ? "/movimentos?rever=1" : "/movimentos?suspensos=1"} className="btn-primary mt-4">
                Rever agora
              </Link>
            </section>
          ) : (
            <section className="card flex items-center gap-3 px-5 py-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-pos-bg text-pos">
                <Icon name="check" />
              </span>
              <p className="text-sm">
                <b className="font-semibold">Tudo revisto.</b> <span className="text-ink-3">Os números estão atualizados.</span>
              </p>
            </section>
          )}
          {couple && (
            <section className="card px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-ink-3">Saldo partilhado</p>
                <CardLink href="/partilhado">Ver</CardLink>
              </div>
              <p className="mt-1 text-[15px]">{couple}</p>
            </section>
          )}
        </div>

        {/* Recorrentes */}
        <Card
          title="Despesas recorrentes"
          subtitle="Pagamentos que se repetem todos os meses — bons candidatos a rever"
          action={<CardLink href={`/analise?mes=${month}#recorrentes`}>Ver todas</CardLink>}
          className="lg:col-span-2"
        >
          {recurring.length ? (
            <ul className="divide-y divide-line">
              {recurring.slice(0, 5).map((r) => (
                <li key={r.key} className="flex items-center gap-3 py-2.5 text-sm first:pt-0">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                    <Icon name="repeat" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="truncate text-xs text-ink-3">{r.categoryName ?? "Sem categoria"} · {r.months} meses seguidos</p>
                  </div>
                  <div className="text-right">
                    <p className="num font-medium">{formatEUR(r.monthlyCents)}</p>
                    <p className="num text-xs text-ink-3">{formatEUR(r.annualCents)}/ano</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">Ainda não há meses suficientes para detetar pagamentos recorrentes (são precisos 3).</p>
          )}
        </Card>

        {/* Últimos movimentos */}
        <Card title="Últimos movimentos" action={<CardLink href="/movimentos">Todos</CardLink>}>
          <ul className="space-y-3">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center gap-3 text-sm">
                <span className={`h-9 w-1 shrink-0 rounded-full ${t.amountCents > 0 ? "bg-pos" : t.scope === "casal" ? "bg-[var(--scope-casal)]" : "bg-accent"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{t.description}</p>
                  <p className="truncate text-xs text-ink-3">
                    {formatDate(t.date).slice(0, 5)} · {t.categoryName ?? "Sem categoria"}
                    {t.scope === "casal" ? " · Partilhado" : ""}
                  </p>
                </div>
                <span className={`chip ${t.amountCents > 0 ? "chip-pos" : "chip-muted"}`}>{formatEUR(t.amountCents, { sign: true })}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
