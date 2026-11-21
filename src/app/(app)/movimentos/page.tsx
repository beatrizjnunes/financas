import type { Metadata } from "next";
import Link from "next/link";
import { formatEUR, parseAmountToCents } from "@/lib/format";
import { COUNTED_SCOPES, SCOPES, type Scope } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import {
  countSuspended,
  countToReview,
  hasAnyTransactions,
  listCategories,
  myAccounts,
  myTransactions,
  type TxFilters,
} from "@/server/data";
import { EmptyState, PageHeader } from "@/components/charts";
import { Icon } from "@/components/icons";
import { ReviewBanner } from "./review-banner";
import { TxFiltersBar } from "./filters";
import { TxList } from "./tx-list";

export const metadata: Metadata = { title: "Movimentos" };

type Search = Record<string, string | string[] | undefined>;

function toCents(v: string | undefined) {
  if (!v) return undefined;
  try {
    return Math.abs(parseAmountToCents(v, ","));
  } catch {
    return undefined;
  }
}

function readFilters(sp: Search): TxFilters {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const ambito = s("ambito");
  return {
    q: s("q"),
    accountId: s("conta"),
    categoryId: s("categoria"),
    scope: ambito === "contam" || SCOPES.includes(ambito as Scope) ? (ambito as Scope | "contam") : undefined,
    from: s("de"),
    to: s("ate"),
    min: toCents(s("min")),
    max: toCents(s("max")),
    review: s("rever") === "1",
    suspended: s("suspensos") === "1",
  };
}

export default async function MovimentosPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = readFilters(sp);
  const [accounts, categories, rows, hasAny, toReview, suspended] = await Promise.all([
    myAccounts(user.id),
    listCategories(),
    myTransactions(user.id, filters),
    hasAnyTransactions(user.id),
    countToReview(user.id),
    countSuspended(user.id),
  ]);
  const imported = typeof sp.importados === "string" ? Number(sp.importados) : null;

  const counted = rows.filter((r) => COUNTED_SCOPES.includes(r.scope) && !r.duplicateOf);
  const income = counted.filter((r) => r.amountCents > 0).reduce((s, r) => s + r.amountCents, 0);
  const spent = counted.filter((r) => r.amountCents < 0).reduce((s, r) => s + r.amountCents, 0);

  return (
    <div>
      <PageHeader title="Movimentos" subtitle="Todas as tuas contas, por ordem cronológica. Só tu vês esta página.">
        <Link href="/importar" className="btn-primary">
          <Icon name="upload" className="size-4" /> Importar extrato
        </Link>
      </PageHeader>

      {imported === 0 && (
        <div className="card mb-4 flex items-center justify-between rounded-xl px-4 py-3 text-sm">
          <span>Não havia movimentos novos para importar.</span>
          <Link href="/movimentos" className="text-ink-3 hover:text-ink" aria-label="Fechar">
            ✕
          </Link>
        </div>
      )}
      {(suspended > 0 || filters.suspended) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-review-bg px-4 py-3 text-sm">
          <p className="mr-auto">
            <span className="font-medium">
              {suspended} {suspended === 1 ? "possível duplicado em suspenso" : "possíveis duplicados em suspenso"}
            </span>
            <span className="text-ink-2">
              {" "}
              — têm o mesmo valor e hora de um movimento que já existia. Não contam nos totais até confirmares.
            </span>
          </p>
          {filters.suspended ? (
            <Link href="/movimentos" className="text-ink-2 hover:text-ink">
              Ver todos
            </Link>
          ) : (
            <Link href="/movimentos?suspensos=1" className="font-medium text-ink hover:underline">
              Ver só estes
            </Link>
          )}
        </div>
      )}
      {hasAny && (toReview > 0 || filters.review) && (
        <ReviewBanner toReview={toReview} imported={imported} filtering={!!filters.review} />
      )}

      {!hasAny ? (
        <EmptyState
          title="Ainda não há movimentos"
          text="Exporta o extrato da tua conta em CSV e importa-o. Revês tudo antes de gravar."
          href="/importar"
          cta="Importar o primeiro extrato"
        />
      ) : (
        <>
          <TxFiltersBar
            accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName }))}
          />

          <dl className="mb-4 grid grid-cols-3 gap-3 lg:gap-4">
            <Total label="Entradas" value={formatEUR(income)} className="text-pos" />
            <Total label="Saídas" value={formatEUR(spent)} />
            <Total label="Saldo do período" value={formatEUR(income + spent, { sign: true })} />
          </dl>

          <TxList
            rows={rows}
            categories={categories.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName }))}
            showAccount={accounts.length > 1}
          />
          <p className="mt-4 text-xs text-ink-3">
            {rows.length} {rows.length === 1 ? "movimento" : "movimentos"}. Os totais só contam Pessoal e Casal — transferências,
            movimentos ignorados e possíveis duplicados em suspenso ficam de fora.
          </p>
        </>
      )}
    </div>
  );
}

function Total({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="card px-4 py-3 sm:px-5 sm:py-4">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`num mt-1 text-base font-semibold sm:text-xl ${className}`}>{value}</dd>
    </div>
  );
}
