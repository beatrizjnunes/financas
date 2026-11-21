"use client";

import { useOptimistic, useState, useTransition } from "react";
import { formatDate, formatDayHeading, formatEUR, formatTime } from "@/lib/format";
import { COUNTED_SCOPES, type Kind, type Scope } from "@/lib/labels";
import {
  Amount,
  BulkBar,
  CategorySelect,
  type CategoryOption,
  KindSelect,
  ScopeSelect,
} from "@/components/tx-controls";
import { resolveDuplicatesAction, updateTransactionsAction } from "./actions";

export type TxRow = {
  id: string;
  date: string;
  description: string;
  descriptionOriginal: string;
  amountCents: number;
  feeCents: number;
  scope: Scope;
  kind: Kind;
  categoryId: string | null;
  needsReview: boolean;
  accountName: string;
  duplicateOf: string | null;
  original: { date: string | null; description: string | null; accountName: string | null } | null;
};

type Patch = Partial<Pick<TxRow, "scope" | "kind" | "categoryId" | "duplicateOf">> & { needsReview?: false };

export function TxList({ rows, categories, showAccount }: { rows: TxRow[]; categories: CategoryOption[]; showAccount: boolean }) {
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [optimistic, apply] = useOptimistic(rows, (state, { ids, patch }: { ids: string[]; patch: Patch }) =>
    state.map((r) => (ids.includes(r.id) ? { ...r, needsReview: false, ...patch } : r)),
  );

  function update(ids: string[], patch: Patch) {
    setError(null);
    startTransition(async () => {
      apply({ ids, patch });
      try {
        await updateTransactionsAction({ ids, patch });
      } catch {
        setError("Não consegui guardar a alteração. Tenta outra vez.");
      }
    });
  }

  function resolve(id: string, isDuplicate: boolean) {
    setError(null);
    startTransition(async () => {
      apply({ ids: [id], patch: isDuplicate ? { duplicateOf: null, scope: "ignorar" } : { duplicateOf: null } });
      try {
        await resolveDuplicatesAction({ ids: [id], isDuplicate });
      } catch {
        setError("Não consegui guardar a alteração. Tenta outra vez.");
      }
    });
  }

  if (!optimistic.length) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-6 py-12 text-center text-sm text-ink-3">
        Nenhum movimento com estes filtros.
      </div>
    );
  }

  const days: { day: string; rows: TxRow[] }[] = [];
  for (const r of optimistic) {
    const day = r.date.slice(0, 10);
    if (days.at(-1)?.day !== day) days.push({ day, rows: [] });
    days.at(-1)!.rows.push(r);
  }

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div>
      {error && <p className="mb-3 rounded-xl bg-danger-bg px-4 py-2.5 text-sm text-danger">{error}</p>}
      <BulkBar
        count={selected.size}
        categories={categories}
        onScope={(scope) => update([...selected], { scope })}
        onCategory={(categoryId) => update([...selected], { categoryId })}
        onKind={(kind) => update([...selected], { kind })}
        onReviewed={() => update([...selected], { needsReview: false })}
        onClear={() => setSelected(new Set())}
      />
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {days.map(({ day, rows }) => {
          const net = rows
            .filter((r) => COUNTED_SCOPES.includes(r.scope) && !r.duplicateOf)
            .reduce((s, r) => s + r.amountCents, 0);
          const allOn = rows.every((r) => selected.has(r.id));
          return (
            <section key={day}>
              <header className="tx-row border-b border-line bg-surface-2 px-4 py-2 text-xs text-ink-2">
                <input
                  type="checkbox"
                  className="c-check"
                  aria-label={`Selecionar ${formatDayHeading(day)}`}
                  checked={allOn}
                  onChange={() => rows.forEach((r) => toggle(r.id, !allOn))}
                />
                <span className="c-desc font-medium first-letter:uppercase">{formatDayHeading(day)}</span>
                <span className="c-amount num text-right text-ink-3">{net !== 0 && formatEUR(net, { sign: net > 0 })}</span>
              </header>
              <ul className="divide-y divide-line">
                {rows.map((r) => {
                  const counted = COUNTED_SCOPES.includes(r.scope) && !r.duplicateOf;
                  return (
                    <li
                      key={r.id}
                      className={`tx-row px-4 py-3 ${selected.has(r.id) ? "bg-surface-2" : ""} ${r.needsReview ? "needs-review" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="c-check"
                        checked={selected.has(r.id)}
                        onChange={(e) => toggle(r.id, e.target.checked)}
                        aria-label={`Selecionar ${r.description}`}
                      />
                      <div className="c-desc">
                        <p className={`truncate text-sm font-medium ${counted ? "" : "text-ink-3"}`} title={r.descriptionOriginal}>
                          {r.description}
                        </p>
                        <p className="truncate text-xs text-ink-3">
                          {r.needsReview && (
                            <>
                              <button
                                onClick={() => update([r.id], { needsReview: false })}
                                className="font-medium text-review-ink hover:underline"
                                title="Marcar como revisto"
                              >
                                Por rever ✓
                              </button>{" "}
                              ·{" "}
                            </>
                          )}
                          {formatTime(r.date)}
                          {showAccount && <> · {r.accountName}</>}
                          {r.feeCents > 0 && r.amountCents !== -r.feeCents && <> · inclui comissão de {formatEUR(r.feeCents)}</>}
                        </p>
                        {r.duplicateOf && (
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-review-ink">
                            <span className="font-medium">
                              Em suspenso · possível duplicado de {r.original?.description ?? "outro movimento"}
                              {r.original?.date && (
                                <>
                                  {" "}
                                  · {formatDate(r.original.date)} {formatTime(r.original.date)}
                                </>
                              )}
                              {r.original?.accountName && <> · {r.original.accountName}</>}
                            </span>
                            <button onClick={() => resolve(r.id, true)} className="font-medium underline hover:no-underline">
                              É duplicado
                            </button>
                            <button onClick={() => resolve(r.id, false)} className="font-medium underline hover:no-underline">
                              Não é, contar
                            </button>
                          </p>
                        )}
                      </div>
                      <div className="c-controls">
                        <CategorySelect
                          value={r.categoryId}
                          flagMissing={COUNTED_SCOPES.includes(r.scope)}
                          categories={categories}
                          onChange={(categoryId) => update([r.id], { categoryId })}
                        />
                        <KindSelect value={r.kind} onChange={(kind) => update([r.id], { kind })} />
                        <ScopeSelect value={r.scope} onChange={(scope) => update([r.id], { scope })} />
                      </div>
                      <Amount
                        cents={r.amountCents}
                        muted={!counted}
                        className="c-amount text-sm font-medium"
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
