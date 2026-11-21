"use client";

import { useState, useTransition } from "react";
import { goalPlan, monthLong } from "@/lib/analytics";
import { formatDate, formatEUR, parseAmountToCents } from "@/lib/format";
import { INVESTMENT_LABEL, INVESTMENT_TYPES, type InvestmentType } from "@/lib/labels";
import { Icon } from "@/components/icons";
import { addToGoalAction, deleteGoalAction, deleteInvestmentAction, saveGoalAction, saveInvestmentAction, setBalanceAction } from "./actions";

const toInput = (c: number | null | undefined) => (c == null ? "" : (c / 100).toLocaleString("pt-PT", { maximumFractionDigits: 2, useGrouping: false }));
function parse(v: string, allowNegative = false): number | null {
  if (!v.trim()) return null;
  const c = parseAmountToCents(v, ",");
  return allowNegative ? c : Math.abs(c);
}

function EuroInput({ value, onChange, placeholder, className = "", autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  return (
    <span className={`relative block ${className}`}>
      <input autoFocus={autoFocus} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input num h-9 w-full pr-7 text-right" />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-3">€</span>
    </span>
  );
}

/* ---------- contas ---------- */

export type AccountRow = {
  accountId: string;
  name: string;
  bank: string;
  balanceCents: number | null;
  date: string | null;
  source: "manual" | "extrato" | null;
  statementCents: number | null;
  statementDate: string | null;
};

export function AccountsEditor({ accounts }: { accounts: AccountRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {accounts.map((a) => (
        <AccountLine key={a.accountId} a={a} />
      ))}
    </ul>
  );
}

function AccountLine({ a }: { a: AccountRow }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  function save(clear = false) {
    let c: number | null = null;
    if (!clear) {
      try {
        c = parse(value, true);
      } catch {
        setErr(true);
        return;
      }
      if (c == null) return;
    }
    start(async () => {
      await setBalanceAction({ accountId: a.accountId, cents: c });
      setEditing(false);
    });
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
          <Icon name="wallet" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{a.bank === "dinheiro" ? "Dinheiro (carteira)" : a.name}</p>
          <p className="truncate text-xs text-ink-3">
            {a.source === "manual" ? (
              <>
                <span className="text-warn">✎ Atualizado à mão</span> a {formatDate(a.date!)}
                {a.statementCents != null && <> · extrato: {formatEUR(a.statementCents)}</>}
              </>
            ) : a.source === "extrato" ? (
              <>Do extrato de {formatDate(a.date!)}</>
            ) : (
              "Sem saldo"
            )}
          </p>
        </div>
        {!editing && (
          <>
            <span className="num text-right font-semibold">{a.balanceCents != null ? formatEUR(a.balanceCents) : "—"}</span>
            <button
              onClick={() => {
                setValue(toInput(a.balanceCents));
                setErr(false);
                setEditing(true);
              }}
              className="flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
              aria-label={`Atualizar saldo de ${a.name}`}
            >
              <Icon name="pencil" className="size-4" />
            </button>
          </>
        )}
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-12">
          <EuroInput autoFocus value={value} onChange={(v) => (setValue(v), setErr(false))} className={`w-36 ${err ? "[&_input]:border-danger" : ""}`} />
          <button onClick={() => save()} disabled={pending} className="btn-primary h-9 px-4">
            Guardar
          </button>
          {a.source === "manual" && (
            <button onClick={() => save(true)} disabled={pending} className="text-xs text-ink-3 hover:text-ink">
              Usar o do extrato
            </button>
          )}
          <button onClick={() => setEditing(false)} className="text-xs text-ink-3 hover:text-ink">
            Cancelar
          </button>
        </div>
      )}
    </li>
  );
}

/* ---------- investimentos ---------- */

export type InvestmentRow = { id: string; name: string; type: InvestmentType; investedCents: number; valueCents: number; updatedAt: string | null };

export function InvestmentsEditor({ items }: { items: InvestmentRow[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  return (
    <div>
      {items.length > 0 && (
        <ul className="divide-y divide-line">
          {items.map((i) =>
            editing === i.id ? (
              <li key={i.id} className="py-3">
                <InvestmentForm item={i} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <InvestmentLine key={i.id} i={i} onEdit={() => setEditing(i.id)} />
            ),
          )}
        </ul>
      )}
      {editing === "new" ? (
        <div className="mt-3 rounded-xl bg-surface-2 p-4">
          <InvestmentForm onDone={() => setEditing(null)} />
        </div>
      ) : (
        <button onClick={() => setEditing("new")} className="btn-soft mt-4">
          + Adicionar investimento
        </button>
      )}
    </div>
  );
}

function InvestmentLine({ i, onEdit }: { i: InvestmentRow; onEdit: () => void }) {
  const gain = i.valueCents - i.investedCents;
  const ratio = i.investedCents > 0 ? gain / i.investedCents : 0;
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
        <Icon name="chart" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{i.name}</p>
        <p className="truncate text-xs text-ink-3">
          {INVESTMENT_LABEL[i.type]} · investido {formatEUR(i.investedCents)}
          {i.updatedAt && <> · valor a {formatDate(i.updatedAt)}</>}
        </p>
      </div>
      <div className="text-right">
        <p className="num text-sm font-semibold">{formatEUR(i.valueCents)}</p>
        <span className={`chip ${gain >= 0 ? "chip-pos" : "chip-neg"}`}>
          {formatEUR(gain, { sign: true })} ({gain >= 0 ? "+" : "−"}
          {Math.abs(Math.round(ratio * 1000) / 10).toLocaleString("pt-PT")}%)
        </span>
      </div>
      <button onClick={onEdit} className="flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Editar ${i.name}`}>
        <Icon name="pencil" className="size-4" />
      </button>
    </li>
  );
}

function InvestmentForm({ item, onDone }: { item?: InvestmentRow; onDone: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [type, setType] = useState<InvestmentType>(item?.type ?? "etf");
  const [invested, setInvested] = useState(toInput(item?.investedCents));
  const [value, setValue] = useState(toInput(item?.valueCents));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    let inv: number | null, val: number | null;
    try {
      inv = parse(invested);
      val = parse(value);
    } catch {
      setErr("Confirma os valores.");
      return;
    }
    if (!name.trim() || inv == null) {
      setErr("Falta o nome ou o valor investido.");
      return;
    }
    start(async () => {
      await saveInvestmentAction({ id: item?.id, name: name.trim(), type, investedCents: inv!, valueCents: val ?? inv! });
      onDone();
    });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: ETF VWCE, ações da Apple" className="input h-9 sm:col-span-2" autoFocus maxLength={80} />
      <select value={type} onChange={(e) => setType(e.target.value as InvestmentType)} className="select h-9">
        {INVESTMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {INVESTMENT_LABEL[t]}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-ink-3">
          Investido
          <EuroInput value={invested} onChange={setInvested} placeholder="0" />
        </label>
        <label className="text-[11px] text-ink-3">
          Vale hoje
          <EuroInput value={value} onChange={setValue} placeholder="= investido" />
        </label>
      </div>
      {err && <p className="text-xs text-danger sm:col-span-2">{err}</p>}
      <div className="flex items-center gap-2 sm:col-span-2">
        <button onClick={save} disabled={pending} className="btn-primary h-9 px-4">
          Guardar
        </button>
        <button onClick={onDone} className="text-sm text-ink-3 hover:text-ink">
          Cancelar
        </button>
        {item && (
          <button
            onClick={() => confirm(`Apagar "${item.name}"?`) && start(async () => (await deleteInvestmentAction(item.id), onDone()))}
            className="ml-auto text-sm text-ink-3 hover:text-danger"
          >
            Apagar
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- objetivos ---------- */

export type GoalRow = { id: string; name: string; targetCents: number; savedCents: number; targetMonth: string | null };

export function GoalsEditor({ goals, currentMonth }: { goals: GoalRow[]; currentMonth: string }) {
  const [creating, setCreating] = useState(false);
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {goals.map((g) => (
          <GoalCard key={g.id} g={g} currentMonth={currentMonth} />
        ))}
        {creating ? (
          <div className="rounded-2xl bg-surface-2 p-4">
            <GoalForm onDone={() => setCreating(false)} />
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex min-h-36 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line-strong text-sm text-ink-3 transition hover:border-accent hover:text-accent"
          >
            <span className="text-2xl">＋</span>
            Novo objetivo
          </button>
        )}
      </div>
    </div>
  );
}

function GoalCard({ g, currentMonth }: { g: GoalRow; currentMonth: string }) {
  const p = goalPlan(g, currentMonth);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState("");
  const [pending, start] = useTransition();

  if (editing)
    return (
      <div className="rounded-2xl bg-surface-2 p-4">
        <GoalForm goal={g} onDone={() => setEditing(false)} />
      </div>
    );

  function add(sign: 1 | -1) {
    let c: number | null;
    try {
      c = parse(adding);
    } catch {
      return;
    }
    if (!c) return;
    start(async () => {
      await addToGoalAction({ id: g.id, cents: sign * c! });
      setAdding("");
    });
  }

  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">🎯 {g.name}</p>
          <p className="text-xs text-ink-3">
            {g.targetMonth ? `até ${monthLong(g.targetMonth)}` : "sem data"}
            {p.done && " · atingido 🎉"}
            {p.late && " · prazo passado"}
          </p>
        </div>
        <button onClick={() => setEditing(true)} className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Editar ${g.name}`}>
          <Icon name="pencil" className="size-4" />
        </button>
      </div>
      <p className="num mt-3 text-xl font-semibold tracking-tight">
        {formatEUR(g.savedCents)} <span className="text-sm font-normal text-ink-3">de {formatEUR(g.targetCents)}</span>
      </p>
      <div className="mt-2 h-2.5 rounded-full bg-surface-2">
        <div className={`h-2.5 rounded-full ${p.done ? "bg-pos" : "bg-accent"}`} style={{ width: `${Math.max(p.ratio * 100, 2)}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink-2">
        {p.done
          ? "Objetivo cumprido."
          : p.perMonthCents != null
            ? <>Faltam {formatEUR(p.remainingCents)} — poupa <b className="num">{formatEUR(p.perMonthCents)}</b>/mês{p.monthsLeft! > 0 ? ` durante ${p.monthsLeft} ${p.monthsLeft === 1 ? "mês" : "meses"}` : ""}.</>
            : `Faltam ${formatEUR(p.remainingCents)}.`}
      </p>
      <div className="mt-3 flex items-center gap-1.5">
        <EuroInput value={adding} onChange={setAdding} placeholder="valor" className="w-28" />
        <button onClick={() => add(1)} disabled={pending || !adding} className="btn-soft h-9 disabled:opacity-40">
          + Juntar
        </button>
        <button onClick={() => add(-1)} disabled={pending || !adding} className="h-9 px-2 text-xs text-ink-3 hover:text-ink disabled:opacity-40">
          Retirar
        </button>
      </div>
    </div>
  );
}

function GoalForm({ goal, onDone }: { goal?: GoalRow; onDone: () => void }) {
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(toInput(goal?.targetCents));
  const [saved, setSaved] = useState(toInput(goal?.savedCents ?? 0));
  const [month, setMonth] = useState(goal?.targetMonth ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    let t: number | null, s: number | null;
    try {
      t = parse(target);
      s = parse(saved);
    } catch {
      setErr("Confirma os valores.");
      return;
    }
    if (!name.trim() || !t) {
      setErr("Falta o nome ou o valor do objetivo.");
      return;
    }
    start(async () => {
      await saveGoalAction({ id: goal?.id, name: name.trim(), targetCents: t!, savedCents: s ?? 0, targetMonth: month || null });
      onDone();
    });
  }

  return (
    <div className="grid gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Férias no Japão" className="input h-9" autoFocus maxLength={80} />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-ink-3">
          Objetivo
          <EuroInput value={target} onChange={setTarget} placeholder="0" />
        </label>
        <label className="text-[11px] text-ink-3">
          Já poupado
          <EuroInput value={saved} onChange={setSaved} placeholder="0" />
        </label>
      </div>
      <label className="text-[11px] text-ink-3">
        Até quando (opcional)
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input h-9 w-full" />
      </label>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={pending} className="btn-primary h-9 px-4">
          Guardar
        </button>
        <button onClick={onDone} className="text-sm text-ink-3 hover:text-ink">
          Cancelar
        </button>
        {goal && (
          <button
            onClick={() => confirm(`Apagar "${goal.name}"?`) && start(async () => (await deleteGoalAction(goal.id), onDone()))}
            className="ml-auto text-sm text-ink-3 hover:text-danger"
          >
            Apagar
          </button>
        )}
      </div>
    </div>
  );
}
