"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/movimentos", label: "Movimentos" },
  { href: "/analise", label: "Análise" },
  { href: "/casal", label: "Casal" },
  { href: "/importar", label: "Importar" },
];

export function NavLinks({ toReview }: { toReview: number }) {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex gap-0.5 overflow-x-auto text-sm">
      {LINKS.map((l) => {
        const active = path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 transition ${
              active ? "bg-surface-2 font-medium text-ink" : "text-ink-3 hover:text-ink"
            }`}
          >
            {l.label}
            {l.href === "/movimentos" && toReview > 0 && (
              <span
                className="num rounded-full bg-review-bg px-1.5 text-[11px] leading-[18px] font-medium text-review-ink"
                aria-label={`${toReview} por rever`}
              >
                {toReview}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
