"use client";

import Link from "next/link";
import { useTransition } from "react";
import { markAllReviewedAction } from "./actions";

export function ReviewBanner({ toReview, imported, filtering }: { toReview: number; imported: number | null; filtering: boolean }) {
  const [pending, start] = useTransition();

  if (toReview === 0) {
    return (
      <div className="mb-6 flex items-center justify-between card rounded-xl px-4 py-3 text-sm">
        <span>Está tudo revisto. 👌</span>
        <Link href="/movimentos" className="text-ink-2 hover:text-ink">
          Ver todos os movimentos
        </Link>
      </div>
    );
  }

  return (
    <div className="needs-review mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-review-bg px-4 py-3 text-sm">
      <div className="mr-auto">
        {imported ? (
          <p className="font-medium">
            {imported} {imported === 1 ? "movimento importado" : "movimentos importados"}.
          </p>
        ) : null}
        <p className={imported ? "text-ink-2" : "font-medium"}>
          {toReview} {toReview === 1 ? "movimento por rever" : "movimentos por rever"} — confirma a categoria e se é Pessoal ou Partilhado.
          Editar um movimento marca-o como revisto.
        </p>
      </div>
      {filtering ? (
        <Link href="/movimentos" className="text-ink-2 hover:text-ink">
          Ver todos
        </Link>
      ) : (
        <Link href="/movimentos?rever=1" className="font-medium text-ink hover:underline">
          Ver só estes
        </Link>
      )}
      <button
        disabled={pending}
        onClick={() => start(() => markAllReviewedAction())}
        className="h-8 rounded-lg border border-line-strong bg-surface px-3 text-ink transition hover:bg-surface-2 disabled:opacity-50"
      >
        {pending ? "A marcar…" : "Marcar todos como revistos"}
      </button>
    </div>
  );
}
