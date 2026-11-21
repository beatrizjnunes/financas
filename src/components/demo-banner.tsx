"use client";

import { useTransition } from "react";
import { clearDemoAction, loadDemoAction } from "@/app/(app)/actions";

/** Aviso fixo enquanto houver dados fictícios, com o botão para os apagar. */
export function DemoBanner() {
  const [pending, start] = useTransition();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-warn-bg px-4 py-3 text-sm">
      <p className="mr-auto">
        <b className="font-semibold text-warn">Estás a ver dados fictícios.</b>{" "}
        <span className="text-ink-2">Servem só para experimentar — apaga-os antes de importares os teus extratos.</span>
      </p>
      <button
        disabled={pending}
        onClick={() => confirm("Apagar todos os dados fictícios? Os teus dados reais não são tocados.") && start(() => clearDemoAction())}
        className="btn-primary h-9"
      >
        {pending ? "A apagar…" : "Apagar dados fictícios"}
      </button>
    </div>
  );
}

export function LoadDemoButton() {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(() => loadDemoAction())} className="btn-soft">
      {pending ? "A criar dados…" : "Experimentar com dados fictícios"}
    </button>
  );
}
