"use client";

import { useState, useTransition } from "react";
import { KIND_LABEL, KINDS, type Kind } from "@/lib/labels";
import { parseAmountToCents } from "@/lib/format";
import { CategorySelect, type CategoryOption } from "@/components/tx-controls";
import { Icon } from "@/components/icons";
import { addManualTransactionAction } from "./actions";

type Acc = { id: string; name: string; bank: string };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Botão + janela para registar um movimento à mão (ex.: pago em dinheiro). */
export function ManualTxButton({ accounts, categories }: { accounts: Acc[]; categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-soft h-10 px-4">
        + Adicionar movimento
      </button>
      {open && <ManualTxDialog accounts={accounts} categories={categories} onClose={() => setOpen(false)} />}
    </>
  );
}

function ManualTxDialog({ accounts, categories, onClose }: { accounts: Acc[]; categories: CategoryOption[]; onClose: () => void }) {
  const cash = accounts.find((a) => a.bank === "dinheiro");
  const [sign, setSign] = useState<-1 | 1>(-1);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState(cash?.id ?? "dinheiro");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [partial, setPartial] = useState("");
  const [kind, setKind] = useState<Kind>("variavel");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let cents: number;
    let sharedCents: number | null = null;
    try {
      cents = Math.abs(parseAmountToCents(amount, ","));
      if (!cents) throw new Error();
      if (shared && partial.trim()) sharedCents = Math.abs(parseAmountToCents(partial, ","));
    } catch {
      setError("Confirma o valor (ex.: 12,50).");
      return;
    }
    if (!description.trim()) {
      setError("Escreve uma descrição.");
      return;
    }
    start(async () => {
      try {
        await addManualTransactionAction({
          accountId,
          date,
          description: description.trim(),
          amountCents: sign * cents,
          categoryId,
          scope: shared && sign < 0 ? "casal" : "pessoal",
          kind,
          sharedCents,
        });
        onClose();
      } catch {
        setError("Não consegui guardar. Tenta outra vez.");
      }
    });
  }

  const label = "mb-1.5 block text-xs font-medium text-ink-2";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-b-none p-6 sm:rounded-b-[var(--radius-2xl)]"
        role="dialog"
        aria-label="Adicionar movimento"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Adicionar movimento</h2>
          <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink" aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 text-sm">
          {([
            [-1, "Despesa"],
            [1, "Receita"],
          ] as const).map(([s, l]) => (
            <button key={s} type="button" onClick={() => setSign(s)} className={`h-9 rounded-full transition ${sign === s ? "bg-surface font-medium shadow-sm" : "text-ink-3"}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className={label}>Valor</span>
            <div className="relative">
              <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className="input num h-12 w-full pr-8 text-xl font-semibold" />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3">€</span>
            </div>
          </label>
          <label className="col-span-2 block">
            <span className={label}>Descrição</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Mercado de sábado" className="input w-full" maxLength={120} />
          </label>
          <label className="block">
            <span className={label}>Data</span>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="input w-full" />
          </label>
          <label className="block">
            <span className={label}>Conta</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="select h-10 w-full">
              {!cash && <option value="dinheiro">Dinheiro (carteira)</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bank === "dinheiro" ? "Dinheiro (carteira)" : a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>Categoria</span>
            <div className="[&_.select]:h-10">
              <CategorySelect value={categoryId} categories={categories} onChange={setCategoryId} />
            </div>
          </label>
          <label className="block">
            <span className={label}>Tipo</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="select h-10 w-full">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {sign < 0 && (
          <div className="mt-4 rounded-xl bg-surface-2 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              <Icon name="house" className="size-4 text-ink-3" /> É uma despesa partilhada
            </label>
            {shared && (
              <label className="mt-3 block">
                <span className={label}>Parte partilhada (vazio = tudo)</span>
                <div className="relative w-40">
                  <input inputMode="decimal" value={partial} onChange={(e) => setPartial(e.target.value)} placeholder="tudo" className="input num w-full pr-8 text-right" />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-3">€</span>
                </div>
              </label>
            )}
          </div>
        )}

        {error && <p className="mt-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 px-4 text-sm text-ink-3 hover:text-ink">
            Cancelar
          </button>
          <button disabled={pending} className="btn-primary">
            {pending ? "A guardar…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
