import type { Metadata } from "next";
import {
  recurringExpenses,
  projectMonth,
  cumulativeByDay,
  daysInMonth,
  insights,
  monthLong,
  monthlyFlow,
  monthShort,
  pct,
  prevMonth,
  spendByCategory,
  spendByKind,
  topMerchants,
} from "@/lib/analytics";
import { formatEUR } from "@/lib/format";
import { KIND_LABEL, KINDS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { myCountedTransactions } from "@/server/data";
import { Card, CategoryBars, ColumnChart, EmptyState, Legend, PageHeader, PaceChart, StackBar, StatTile, TableView } from "@/components/charts";
import { MonthPicker, pickMonth } from "@/components/month-picker";

export const metadata: Metadata = { title: "Análise" };

const KIND_COLOR = { fixa: "var(--series-1)", variavel: "var(--series-2)", pontual: "var(--series-3)" } as const;

function delta(cur: number, prev: number | undefined) {
  if (prev == null || prev === 0) return null;
  const d = (cur - prev) / Math.abs(prev);
  return { d, text: `${d >= 0 ? "▲" : "▼"} ${pct(Math.abs(d))} vs mês anterior` };
}

export default async function AnalisePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const txs = await myCountedTransactions(user.id);

  if (!txs.length) {
    return (
      <div>
        <PageHeader title="Análise" />
        <EmptyState title="Ainda não há dados para analisar" text="Importa um extrato e os gráficos aparecem aqui." href="/importar" cta="Importar extrato" />
      </div>
    );
  }

  const flow = monthlyFlow(txs);
  const months = flow.map((f) => f.month);
  const month = pickMonth(sp.mes, months);
  const prev = prevMonth(month);
  const cur = flow.find((f) => f.month === month)!;
  const before = flow.find((f) => f.month === prev);
  const last12 = flow.slice(-12);

  const cats = spendByCategory(txs, month);
  const kinds = spendByKind(txs, month);
  const top = topMerchants(txs, month);
  const notes = insights(txs, month, (c) => formatEUR(c));
  const recurring = recurringExpenses(txs, month);
  const recurringMonthly = recurring.reduce((s, r) => s + r.monthlyCents, 0);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = month === thisMonth ? now.getDate() : daysInMonth(month);
  const pace = cumulativeByDay(txs, month);
  const pacePrev = months.includes(prev) ? cumulativeByDay(txs, prev) : [];
  const projected = month === thisMonth ? projectMonth(txs, month, { day: today, days: daysInMonth(month) }) : null;

  const spentDelta = delta(cur.spentCents, before?.spentCents);
  const incomeDelta = delta(cur.incomeCents, before?.incomeCents);
  const rateDiff = cur.savingsRate != null && before?.savingsRate != null ? cur.savingsRate - before.savingsRate : null;
  const range = `de=${month}-01&ate=${month}-${daysInMonth(month)}`;

  return (
    <div>
      <PageHeader title="Análise" subtitle="Para onde vai o teu dinheiro. Só tu vês esta página.">
        <MonthPicker month={month} first={months[0]} last={months.at(-1)!} basePath="/analise" />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile label="Entradas" value={formatEUR(cur.incomeCents)} delta={incomeDelta?.text} deltaGood={incomeDelta ? incomeDelta.d >= 0 : null} />
        <StatTile label="Saídas" value={formatEUR(cur.spentCents)} delta={spentDelta?.text} deltaGood={spentDelta ? spentDelta.d <= 0 : null} />
        <StatTile label="Poupado" value={formatEUR(cur.netCents, { sign: cur.netCents > 0 })} delta={cur.netCents < 0 ? "Gastaste mais do que entrou" : null} deltaGood={cur.netCents < 0 ? false : null} />
        <StatTile
          tone="accent"
          label="Taxa de poupança"
          value={cur.savingsRate == null ? "—" : pct(cur.savingsRate)}
          delta={rateDiff == null ? (cur.savingsRate == null ? "Sem entradas neste mês" : null) : `${rateDiff >= 0 ? "▲" : "▼"} ${Math.round(Math.abs(rateDiff) * 100)} p.p. vs mês anterior`}
          deltaGood={rateDiff == null ? null : rateDiff >= 0}
        />
      </div>

      {notes.length > 0 && (
        <ul className="mb-4 grid gap-3 sm:grid-cols-2">
          {notes.map((n) => (
            <li key={n.text} className="card flex gap-3 px-4 py-3 text-sm">
              <span className={n.tone === "up" ? "text-danger" : n.tone === "down" ? "text-pos" : "text-ink-3"} aria-hidden>
                {n.tone === "up" ? "↗" : n.tone === "down" ? "↘" : "•"}
              </span>
              <span className="text-ink-2">{n.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-4">
        <Card title="Entradas e saídas por mês" subtitle="Inclui as despesas partilhadas que pagaste. Transferências ficam de fora." className="lg:col-span-5">
          <div className="mb-3">
            <Legend
              items={[
                { label: "Entradas", color: "var(--series-1)" },
                { label: "Saídas", color: "var(--series-2)" },
              ]}
            />
          </div>
          <ColumnChart
            labels={last12.map((f) => monthShort(f.month))}
            highlight={last12.findIndex((f) => f.month === month)}
            series={[
              { key: "in", label: "Entradas", color: "var(--series-1)", values: last12.map((f) => f.incomeCents) },
              { key: "out", label: "Saídas", color: "var(--series-2)", values: last12.map((f) => f.spentCents) },
            ]}
          />
          <TableView
            head={["Mês", "Entradas", "Saídas", "Poupado", "Taxa"]}
            rows={last12.map((f) => [monthLong(f.month), formatEUR(f.incomeCents), formatEUR(f.spentCents), formatEUR(f.netCents), f.savingsRate == null ? "—" : pct(f.savingsRate)])}
          />
        </Card>

        <Card title="Onde gastaste" subtitle={`Por categoria em ${monthLong(month)}. Clica para ver os movimentos.`} className="lg:col-span-3">
          {cats.length ? (
            <CategoryBars
              items={cats.map((c) => ({
                key: c.key,
                label: c.name,
                cents: c.cents,
                prevCents: months.includes(prev) ? c.prevCents : undefined,
                href: `/movimentos?categoria=${c.key}&${range}&ambito=contam`,
              }))}
            />
          ) : (
            <p className="text-sm text-ink-3">Sem despesas neste mês.</p>
          )}
        </Card>

        <div className="grid min-w-0 gap-4 lg:col-span-2">
          <Card title="Fixas, variáveis e pontuais" subtitle="Muda o tipo na lista de movimentos.">
            <StackBar parts={KINDS.map((k) => ({ key: k, label: KIND_LABEL[k], cents: kinds[k], color: KIND_COLOR[k] }))} />
          </Card>
          <Card title="Onde gastas mais">
            <ol className="space-y-2 text-sm">
              {top.map((t, i) => (
                <li key={t.name} className="flex items-baseline gap-3">
                  <span className="num w-4 text-xs text-ink-3">{i + 1}</span>
                  <span className="truncate">{t.name}</span>
                  <span className="text-xs text-ink-3">{t.count}×</span>
                  <span className="num ml-auto font-medium">{formatEUR(t.cents)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <Card
          title="Ritmo do mês"
          subtitle={
            projected != null
              ? `Ao ritmo atual, vais gastar cerca de ${formatEUR(projected)} este mês.`
              : "Gasto acumulado dia a dia, comparado com o mês anterior."
          }
          className="lg:col-span-5"
        >
          <div className="mb-3">
            <Legend
              items={[
                { label: monthLong(month), color: "var(--series-1)", shape: "line" },
                ...(pacePrev.length ? [{ label: monthLong(prev), color: "var(--chart-muted)", shape: "line" as const }] : []),
              ]}
            />
          </div>
          <PaceChart current={pace} previous={pacePrev} today={today} currentLabel={monthLong(month)} previousLabel={monthLong(prev)} />
        </Card>

        <Card
          id="recorrentes"
          title="Despesas recorrentes"
          subtitle={
            recurring.length
              ? `${recurring.length} pagamentos que se repetem todos os meses: ${formatEUR(recurringMonthly)}/mês, ${formatEUR(recurringMonthly * 12)}/ano. Cortar um destes poupa o valor anual inteiro.`
              : "Pagamentos com valor parecido em pelo menos 3 dos últimos 6 meses."
          }
          className="scroll-mt-6 lg:col-span-5"
        >
          {recurring.length ? (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-3">
                  <tr className="border-b border-line">
                    <th className="px-5 pb-2 font-normal sm:px-6">Pagamento</th>
                    <th className="hidden pb-2 font-normal sm:table-cell">Categoria</th>
                    <th className="hidden pb-2 text-right font-normal sm:table-cell">Meses</th>
                    <th className="pb-2 text-right font-normal">Por mês</th>
                    <th className="px-5 pb-2 text-right font-normal sm:px-6">Por ano</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recurring.map((r) => (
                    <tr key={r.key}>
                      <td className="max-w-40 truncate px-5 py-2.5 font-medium sm:max-w-56 sm:px-6">{r.name}</td>
                      <td className="hidden py-2.5 text-ink-2 sm:table-cell">{r.categoryName ?? "Sem categoria"}</td>
                      <td className="num hidden py-2.5 text-right text-ink-3 sm:table-cell">{r.months}</td>
                      <td className="num py-2.5 text-right">{formatEUR(r.monthlyCents)}</td>
                      <td className="num px-5 py-2.5 text-right font-medium sm:px-6">{formatEUR(r.annualCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-ink-3">Ainda não há meses suficientes para detetar pagamentos recorrentes.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
