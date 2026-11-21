"use client";

import { useMemo, useState, useTransition } from "react";
import { budgetStatus, roundUpToFive, type BudgetLine } from "@/lib/analytics";
import { formatEUR, parseAmountToCents } from "@/lib/format";
import { BudgetBar } from "@/components/charts";
import { saveBudgetsAction } from "./actions";

type Line = BudgetLine & { group: string };

const toInput = (cents: number | null) => (cents == null ? "" : (cents / 100).toLocaleString("pt-PT", { maximumFractionDigits: 2, useGrouping: false }));

function parse(v: string): number | null | "erro" {
  if (!v.trim()) return null;
  try {
    return Math.abs(parseAmountToCents(v, ","));
  } catch {
    return "erro";
  }
}

const STATUS = {
  excedido: { chip: "chip-neg", text: "Excedido" },
  atencao: { chip: "chip-warn", text: "Atenção" },
  ok: { chip: "chip-pos", text: "Dentro" },
  sem: { chip: "chip-muted", text: "Sem limite" },
} as const;

export function BudgetEditor({ lines, isCurrent }: { lines: Line[]; isCurrent: boolean }) {
  const initial = useMemo(() => Object.fromEntries(lines.map((l) => [l.key, toInput(l.budgetCents)])), [lines]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty = lines.filter((l) => (values[l.key] ?? "") !== initial[l.key]);
  const errors = new Set(lines.filter((l) => parse(values[l.key] ?? "") === "erro").map((l) => l.key));
  const fillable = lines.filter((l) => !values[l.key]?.trim() && l.avgCents > 0);

  function set(key: string, v: string) {
    setSaved(false);
    setValues((s) => ({ ...s, [key]: v }));
  }

  function fillSuggestions() {
    setSaved(false);
    setValues((s) => ({ ...s, ...Object.fromEntries(fillable.map((l) => [l.key, toInput(roundUpToFive(l.avgCents))])) }));
  }

  function save() {
    if (errors.size) return;
    start(async () => {
      await saveBudgetsAction(dirty.map((l) => ({ categoryId: l.key, cents: parse(values[l.key]) as number | null })));
      setSaved(true);
    });
  }

  const groups = [...new Set(lines.map((l) => l.group))];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={fillSuggestions} disabled={!fillable.length} className="btn-soft disabled:opacity-40">
          Preencher vazias com a média de 3 meses
        </button>
        <span className="text-xs text-ink-3">Arredonda para cima, a múltiplos de 5 €. Podes ajustar antes de guardar.</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {groups.map((g) => (
          <section key={g} className="card p-5">
            <h2 className="mb-3 text-xs font-medium tracking-wide text-ink-3 uppercase">{g}</h2>
            <ul className="space-y-4">
              {lines
                .filter((l) => l.group === g)
                .map((l) => {
                  const typed = parse(values[l.key] ?? "");
                  const budget = typeof typed === "number" ? typed : null;
                  const status = budgetStatus(l.spentCents, budget, isCurrent ? l.projectedCents : null);
                  return (
                    <li key={l.key}>
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            <span className="truncate">{l.name}</span>
                            {budget != null && <span className={`chip ${STATUS[status].chip}`}>{STATUS[status].text}</span>}
                          </p>
                          <p className="num mt-0.5 text-xs text-ink-3">
                            {formatEUR(l.spentCents)} gasto
                            {isCurrent && l.projectedCents != null && l.projectedCents > l.spentCents && <> · previsão {formatEUR(l.projectedCents)}</>}
                            {l.avgCents > 0 && <> · média {formatEUR(l.avgCents)}</>}
                          </p>
                        </div>
                        <label className="relative w-28 shrink-0">
                          <span className="sr-only">Orçamento de {l.name}</span>
                          <input
                            inputMode="decimal"
                            value={values[l.key] ?? ""}
                            onChange={(e) => set(l.key, e.target.value)}
                            placeholder={l.avgCents > 0 ? toInput(roundUpToFive(l.avgCents)) : "—"}
                            className={`input num h-9 w-full pr-7 text-right ${errors.has(l.key) ? "border-danger" : ""}`}
                          />
                          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-3">€</span>
                        </label>
                      </div>
                      {budget != null && (
                        <div className="mt-2">
                          <BudgetBar spent={l.spentCents} budget={budget} projected={isCurrent ? l.projectedCents : null} />
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>

      {(dirty.length > 0 || saved) && (
        <div className="sticky bottom-24 z-10 mt-4 flex justify-center lg:bottom-6">
          <div className="card flex items-center gap-3 rounded-full py-2 pr-2 pl-5 text-sm shadow-lg">
            {saved && !dirty.length ? (
              <span className="py-2 pr-3 text-pos">Orçamentos guardados ✓</span>
            ) : (
              <>
                <span className="text-ink-2">
                  {errors.size ? "Há valores inválidos" : `${dirty.length} ${dirty.length === 1 ? "alteração" : "alterações"} por guardar`}
                </span>
                <button type="button" onClick={() => setValues(initial)} className="text-ink-3 hover:text-ink">
                  Desfazer
                </button>
                <button type="button" onClick={save} disabled={pending || errors.size > 0} className="btn-primary h-9">
                  {pending ? "A guardar…" : "Guardar"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
