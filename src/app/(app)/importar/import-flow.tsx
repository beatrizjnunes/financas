"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { formatDate, formatEUR, formatTime } from "@/lib/format";
import { BANK_LABEL, type Bank, type Kind, SCOPE_LABEL, SCOPES, type Scope } from "@/lib/labels";
import type { Preview, PreviewRow } from "@/server/import/service";
import {
  Amount,
  BulkBar,
  CategorySelect,
  type CategoryOption,
  KindSelect,
  ScopeDot,
  ScopeSelect,
} from "@/components/tx-controls";
import { confirmAction, previewAction } from "./actions";

type AccountOption = { id: string; name: string; bank: Bank; supported: boolean };
type Edit = { scope: Scope; kind: Kind; categoryId: string | null };

const STEPS = ["Carregar", "Rever", "Confirmar"];

/** Lê o CSV em UTF-8; se não for UTF-8 válido (ex.: Caixa, em Windows-1252), usa Windows-1252. */
async function readText(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export function ImportFlow({ accounts, categories }: { accounts: AccountOption[]; categories: CategoryOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState(accounts.find((a) => a.supported)?.id ?? "");
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [error, setError] = useState<string | null>(null);

  const account = accounts.find((a) => a.id === accountId);

  async function handleFile(f: File) {
    setError(null);
    if (!/\.csv$/i.test(f.name)) {
      setError("Por agora só aceito ficheiros CSV.");
      return;
    }
    const content = await readText(f);
    setFile({ name: f.name, content });
    startTransition(async () => {
      const res = await previewAction(accountId, content);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res.data);
      setEdits(
        Object.fromEntries(
          res.data.rows
            .filter((r) => !r.duplicate)
            .map((r) => [r.key, { scope: r.scope, kind: r.kind, categoryId: r.categoryId }]),
        ),
      );
    });
  }

  function confirm() {
    if (!file || !preview) return;
    startTransition(async () => {
      const res = await confirmAction(accountId, file.name, file.content, edits);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/movimentos?importados=${res.data.imported}${res.data.imported ? "&rever=1" : ""}`);
    });
  }

  function reset() {
    setPreview(null);
    setFile(null);
    setEdits({});
    setError(null);
  }

  const step = preview ? 1 : 0;

  return (
    <div>
      <Link href="/movimentos" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        ← Movimentos
      </Link>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight sm:text-[28px]">Importar extrato</h1>
          <p className="mt-1 text-sm text-ink-3">
            {preview && account ? `${account.name} · ${file?.name}` : "Carrega o CSV exportado da app do banco."}
          </p>
        </div>
        <ol className="flex items-center gap-2 text-xs">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className={`flex size-5 items-center justify-center rounded-full text-[11px] font-medium ${
                  i <= step ? "bg-ink text-bg" : "bg-surface-2 text-ink-3"
                }`}
              >
                {i + 1}
              </span>
              <span className={i <= step ? "text-ink" : "text-ink-3"}>{s}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-5 bg-line-strong" />}
            </li>
          ))}
        </ol>
      </div>

      {error && (
        <div role="alert" className="mb-6 rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!preview ? (
        <UploadStep
          accounts={accounts}
          accountId={accountId}
          onAccount={(id) => {
            setAccountId(id);
            setError(null);
          }}
          onFile={handleFile}
          loading={pending}
        />
      ) : (
        <ReviewStep
          preview={preview}
          accountName={account?.name ?? ""}
          edits={edits}
          setEdits={setEdits}
          categories={categories}
          onBack={reset}
          onConfirm={confirm}
          saving={pending}
        />
      )}
    </div>
  );
}

function UploadStep({
  accounts,
  accountId,
  onAccount,
  onFile,
  loading,
}: {
  accounts: AccountOption[];
  accountId: string;
  onAccount: (id: string) => void;
  onFile: (f: File) => void;
  loading: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const selected = accounts.find((a) => a.id === accountId);

  return (
    <div className="mx-auto max-w-xl">
      <p className="mb-3 text-xs font-medium tracking-wide text-ink-3 uppercase">Conta</p>
      <div className="grid grid-cols-2 gap-2">
        {accounts.map((a) => (
          <button
            key={a.id}
            disabled={!a.supported}
            onClick={() => onAccount(a.id)}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              a.id === accountId ? "border-ink bg-surface" : "border-line bg-surface hover:border-line-strong"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span className="block text-sm font-medium">{a.name}</span>
            <span className="block text-xs text-ink-3">{a.supported ? BANK_LABEL[a.bank] : "Disponível em breve"}</span>
          </button>
        ))}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => selected?.supported && input.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f && selected?.supported) onFile(f);
        }}
        className={`mt-6 flex h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition ${
          drag ? "border-accent bg-surface" : "border-line-strong hover:border-ink-3"
        } ${!selected?.supported ? "pointer-events-none opacity-50" : ""}`}
      >
        {loading ? (
          <p className="text-sm text-ink-2">A ler o ficheiro…</p>
        ) : (
          <>
            <p className="text-sm font-medium">Arrasta o ficheiro para aqui</p>
            <p className="mt-1 text-sm text-ink-3">ou clica para escolher · CSV</p>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {selected?.bank === "revolut" && (
        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          Na app da Revolut: conta → ⋯ → Extrato → Excel/CSV, escolhe o período. Podes importar períodos que se sobrepõem — os
          movimentos repetidos são detetados.
        </p>
      )}
      {selected?.bank === "ing" && (
        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          No Mijn ING (site, em inglês): conta → descarregar movimentos → CSV separado por ponto e vírgula (;), escolhe o
          período. Podes importar períodos que se sobrepõem — os movimentos repetidos são detetados.
        </p>
      )}
    </div>
  );
}

type Filters = { q: string; scope: Scope | ""; categoryId: string; min: string; max: string };

function ReviewStep({
  preview,
  accountName,
  edits,
  setEdits,
  categories,
  onBack,
  onConfirm,
  saving,
}: {
  preview: Preview;
  accountName: string;
  edits: Record<string, Edit>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, Edit>>>;
  categories: CategoryOption[];
  onBack: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({ q: "", scope: "", categoryId: "", min: "", max: "" });
  const [showDupes, setShowDupes] = useState(false);
  const [onlySuspect, setOnlySuspect] = useState(false);

  const fresh = preview.rows.filter((r) => !r.duplicate);
  const dupes = preview.rows.length - fresh.length;
  const suspect = fresh.filter((r) => r.possibleDuplicate).length;

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const min = filters.min ? Math.round(Number(filters.min.replace(",", ".")) * 100) : null;
    const max = filters.max ? Math.round(Number(filters.max.replace(",", ".")) * 100) : null;
    return preview.rows.filter((r) => {
      if (r.duplicate && !showDupes) return false;
      if (onlySuspect && !r.possibleDuplicate) return false;
      const e = edits[r.key];
      if (q && !`${r.description} ${r.descriptionOriginal}`.toLowerCase().includes(q)) return false;
      if (filters.scope && e?.scope !== filters.scope) return false;
      if (filters.categoryId === "sem" ? e?.categoryId : filters.categoryId && e?.categoryId !== filters.categoryId)
        return false;
      const abs = Math.abs(r.amountCents);
      if (min != null && abs < min) return false;
      if (max != null && abs > max) return false;
      return true;
    });
  }, [preview.rows, edits, filters, showDupes, onlySuspect]);

  const selectable = visible.filter((r) => !r.duplicate);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.key));

  const patch = (keys: Iterable<string>, p: Partial<Edit>) =>
    setEdits((prev) => {
      const next = { ...prev };
      for (const k of keys) if (next[k]) next[k] = { ...next[k], ...p };
      return next;
    });

  const counts = SCOPES.map((s) => [s, fresh.filter((r) => edits[r.key]?.scope === s).length] as const).filter(
    ([, n]) => n > 0,
  );
  const uncategorized = fresh.filter((r) => !edits[r.key]?.categoryId && edits[r.key]?.scope !== "ignorar").length;

  return (
    <div className="pb-28">
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Stat label="Novos" value={fresh.length} />
        {dupes > 0 && (
          <button onClick={() => setShowDupes((v) => !v)} className="text-left">
            <Stat label="Já importados" value={dupes} muted hint={showDupes ? "esconder" : "mostrar"} />
          </button>
        )}
        {suspect > 0 && (
          <button onClick={() => setOnlySuspect((v) => !v)} className="text-left">
            <Stat label="Possíveis duplicados" value={suspect} hint={onlySuspect ? "ver todos" : "ver"} />
          </button>
        )}
        {preview.skipped.length > 0 && (
          <Stat
            label="Postos de parte"
            value={preview.skipped.length}
            muted
            title={preview.skipped.map((s) => `${s.description}: ${s.reason}`).join("\n")}
          />
        )}
        {uncategorized > 0 && (
          <button
            onClick={() => setFilters((f) => ({ ...f, categoryId: f.categoryId === "sem" ? "" : "sem" }))}
            className="text-left"
          >
            <Stat label="Sem categoria" value={uncategorized} muted hint={filters.categoryId === "sem" ? "ver todos" : "ver"} />
          </button>
        )}
      </div>

      {preview.skipped.length > 0 && (
        <details className="mb-6 text-sm text-ink-2">
          <summary className="cursor-pointer text-ink-3">Porque é que {preview.skipped.length} movimento(s) ficaram de fora?</summary>
          <ul className="mt-2 space-y-1 pl-4">
            {preview.skipped.map((s) => (
              <li key={s.line}>
                <span className="font-medium">{s.description}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {suspect > 0 && (
        <p className="mb-6 rounded-xl bg-review-bg px-4 py-3 text-sm text-review-ink">
          {suspect === 1 ? "1 movimento parece" : `${suspect} movimentos parecem`} já existir (mesmo valor, à mesma hora). Vão ser
          importados em suspenso: não contam nos totais até confirmares em Movimentos se são mesmo duplicados.
        </p>
      )}

      {fresh.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="font-medium">Nada de novo neste ficheiro</p>
          <p className="mt-1 text-sm text-ink-3">Todos os movimentos já tinham sido importados antes.</p>
          <button onClick={onBack} className="mt-6 h-9 rounded-lg border border-line px-4 text-sm hover:bg-surface-2">
            Carregar outro ficheiro
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Pesquisar…"
              className="input w-full sm:w-56"
            />
            <select
              value={filters.scope}
              data-empty={!filters.scope}
              onChange={(e) => setFilters({ ...filters, scope: e.target.value as Scope | "" })}
              className="select h-9 w-36"
              aria-label="Filtrar por âmbito"
            >
              <option value="">Todos os âmbitos</option>
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              value={filters.categoryId}
              data-empty={!filters.categoryId}
              onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
              className="select h-9 w-44"
              aria-label="Filtrar por categoria"
            >
              <option value="">Todas as categorias</option>
              <option value="sem">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5 text-sm text-ink-3">
              <input
                inputMode="decimal"
                value={filters.min}
                onChange={(e) => setFilters({ ...filters, min: e.target.value })}
                placeholder="mín €"
                className="input w-20"
                aria-label="Valor mínimo"
              />
              –
              <input
                inputMode="decimal"
                value={filters.max}
                onChange={(e) => setFilters({ ...filters, max: e.target.value })}
                placeholder="máx €"
                className="input w-20"
                aria-label="Valor máximo"
              />
            </div>
          </div>

          <BulkBar
            count={selected.size}
            categories={categories}
            onScope={(scope) => patch(selected, { scope })}
            onCategory={(categoryId) => patch(selected, { categoryId })}
            onKind={(kind) => patch(selected, { kind })}
            onClear={() => setSelected(new Set())}
          />

          <div className="overflow-hidden card">
            <div className="tx-row border-b border-line px-4 py-2.5 text-xs text-ink-3">
              <input
                type="checkbox"
                className="c-check"
                aria-label="Selecionar todas"
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.key)))
                }
              />
              <span className="c-desc">
                {visible.length} {visible.length === 1 ? "movimento" : "movimentos"}
              </span>
              <span className="c-controls hidden min-[900px]:grid">
                <span>Categoria</span>
                <span>Tipo</span>
                <span>Âmbito</span>
              </span>
              <span className="c-amount text-right">Valor</span>
            </div>

            {visible.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-3">Nenhum movimento com estes filtros.</p>}

            <ul className="divide-y divide-line">
              {visible.map((r) => (
                <ReviewRow
                  key={r.key}
                  row={r}
                  edit={edits[r.key]}
                  accountName={accountName}
                  categories={categories}
                  selected={selected.has(r.key)}
                  onSelect={(on) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(r.key);
                      else next.delete(r.key);
                      return next;
                    })
                  }
                  onChange={(p) => patch([r.key], p)}
                />
              ))}
            </ul>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
                {counts.map(([s, n]) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <ScopeDot scope={s} />
                    {SCOPE_LABEL[s]} <span className="num text-ink">{n}</span>
                  </span>
                ))}
              </div>
              <div className="ml-auto flex gap-2">
                <button onClick={onBack} disabled={saving} className="h-10 rounded-lg px-4 text-sm text-ink-2 hover:text-ink">
                  Cancelar
                </button>
                <button
                  onClick={onConfirm}
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? "A importar…" : `Importar ${fresh.length} ${fresh.length === 1 ? "movimento" : "movimentos"}`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ReviewRow({
  row,
  edit,
  accountName,
  categories,
  selected,
  onSelect,
  onChange,
}: {
  row: PreviewRow;
  edit: Edit | undefined;
  accountName: string;
  categories: CategoryOption[];
  selected: boolean;
  onSelect: (on: boolean) => void;
  onChange: (p: Partial<Edit>) => void;
}) {
  const showOriginal = row.description !== row.descriptionOriginal;
  return (
    <li
      className={`tx-row px-4 py-3 transition ${row.duplicate ? "opacity-45" : ""} ${selected ? "bg-surface-2" : ""} ${
        edit?.scope === "ignorar" ? "text-ink-3" : ""
      }`}
    >
      <input
        type="checkbox"
        className="c-check"
        disabled={row.duplicate}
        checked={selected}
        onChange={(e) => onSelect(e.target.checked)}
        aria-label={`Selecionar ${row.description}`}
      />
      <div className="c-desc">
        <p className="truncate text-sm font-medium" title={row.descriptionOriginal}>
          {row.description}
        </p>
        <p className="truncate text-xs text-ink-3">
          {formatDate(row.date)} · {accountName}
          {showOriginal && <span className="hidden sm:inline"> · {row.descriptionOriginal}</span>}
          {row.feeCents > 0 && row.amountCents !== -row.feeCents && <> · inclui comissão de {formatEUR(row.feeCents)}</>}
          {row.duplicate && <> · já importado</>}
        </p>
        {row.possibleDuplicate && (
          <p className="truncate text-xs font-medium text-review-ink">
            Possível duplicado de {row.possibleDuplicate.description} · {formatDate(row.possibleDuplicate.date)}{" "}
            {formatTime(row.possibleDuplicate.date)} · {row.possibleDuplicate.accountName}
          </p>
        )}
      </div>
      {edit ? (
        <div className="c-controls">
          <CategorySelect
            value={edit.categoryId}
            flagMissing={edit.scope === "pessoal" || edit.scope === "casal"}
            categories={categories}
            onChange={(categoryId) => onChange({ categoryId })}
          />
          <KindSelect value={edit.kind} onChange={(kind) => onChange({ kind })} />
          <ScopeSelect value={edit.scope} onChange={(scope) => onChange({ scope })} />
        </div>
      ) : (
        <div className="c-controls" />
      )}
      <Amount
        cents={row.amountCents}
        muted={!!edit && edit.scope !== "pessoal" && edit.scope !== "casal"}
        className="c-amount text-sm font-medium"
      />
    </li>
  );
}

function Stat({
  label,
  value,
  muted,
  hint,
  title,
}: {
  label: string;
  value: number;
  muted?: boolean;
  hint?: string;
  title?: string;
}) {
  return (
    <span title={title} className="flex items-baseline gap-1.5">
      <span className={`num text-lg font-semibold ${muted ? "text-ink-2" : ""}`}>{value}</span>
      <span className="text-ink-3">{label}</span>
      {hint && <span className="text-xs text-accent">{hint}</span>}
    </span>
  );
}
