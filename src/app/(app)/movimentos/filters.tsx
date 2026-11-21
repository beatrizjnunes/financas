"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SCOPE_LABEL, SCOPES } from "@/lib/labels";
import type { CategoryOption } from "@/components/tx-controls";

const KEYS = ["q", "conta", "categoria", "ambito", "de", "ate", "min", "max"] as const;

export function TxFiltersBar({ accounts, categories }: { accounts: { id: string; name: string }[]; categories: CategoryOption[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete("importados");
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${path}?${next}`, { scroll: false });
  }

  // Pesquisa com pequeno atraso para não recarregar a cada tecla.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => set("q", q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = KEYS.some((k) => params.get(k));
  const sel = (key: string) => ({
    value: params.get(key) ?? "",
    "data-empty": !params.get(key),
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => set(key, e.target.value),
  });

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex w-full gap-2 sm:w-auto">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar…" className="input w-full sm:w-56" />
        <button
          onClick={() => setOpen((v) => !v)}
          className="input shrink-0 text-ink-2 sm:hidden"
          aria-expanded={open}
        >
          Filtros{active ? " •" : ""}
        </button>
      </div>
      <div className={`${open ? "flex" : "hidden"} w-full flex-wrap items-center gap-2 sm:flex sm:w-auto`}>
      {accounts.length > 1 && (
        <select {...sel("conta")} className="select h-9 w-32" aria-label="Conta">
          <option value="">Todas as contas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      <select {...sel("categoria")} className="select h-9 w-44" aria-label="Categoria">
        <option value="">Todas as categorias</option>
        <option value="sem">Sem categoria</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select {...sel("ambito")} className="select h-9 w-40" aria-label="Âmbito">
        <option value="">Todos os âmbitos</option>
        <option value="contam">Pessoal + Casal</option>
        {SCOPES.map((s) => (
          <option key={s} value={s}>
            {SCOPE_LABEL[s]}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1.5 text-sm text-ink-3">
        <input type="date" value={params.get("de") ?? ""} onChange={(e) => set("de", e.target.value)} className="input w-36" aria-label="De" />
        –
        <input type="date" value={params.get("ate") ?? ""} onChange={(e) => set("ate", e.target.value)} className="input w-36" aria-label="Até" />
      </div>
      <div key={`${params.get("min")}-${params.get("max")}`} className="flex items-center gap-1.5 text-sm text-ink-3">
        <input
          inputMode="decimal"
          defaultValue={params.get("min") ?? ""}
          onBlur={(e) => set("min", e.target.value)}
          placeholder="mín €"
          className="input w-20"
          aria-label="Valor mínimo"
        />
        –
        <input
          inputMode="decimal"
          defaultValue={params.get("max") ?? ""}
          onBlur={(e) => set("max", e.target.value)}
          placeholder="máx €"
          className="input w-20"
          aria-label="Valor máximo"
        />
      </div>
      </div>
      {active && (
        <button
          onClick={() => {
            setQ("");
            router.replace(path, { scroll: false });
          }}
          className="px-2 text-sm text-ink-3 hover:text-ink"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
