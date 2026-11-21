import type { Metadata } from "next";
import Link from "next/link";
import { daysInMonth, monthLong, monthOf, monthShort, nextMonth, prevMonth, spendByCategory, spendByKind, type ATx } from "@/lib/analytics";
import { formatDate, formatEUR } from "@/lib/format";
import { KIND_LABEL, KINDS } from "@/lib/labels";
import { coupleBalance } from "@/lib/split";
import { requireUser } from "@/server/auth";
import { coupleTransactions, listPeople } from "@/server/data";
import { Card, CategoryBars, ColumnChart, Legend, SeriesKey, StackBar, StatTile, TableView } from "@/components/charts";
import { MonthPicker, pickMonth } from "@/components/month-picker";

export const metadata: Metadata = { title: "Casal" };

const PERSON_COLOR = ["var(--series-1)", "var(--series-2)"];
const KIND_COLOR = { fixa: "var(--series-1)", variavel: "var(--series-2)", pontual: "var(--series-3)" } as const;

export default async function CasalPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [people, txs] = await Promise.all([listPeople(), coupleTransactions()]);

  if (people.length !== 2) {
    return <p className="text-sm text-ink-3">A área do casal precisa de exatamente 2 utilizadores.</p>;
  }
  const [a, b] = people;
  const colorOf = (id: string) => PERSON_COLOR[id === a.id ? 0 : 1];
  const nameOf = (id: string) => (id === a.id ? a.name : b.name);

  const header = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Casal</h1>
      <p className="mt-1 text-sm text-ink-3">
        Partilhado entre {a.name} e {b.name}. Só aparecem os movimentos marcados como Casal — o resto continua privado.
      </p>
    </div>
  );

  if (!txs.length) {
    return (
      <div>
        {header}
        <div className="mt-6 rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
          <p className="font-medium">Ainda não há despesas do casal</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">
            Em Movimentos (ou ao importar), marca como <span className="font-medium text-ink-2">Casal</span> o que é da casa: renda,
            supermercado, contas… Aparece aqui para os dois, com quem pagou e o saldo entre vocês.
          </p>
          <Link href="/movimentos" className="mt-6 inline-flex h-9 items-center rounded-lg bg-ink px-4 text-sm font-medium text-bg">
            Ir para Movimentos
          </Link>
        </div>
      </div>
    );
  }

  // Saldo: tudo desde o início (os acertos de contas chegam na fase seguinte).
  const balance = coupleBalance(txs, { id: a.id, name: a.name }, { id: b.id, name: b.name });
  const since = txs.at(-1)!.date;

  const months: string[] = [];
  const firstM = monthOf(since);
  const lastM = monthOf(txs[0].date);
  for (let m = firstM; m <= lastM; m = nextMonth(m)) months.push(m);
  const month = pickMonth(sp.mes, months);
  const prev = prevMonth(month);
  const inMonth = txs.filter((t) => monthOf(t.date) === month);
  const aTx: ATx[] = txs.map((t) => ({ ...t, kind: t.kind }));
  const monthBalance = coupleBalance(inMonth, { id: a.id, name: a.name }, { id: b.id, name: b.name });
  const prevTotal = -txs.filter((t) => monthOf(t.date) === prev).reduce((s, t) => s + t.amountCents, 0);
  const cats = spendByCategory(aTx, month);
  const kinds = spendByKind(aTx, month);
  const last12 = months.slice(-12);
  const perMonth = (id: string) => last12.map((m) => -txs.filter((t) => t.paidBy === id && monthOf(t.date) === m).reduce((s, t) => s + t.amountCents, 0));
  const d = prevTotal > 0 ? (monthBalance.totalCents - prevTotal) / prevTotal : null;
  const me = user.id;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        {header}
        <MonthPicker month={month} first={months[0]} last={months.at(-1)!} basePath="/casal" />
      </div>

      {/* Saldo entre os dois */}
      <section className="mb-6 rounded-2xl border border-line bg-surface p-6">
        <p className="text-xs text-ink-3">Saldo entre vocês · divisão 50/50 · desde {formatDate(since)}</p>
        {balance.debt ? (
          <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl">
            {balance.debt.from.id === me ? (
              <>Deves <span className="whitespace-nowrap">{formatEUR(balance.debt.cents)}</span> a {balance.debt.to.name}</>
            ) : balance.debt.to.id === me ? (
              <>{balance.debt.from.name} deve-te <span className="whitespace-nowrap">{formatEUR(balance.debt.cents)}</span></>
            ) : (
              <>{balance.debt.from.name} deve <span className="whitespace-nowrap">{formatEUR(balance.debt.cents)}</span> a {balance.debt.to.name}</>
            )}
          </p>
        ) : (
          <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl">Estão quites</p>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {balance.people.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 text-sm">
              <SeriesKey color={PERSON_COLOR[i]} />
              <span className="font-medium">{p.name}</span>
              <span className="text-ink-3">
                pagou <span className="num text-ink">{formatEUR(p.paidCents)}</span> · cabia-lhe{" "}
                <span className="num text-ink">{formatEUR(p.shareCents)}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-3">
          Total partilhado: {formatEUR(balance.totalCents)}. Os botões “Acertar contas” e a divisão por despesa (60/40, “paga só um”) chegam na
          próxima fase.
        </p>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
        <StatTile
          label={`Gasto em ${monthShort(month)}`}
          value={formatEUR(monthBalance.totalCents)}
          delta={d == null ? null : `${d >= 0 ? "▲" : "▼"} ${Math.round(Math.abs(d) * 100)}% vs mês anterior`}
          deltaGood={d == null ? null : d <= 0}
        />
        {monthBalance.people.map((p) => (
          <StatTile key={p.id} label={`${p.name} pagou`} value={formatEUR(p.paidCents)} />
        ))}
        <StatTile label="Despesas fixas" value={formatEUR(kinds.fixa)} delta={`${inMonth.length} movimentos no mês`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card title="Por categoria" subtitle={`Despesas do casal em ${monthLong(month)}.`} className="lg:col-span-3">
          {cats.length ? (
            <CategoryBars
              color="var(--series-1)"
              items={cats.map((c) => ({ key: c.key, label: c.name, cents: c.cents, prevCents: months.includes(prev) ? c.prevCents : undefined }))}
            />
          ) : (
            <p className="text-sm text-ink-3">Sem despesas do casal neste mês.</p>
          )}
        </Card>

        <div className="grid min-w-0 gap-4 lg:col-span-2">
          <Card title="Quem pagou este mês">
            <StackBar parts={monthBalance.people.map((p, i) => ({ key: p.id, label: p.name, cents: Math.max(p.paidCents, 0), color: PERSON_COLOR[i] }))} />
          </Card>
          <Card title="Fixas, variáveis e pontuais">
            <StackBar parts={KINDS.map((k) => ({ key: k, label: KIND_LABEL[k], cents: kinds[k], color: KIND_COLOR[k] }))} />
          </Card>
        </div>

        <Card title="Por mês" subtitle="Quanto cada um pagou em despesas comuns." className="lg:col-span-5">
          <div className="mb-3">
            <Legend items={people.map((p, i) => ({ label: p.name, color: PERSON_COLOR[i] }))} />
          </div>
          <ColumnChart
            labels={last12.map(monthShort)}
            highlight={last12.indexOf(month)}
            series={people.map((p, i) => ({ key: p.id, label: p.name, color: PERSON_COLOR[i], values: perMonth(p.id) }))}
          />
          <TableView head={["Mês", a.name, b.name]} rows={last12.map((m, i) => [monthLong(m), formatEUR(perMonth(a.id)[i]), formatEUR(perMonth(b.id)[i])])} />
        </Card>

        <Card title="Movimentos do casal" subtitle={`${monthLong(month)} · ${formatDate(`${month}-01`)} a ${formatDate(`${month}-${daysInMonth(month)}`)}`} className="lg:col-span-5">
          <ul className="-mx-5 divide-y divide-line border-t border-line">
            {inMonth.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="num w-12 shrink-0 text-xs text-ink-3">{formatDate(t.date).slice(0, 5)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{t.description}</p>
                  <p className="truncate text-xs text-ink-3">{t.categoryName ?? "Sem categoria"}</p>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-ink-2" title={`Pago por ${nameOf(t.paidBy)}`}>
                  <SeriesKey color={colorOf(t.paidBy)} />
                  <span className="hidden sm:inline">{nameOf(t.paidBy)}</span>
                </span>
                <span className="num w-24 text-right font-medium">{formatEUR(t.amountCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
