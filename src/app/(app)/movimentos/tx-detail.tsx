"use client";

import { useEffect, useState, useTransition } from "react";
import { formatDate, formatEUR, formatTime } from "@/lib/format";
import { BANK_LABEL, type Bank, type Kind, type Scope, SCOPE_HINT } from "@/lib/labels";
import { CategorySelect, type CategoryOption, KindSelect, ScopeSelect } from "@/components/tx-controls";
import { Icon } from "@/components/icons";
import { updateDetailsAction } from "./actions";
import { SharedPart } from "./shared-part";
import type { TxRow } from "./tx-list";

/** Painel lateral com todos os detalhes de um movimento; permite mudar o nome e escrever uma nota. */
export function TxDetail({
  tx,
  categories,
  onClose,
  onPatch,
  onShared,
  onDelete,
  investments,
  investmentCategoryId,
  onInvestment,
}: {
  tx: TxRow;
  categories: CategoryOption[];
  onClose: () => void;
  onPatch: (p: { scope?: Scope; kind?: Kind; categoryId?: string | null; isRefund?: boolean }) => void;
  onShared: (cents: number | null) => void;
  investments: { id: string; name: string }[];
  investmentCategoryId: string | null;
  onInvestment: (investmentId: string | null) => void;
  /** Apaga o movimento (ou restaura, se já estiver apagado). */
  onDelete: () => void;
}) {
  const [name, setName] = useState(tx.customDescription ?? tx.bankDescription);
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty = name.trim() !== (tx.customDescription ?? tx.bankDescription) || notes.trim() !== (tx.notes ?? "");

  function save() {
    start(async () => {
      await updateDetailsAction({ id: tx.id, name: name.trim() || null, notes: notes.trim() || null });
      setSaved(true);
    });
  }

  const rows: [string, React.ReactNode][] = [
    [
      "Conta",
      tx.bank === "dinheiro"
        ? "Dinheiro (carteira)"
        : (BANK_LABEL[tx.bank as Bank] ?? tx.bank) === tx.accountName
          ? tx.accountName
          : `${tx.accountName} · ${BANK_LABEL[tx.bank as Bank] ?? tx.bank}`,
    ],
    ["Data", tx.bankType === "manual" ? formatDate(tx.date) : `${formatDate(tx.date)} às ${formatTime(tx.date)}`],
  ];
  if (tx.bookedAt && tx.bookedAt.slice(0, 10) !== tx.date.slice(0, 10)) rows.push(["Data-valor no banco", formatDate(tx.bookedAt)]);
  if (tx.feeCents > 0) rows.push(["Comissão (já incluída)", formatEUR(tx.feeCents)]);
  if (tx.originalCurrency && tx.originalCurrency !== "EUR" && tx.originalAmountCents != null)
    rows.push(["Valor original", `${(tx.originalAmountCents / 100).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} ${tx.originalCurrency}`]);
  if (tx.counterparty) rows.push(["Contraparte", tx.counterparty]);
  if (tx.balanceCents != null) rows.push(["Saldo depois", formatEUR(tx.balanceCents)]);
  rows.push(["Origem", tx.bankType === "manual" ? "Adicionado à mão" : "Importado do extrato"]);
  if (tx.updatedAt) rows.push(["Última alteração", `${formatDate(tx.updatedAt)} ${formatTime(tx.updatedAt.replace("T", " "))}`]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface shadow-2xl"
        role="dialog"
        aria-label={`Detalhes de ${tx.description}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-6 py-4 backdrop-blur">
          <p className="text-sm text-ink-3">Detalhes do movimento</p>
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="px-6 py-5">
          <p className={`num text-3xl font-semibold tracking-tight ${tx.amountCents > 0 ? "text-pos" : ""}`}>{formatEUR(tx.amountCents, { sign: tx.amountCents > 0 })}</p>

          <label className="mt-4 block">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-ink-2">
              Nome
              {tx.customDescription && (
                <span className="chip chip-warn">
                  <Icon name="pencil" className="size-3" /> Alterado
                </span>
              )}
            </span>
            <input value={name} onChange={(e) => (setName(e.target.value), setSaved(false))} maxLength={120} className="input w-full font-medium" />
          </label>
          <div className="mt-2 space-y-0.5 text-xs text-ink-3">
            <p>
              Nome no banco: <span className="text-ink-2">{tx.bankDescription}</span>
              {tx.customDescription && (
                <button onClick={() => (setName(tx.bankDescription), setSaved(false))} className="ml-1.5 underline decoration-dotted hover:text-accent">
                  repor
                </button>
              )}
            </p>
            {tx.descriptionOriginal !== tx.bankDescription && (
              <p className="break-words">
                Texto original do extrato: <span className="font-mono text-[11px] text-ink-2">{tx.descriptionOriginal}</span>
              </p>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <p className="mb-1.5 text-xs font-medium text-ink-2">Categoria</p>
              <CategorySelect value={tx.categoryId} categories={categories} onChange={(categoryId) => onPatch({ categoryId })} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-2">Tipo</p>
              <KindSelect value={tx.kind} onChange={(kind) => onPatch({ kind })} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-2">Âmbito</p>
              <ScopeSelect value={tx.scope} onChange={(scope) => onPatch({ scope })} />
            </div>
            <p className="col-span-2 text-xs text-ink-3">
              {SCOPE_HINT[tx.scope]}
              {tx.scope === "entre_nos" && " Conta como acerto de contas no saldo partilhado."}
            </p>
          </div>

          {tx.categoryId && tx.categoryId === investmentCategoryId && (
            <div className="mt-4 rounded-xl bg-accent-soft px-4 py-3">
              <p className="text-xs font-medium text-accent-strong">Investimento · não conta como gasto</p>
              {investments.length ? (
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs text-ink-2">Para que investimento foi?</span>
                  <select value={tx.investmentId ?? ""} onChange={(e) => onInvestment(e.target.value || null)} className="select h-9 w-full">
                    <option value="">Ainda não associado</option>
                    {investments.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-ink-3">O valor soma-se ao investido (e ao valor atual) desse investimento no Património.</span>
                </label>
              ) : (
                <p className="mt-1 text-xs text-ink-2">
                  Cria o investimento em{" "}
                  <a href="/patrimonio" className="font-medium underline">
                    Património
                  </a>{" "}
                  para lhe associares este movimento.
                </p>
              )}
            </div>
          )}

          {tx.amountCents > 0 && tx.categoryId !== investmentCategoryId && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <input type="checkbox" className="mt-0.5" checked={tx.isRefund} onChange={(e) => onPatch({ isRefund: e.target.checked })} />
              <span>
                <span className="block text-sm font-medium">É um reembolso / devolução</span>
                <span className="block text-xs text-ink-3">
                  Desconta no gasto da categoria escolhida em vez de contar como receita. Ex.: um amigo devolve-te a parte dele do jantar → categoria
                  Restaurantes.
                </span>
              </span>
            </label>
          )}

          {tx.scope === "casal" && tx.amountCents < 0 && (
            <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3">
              <p className="text-xs font-medium text-ink-2">Divisão</p>
              <SharedPart amountCents={tx.amountCents} sharedCents={tx.sharedCents} onSave={onShared} />
            </div>
          )}

          <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-ink-3">{k}</dt>
                <dd className="num text-right">{v}</dd>
              </div>
            ))}
          </dl>

          <label className="mt-6 block">
            <span className="mb-1.5 block text-xs font-medium text-ink-2">Nota</span>
            <textarea
              value={notes}
              onChange={(e) => (setNotes(e.target.value), setSaved(false))}
              rows={4}
              maxLength={1000}
              placeholder="Ex.: jantar de anos da Joana, devolve metade em dezembro…"
              className="input h-auto w-full resize-y py-2 leading-relaxed"
            />
          </label>
        </div>

        <div className="sticky bottom-0 mt-auto flex items-center justify-end gap-3 border-t border-line bg-surface px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {tx.deletedAt ? (
            <button onClick={onDelete} className="mr-auto text-sm font-medium whitespace-nowrap text-accent hover:underline">
              Restaurar
            </button>
          ) : (
            <button
              onClick={() => confirm(`Apagar "${tx.description}"? Deixa de contar em todo o lado; podes restaurá-lo em "Apagados".`) && onDelete()}
              className="mr-auto text-sm whitespace-nowrap text-ink-3 hover:text-danger"
            >
              Apagar
            </button>
          )}
          {saved && !dirty && <span className="text-sm whitespace-nowrap text-pos">Guardado ✓</span>}
          <button onClick={onClose} className="hidden h-10 px-3 text-sm text-ink-3 hover:text-ink sm:block">
            Fechar
          </button>
          <button onClick={save} disabled={!dirty || pending} className="btn-primary whitespace-nowrap">
            {pending ? "A guardar…" : "Guardar"}
          </button>
        </div>
      </aside>
    </div>
  );
}
