"use client";

import { KIND_LABEL, KINDS, type Kind, SCOPE_LABEL, SCOPES, type Scope } from "@/lib/labels";
import { formatEUR } from "@/lib/format";

export type CategoryOption = { id: string; name: string; groupName: string };

export function ScopeDot({ scope }: { scope: Scope }) {
  return <span className="scope-dot" style={{ background: `var(--scope-${scope})` }} />;
}

export function ScopeSelect({
  value,
  onChange,
  className = "",
}: {
  value: Scope;
  onChange: (s: Scope) => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2">
        <ScopeDot scope={value} />
      </span>
      <select
        aria-label="Âmbito"
        value={value}
        onChange={(e) => onChange(e.target.value as Scope)}
        className="select w-full pl-6"
        style={{ paddingLeft: "1.5rem" }}
      >
        {SCOPES.map((s) => (
          <option key={s} value={s}>
            {SCOPE_LABEL[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CategorySelect({
  value,
  categories,
  onChange,
  placeholder = "Sem categoria",
  flagMissing = false,
}: {
  value: string | null;
  categories: CategoryOption[];
  onChange: (id: string | null) => void;
  placeholder?: string;
  flagMissing?: boolean;
}) {
  const groups = [...new Set(categories.map((c) => c.groupName))];
  return (
    <select
      aria-label="Categoria"
      value={value ?? ""}
      data-empty={!value}
      data-missing={flagMissing && !value}
      onChange={(e) => onChange(e.target.value || null)}
      className="select w-full"
    >
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {categories
            .filter((c) => c.groupName === g)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export function KindSelect({ value, onChange }: { value: Kind; onChange: (k: Kind) => void }) {
  return (
    <select aria-label="Tipo" value={value} onChange={(e) => onChange(e.target.value as Kind)} className="select w-full">
      {KINDS.map((k) => (
        <option key={k} value={k}>
          {KIND_LABEL[k]}
        </option>
      ))}
    </select>
  );
}

export function Amount({ cents, muted, className = "" }: { cents: number; muted?: boolean; className?: string }) {
  const tone = muted ? "text-ink-3 line-through decoration-ink-3/40" : cents > 0 ? "text-pos" : "";
  return (
    <span className={`num whitespace-nowrap text-right ${tone} ${className}`}>
      {formatEUR(cents, { sign: cents > 0 })}
    </span>
  );
}

/** Barra de ações em massa — aparece quando há linhas selecionadas. */
export function BulkBar({
  count,
  categories,
  onScope,
  onCategory,
  onKind,
  onReviewed,
  onDelete,
  onClear,
}: {
  count: number;
  categories: CategoryOption[];
  onScope: (s: Scope) => void;
  onCategory: (id: string | null) => void;
  onKind: (k: Kind) => void;
  onReviewed?: () => void;
  onDelete?: () => void;
  onClear: () => void;
}) {
  if (!count) return null;
  return (
    <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-surface p-2 pl-3 text-sm shadow-sm">
      <span className="font-medium">
        {count} {count === 1 ? "selecionada" : "selecionadas"}
      </span>
      <span className="mx-1 h-4 w-px bg-line" />
      <span className="text-ink-3">Marcar como</span>
      {(["pessoal", "casal", "ignorar"] as Scope[]).map((s) => (
        <button
          key={s}
          onClick={() => onScope(s)}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 transition hover:border-line-strong hover:bg-surface-2"
        >
          <ScopeDot scope={s} />
          {SCOPE_LABEL[s]}
        </button>
      ))}
      <div className="w-40">
        <CategorySelect value={null} categories={categories} onChange={(id) => id && onCategory(id)} placeholder="Categoria…" />
      </div>
      <div className="w-28">
        <select aria-label="Tipo" value="" onChange={(e) => e.target.value && onKind(e.target.value as Kind)} className="select w-full" data-empty>
          <option value="">Tipo…</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      {onReviewed && (
        <button
          onClick={onReviewed}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 transition hover:border-line-strong hover:bg-surface-2"
        >
          ✓ Revisto
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-danger transition hover:border-danger hover:bg-danger-bg"
        >
          Apagar
        </button>
      )}
      <button onClick={onClear} className="ml-auto px-2 text-ink-3 hover:text-ink">
        Limpar
      </button>
    </div>
  );
}
