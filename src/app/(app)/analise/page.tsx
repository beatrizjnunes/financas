import type { Metadata } from "next";
import Link from "next/link";
import {
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
import { Card, CategoryBars, ColumnChart, Legend, PaceChart, StackBar, StatTile, TableView } from "@/components/charts";
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
        <h1 className="text-2xl font-semibold tracking-tight">Análise</h1>
        <div className="mt-6 rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
          <p className="font-medium">Ainda não há dados para analisar</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">Importa um extrato e os gráficos aparecem aqui.</p>
          <Link href="/importar" className="mt-6 inline-flex h-9 items-center rounded-lg bg-ink px-4 text-sm font-medium text-bg">
            Importar extrato
          </Link>
        </div>
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

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = month === thisMonth ? now.getDate() : daysInMonth(month);
  const pace = cumulativeByDay(txs, month);
  const pacePrev = months.includes(prev) ? cumulativeByDay(txs, prev) : [];
  const projected = month === thisMonth && today > 3 ? Math.round((pace[today - 1] / today) * daysInMonth(month)) : null;

  const spentDelta = delta(cur.spentCents, before?.spentCents);
  const incomeDelta = delta(cur.incomeCents, before?.incomeCents);
  const rateDiff = cur.savingsRate != null && before?.savingsRate != null ? cur.savingsRate - before.savingsRate : null;
  const range = `de=${month}-01&ate=${month}-${daysInMonth(month)}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Análise</h1>
          <p className="mt-1 text-sm text-ink-3">Para onde vai o teu dinheiro. Só tu vês esta página.</p>
        </div>
        <MonthPicker month={month} first={months[0]} last={months.at(-1)!} basePath="/analise" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
        <StatTile label="Entradas" value={formatEUR(cur.incomeCents)} delta={incomeDelta?.text} deltaGood={incomeDelta ? incomeDelta.d >= 0 : null} />
        <StatTile label="Saídas" value={formatEUR(cur.spentCents)} delta={spentDelta?.text} deltaGood={spentDelta ? spentDelta.d <= 0 : null} />
        <StatTile label="Poupado" value={formatEUR(cur.netCents, { sign: cur.netCents > 0 })} delta={cur.netCents < 0 ? "Gastaste mais do que entrou" : null} deltaGood={cur.netCents < 0 ? false : null} />
        <StatTile
          label="Taxa de poupança"
          value={cur.savingsRate == null ? "—" : pct(cur.savingsRate)}
          delta={rateDiff == null ? (cur.savingsRate == null ? "Sem entradas neste mês" : null) : `${rateDiff >= 0 ? "▲" : "▼"} ${Math.round(Math.abs(rateDiff) * 100)} p.p. vs mês anterior`}
          deltaGood={rateDiff == null ? null : rateDiff >= 0}
        />
      </div>

      {notes.length > 0 && (
        <ul className="mb-6 grid gap-2 sm:grid-cols-2">
          {notes.map((n) => (
            <li key={n.text} className="flex gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <span className="text-ink-3" aria-hidden>
                {n.tone === "up" ? "↗" : n.tone === "down" ? "↘" : "•"}
              </span>
              <span className="text-ink-2">{n.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card title="Entradas e saídas por mês" subtitle="Inclui as despesas do casal que pagaste. Transferências ficam de fora." className="lg:col-span-5">
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
      </div>
    </div>
  );
}
