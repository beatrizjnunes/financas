"use client";

import { useState } from "react";
import { formatEUR, parseAmountToCents } from "@/lib/format";
import { normalizeShared } from "@/lib/split";
import { Icon } from "@/components/icons";

const toInput = (cents: number) => (cents / 100).toLocaleString("pt-PT", { maximumFractionDigits: 2, useGrouping: false });

/**
 * Num movimento Partilhado, permite dizer que só uma parte é da casa. Quando a parte foi editada,
 * fica sempre visível ("Parte editada · 30,00 € de 65,38 €").
 */
export function SharedPart({
  amountCents,
  sharedCents,
  onSave,
}: {
  amountCents: number;
  sharedCents: number | null;
  onSave: (cents: number | null) => void;
}) {
  const total = Math.abs(amountCents);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  function open() {
    setValue(toInput(sharedCents ?? Math.round(total / 2)));
    setError(false);
    setEditing(true);
  }

  function save(cents: number | null) {
    onSave(normalizeShared(amountCents, cents));
    setEditing(false);
  }

  function submit() {
    try {
      save(Math.abs(parseAmountToCents(value, ",")));
    } catch {
      setError(true);
    }
  }

  if (editing) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-ink-3">Parte partilhada</span>
        <label className="relative">
          <span className="sr-only">Valor partilhado em euros</span>
          <input
            autoFocus
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setEditing(false);
            }}
            className={`input num h-7 w-24 rounded-lg pr-6 text-right text-xs ${error ? "border-danger" : ""}`}
          />
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-ink-3">€</span>
        </label>
        <span className="num text-ink-3">de {formatEUR(total)}</span>
        <button type="button" onClick={() => setValue(toInput(Math.round(total / 2)))} className="chip chip-muted hover:bg-line">
          Metade
        </button>
        <button type="button" onClick={() => save(null)} className="chip chip-muted hover:bg-line">
          Tudo
        </button>
        <button type="button" onClick={submit} className="chip bg-ink text-bg">
          Guardar
        </button>
        <button type="button" onClick={() => setEditing(false)} className="px-1 text-ink-3 hover:text-ink">
          Cancelar
        </button>
      </div>
    );
  }

  if (sharedCents == null) {
    return (
      <button type="button" onClick={open} className="mt-1 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-accent">
        <Icon name="house" className="size-3.5" /> Tudo partilhado · <span className="underline decoration-dotted underline-offset-2">dividir</span>
      </button>
    );
  }

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
      <span className="chip chip-warn">
        <Icon name="pencil" className="size-3" /> Parte editada
      </span>
      <span className="num text-ink-2">
        <b className="font-medium text-ink">{formatEUR(sharedCents)}</b> partilhado de {formatEUR(total)} · {formatEUR(total - sharedCents)} pessoal
      </span>
      <button type="button" onClick={open} className="text-ink-3 underline decoration-dotted underline-offset-2 hover:text-accent">
        editar
      </button>
    </p>
  );
}
