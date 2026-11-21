import type { Metadata } from "next";
import { budgetLines, expenseCategories, monthlyFlow, monthProgress, pct } from "@/lib/analytics";
import { formatEUR } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { listCategories, myBudgets, myCountedTransactions } from "@/server/data";
import { PageHeader, StatTile } from "@/components/charts";
import { MonthPicker, pickMonth } from "@/components/month-picker";
import { BudgetEditor } from "./budget-editor";

export const metadata: Metadata = { title: "Orçamentos" };

export default async function OrcamentosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [txs, categories, budgets] = await Promise.all([myCountedTransactions(user.id), listCategories(), myBudgets(user.id)]);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months = txs.length ? monthlyFlow(txs).map((f) => f.month) : [thisMonth];
  const month = pickMonth(sp.mes, months);
  const progress = monthProgress(month, now);
  const cats = expenseCategories(categories);
  const lines = budgetLines(txs, month, cats, budgets, progress).map((l) => ({ ...l, group: cats.find((c) => c.id === l.key)!.groupName }));

  const withBudget = lines.filter((l) => l.budgetCents != null);
  const total = withBudget.reduce((s, l) => s + l.budgetCents!, 0);
  const spent = withBudget.reduce((s, l) => s + l.spentCents, 0);
  const projected = progress ? withBudget.reduce((s, l) => s + (l.projectedCents ?? l.spentCents), 0) : null;
  const unbudgeted = lines.filter((l) => l.budgetCents == null).reduce((s, l) => s + l.spentCents, 0);
  const daysLeft = progress ? progress.days - progress.day + 1 : 0;
  const over = withBudget.filter((l) => l.status === "excedido").length;
  const warn = withBudget.filter((l) => l.status === "atencao").length;

  return (
    <div>
      <PageHeader
        title="Orçamentos"
        subtitle="Um limite mensal por categoria, só teu. Conta as tuas despesas pessoais e as partilhadas que pagaste."
      >
        <MonthPicker month={month} first={months[0]} last={months.at(-1)!} basePath="/orcamentos" />
      </PageHeader>

      {withBudget.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatTile label="Orçamento total" value={formatEUR(total)} delta={`${withBudget.length} categorias`} />
          <StatTile
            label="Gasto"
            value={formatEUR(spent)}
            delta={`${pct(spent / Math.max(total, 1))} do orçamento`}
            deltaGood={spent <= total}
          />
          <StatTile
            label={spent > total ? "Acima do orçamento" : progress ? "Disponível por dia" : "Sobrou"}
            value={spent > total ? formatEUR(spent - total) : progress ? formatEUR((total - spent) / daysLeft) : formatEUR(total - spent)}
            delta={progress && spent <= total ? `${formatEUR(total - spent)} em ${daysLeft} dias` : over || warn ? `${over} excedidas · ${warn} em atenção` : "Tudo dentro do limite"}
            deltaGood={spent > total ? false : progress ? null : over ? false : warn ? null : true}
          />
          <StatTile
            tone="accent"
            label={projected != null ? "Previsão para o mês" : "Sem orçamento"}
            value={projected != null ? formatEUR(projected) : formatEUR(unbudgeted)}
            delta={projected != null ? (projected > total ? `${formatEUR(projected - total)} acima do limite` : "dentro do limite") : "gasto em categorias sem limite"}
          />
        </div>
      )}

      <BudgetEditor key={month} lines={lines} isCurrent={progress != null} />
    </div>
  );
}
