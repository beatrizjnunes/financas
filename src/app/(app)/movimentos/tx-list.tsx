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
import {
  deleteManualTransactionAction,
  deleteTransactionsAction,
  resolveDuplicatesAction,
  restoreTransactionsAction,
  setSharedPartAction,
  updateTransactionsAction,
} from "./actions";
import { SharedPart } from "./shared-part";
import { TxDetail } from "./tx-detail";
import { Icon } from "@/components/icons";

export type TxRow = {
  id: string;
  date: string;
  description: string;
  descriptionOriginal: string;
  amountCents: number;
  feeCents: number;
  scope: Scope;
  kind: Kind;
  sharedCents: number | null;
  bankType: string | null;
  bank: string;
  bankDescription: string;
  customDescription: string | null;
  notes: string | null;
  balanceCents: number | null;
  bookedAt: string | null;
  counterparty: string | null;
  originalAmountCents: number | null;
  originalCurrency: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  categoryId: string | null;
  needsReview: boolean;
  accountName: string;
  duplicateOf: string | null;
  original: { date: string | null; description: string | null; accountName: string | null } | null;
};

type Patch = Partial<Pick<TxRow, "scope" | "kind" | "categoryId" | "duplicateOf" | "sharedCents">> & { needsReview?: false };

export function TxList({
  rows,
  categories,
  showAccount,
  deletedView = false,
}: {
  rows: TxRow[];
  categories: CategoryOption[];
  showAccount: boolean;
  /** Vista "Apagados": cada linha tem Restaurar (e Apagar de vez, se for manual). */
  deletedView?: boolean;
}) {
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<string[] | null>(null);
  const [optimistic, apply] = useOptimistic(rows, (state, { ids, patch, remove }: { ids: string[]; patch?: Patch; remove?: boolean }) =>
    remove
      ? state.filter((r) => !ids.includes(r.id))
      : state.map((r) =>
          ids.includes(r.id)
            ? { ...r, needsReview: false, ...(patch?.scope && patch.scope !== "casal" ? { sharedCents: null } : {}), ...patch }
            : r,
        ),
  );

  /** Apaga (ou, na vista de apagados, restaura) e tira as linhas da lista logo. */
  function removeRows(ids: string[], mode: "apagar" | "restaurar" | "purgar") {
    setError(null);
    setSelected(new Set());
    setOpenId(null);
    startTransition(async () => {
      apply({ ids, remove: true });
      try {
        if (mode === "apagar") {
          await deleteTransactionsAction(ids);
          setUndo(ids);
        } else if (mode === "restaurar") await restoreTransactionsAction(ids);
        else await deleteManualTransactionAction(ids[0]);
      } catch {
        setError("Não consegui guardar a alteração. Tenta outra vez.");
      }
    });
  }

  const undoBar = undo && (
    <div className="sticky top-16 z-10 mb-3 flex items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-sm text-bg shadow-lg">
      <span className="mr-auto">
        {undo.length} {undo.length === 1 ? "movimento apagado" : "movimentos apagados"}.
      </span>
      <button
        onClick={() => {
          const ids = undo;
          setUndo(null);
          startTransition(() => restoreTransactionsAction(ids));
        }}
        className="font-semibold underline underline-offset-2"
      >
        Desfazer
      </button>
      <button onClick={() => setUndo(null)} className="opacity-60 hover:opacity-100" aria-label="Fechar">
        ✕
      </button>
    </div>
  );

  function updateShared(id: string, cents: number | null) {
    setError(null);
    startTransition(async () => {
      apply({ ids: [id], patch: { sharedCents: cents } });
      try {
        await setSharedPartAction({ id, cents });
      } catch {
        setError("Não consegui guardar a divisão. Tenta outra vez.");
      }
    });
  }

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
      <div>
        {undoBar}
        <div className="card px-6 py-12 text-center text-sm text-ink-3">
          {deletedView ? "Não há movimentos apagados." : "Nenhum movimento com estes filtros."}
        </div>
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

  const openTx = openId ? optimistic.find((r) => r.id === openId) : undefined;

  return (
    <div>
      {openTx && (
        <TxDetail
          key={openTx.id}
          tx={openTx}
          categories={categories}
          onClose={() => setOpenId(null)}
          onPatch={(p) => update([openTx.id], p)}
          onShared={(c) => updateShared(openTx.id, c)}
          onDelete={() => removeRows([openTx.id], openTx.deletedAt ? "restaurar" : "apagar")}
        />
      )}
      {undoBar}
      {error && <p className="mb-3 rounded-xl bg-danger-bg px-4 py-2.5 text-sm text-danger">{error}</p>}
      {!deletedView && (
        <BulkBar
          count={selected.size}
          categories={categories}
          onScope={(scope) => update([...selected], { scope })}
          onCategory={(categoryId) => update([...selected], { categoryId })}
          onKind={(kind) => update([...selected], { kind })}
          onReviewed={() => update([...selected], { needsReview: false })}
          onDelete={() => confirm(`Apagar ${selected.size} ${selected.size === 1 ? "movimento" : "movimentos"}?`) && removeRows([...selected], "apagar")}
          onClear={() => setSelected(new Set())}
        />
      )}
      <div className="overflow-hidden card">
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
                        <button
                          type="button"
                          onClick={() => setOpenId(r.id)}
                          className={`flex max-w-full items-center gap-1.5 text-left text-sm font-medium hover:text-accent ${counted ? "" : "text-ink-3"}`}
                          title="Ver detalhes"
                        >
                          <span className="truncate">{r.description}</span>
                          {r.customDescription && <Icon name="pencil" className="size-3 shrink-0 text-warn" />}
                          {r.notes && <span className="shrink-0 text-xs text-ink-3" aria-label="Tem nota">📝</span>}
                        </button>
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
                          {r.deletedAt && (
                            <>
                              <span className="text-danger">Apagado a {formatDate(r.deletedAt)}</span> ·{" "}
                              <button onClick={() => removeRows([r.id], "restaurar")} className="font-medium text-accent hover:underline">
                                Restaurar
                              </button>
                              {r.bankType === "manual" && (
                                <>
                                  {" "}
                                  ·{" "}
                                  <button
                                    onClick={() => confirm(`Apagar "${r.description}" de vez? Não dá para desfazer.`) && removeRows([r.id], "purgar")}
                                    className="hover:text-danger hover:underline"
                                  >
                                    Apagar de vez
                                  </button>
                                </>
                              )}{" "}
                              ·{" "}
                            </>
                          )}
                          {r.bankType === "manual" ? <span className="font-medium text-ink-2">Manual</span> : formatTime(r.date)}
                          {showAccount && <> · {r.accountName}</>}
                          {r.feeCents > 0 && r.amountCents !== -r.feeCents && <> · inclui comissão de {formatEUR(r.feeCents)}</>}
                        </p>
                        {r.scope === "casal" && !r.duplicateOf && r.amountCents < 0 && (
                          <SharedPart amountCents={r.amountCents} sharedCents={r.sharedCents} onSave={(c) => updateShared(r.id, c)} />
                        )}
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
