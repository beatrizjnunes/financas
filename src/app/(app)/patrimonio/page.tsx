import type { Metadata } from "next";
import { averageMonthlySpend, goalPlan, monthlyFlow } from "@/lib/analytics";
import { formatEUR } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { ensureCashAccount, myBalances, myCountedTransactions, myGoals, myInvestments } from "@/server/data";
import { Card, PageHeader, StatTile } from "@/components/charts";
import { AccountsEditor, GoalsEditor, InvestmentsEditor } from "./patrimonio-ui";

export const metadata: Metadata = { title: "Património" };

export default async function PatrimonioPage() {
  const user = await requireUser();
  await ensureCashAccount(user.id);
  const [balances, investments, goals, txs] = await Promise.all([myBalances(user.id), myInvestments(user.id), myGoals(user.id), myCountedTransactions(user.id)]);

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const inAccounts = balances.reduce((s, b) => s + (b.balanceCents ?? 0), 0);
  const invested = investments.reduce((s, i) => s + i.investedCents, 0);
  const value = investments.reduce((s, i) => s + i.valueCents, 0);
  const gain = value - invested;
  const goalsSaved = goals.reduce((s, g) => s + Math.min(g.savedCents, g.targetCents), 0);
  const goalsTarget = goals.reduce((s, g) => s + g.targetCents, 0);
  const goalsMonthly = goals.reduce((s, g) => s + (goalPlan(g, month).perMonthCents ?? 0), 0);
  const avgSpend = txs.length ? averageMonthlySpend(monthlyFlow(txs), month) : null;
  const runway = avgSpend ? inAccounts / avgSpend : null;

  return (
    <div>
      <PageHeader title="Património" subtitle="Quanto tens, onde está e para que estás a poupar. Só tu vês esta página." />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile tone="accent" label="Património total" value={formatEUR(inAccounts + value)} delta="contas + investimentos" />
        <StatTile
          label="Nas contas"
          value={formatEUR(inAccounts)}
          delta={runway != null ? `≈ ${runway.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} meses de despesas` : null}
          deltaGood={runway != null ? runway >= 3 : null}
        />
        <StatTile
          label="Investimentos"
          value={formatEUR(value)}
          delta={investments.length ? `${formatEUR(gain, { sign: true })} desde o início` : null}
          deltaGood={investments.length ? gain >= 0 : null}
        />
        <StatTile
          label="Objetivos"
          value={goals.length ? `${formatEUR(goalsSaved)}` : "—"}
          delta={goals.length ? (goalsMonthly ? `poupa ${formatEUR(goalsMonthly)}/mês para cumprir` : `de ${formatEUR(goalsTarget)}`) : null}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        <Card title="Saldos das contas" subtitle="O mais recente entre o do último extrato e o que escreveres à mão.">
          <AccountsEditor accounts={balances} />
        </Card>
        <Card title="Investimentos" subtitle="Ações, ETF, PPR, cripto… Atualiza o valor de vez em quando.">
          <InvestmentsEditor items={investments} />
        </Card>
        <Card title="Objetivos de poupança" subtitle="Quanto queres juntar e até quando — a app diz quanto pôr de lado por mês." className="lg:col-span-2">
          <GoalsEditor goals={goals} currentMonth={month} />
        </Card>
      </div>
    </div>
  );
}
