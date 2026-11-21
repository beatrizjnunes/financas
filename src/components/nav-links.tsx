"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

const LINKS: { href: string; label: string; icon: IconName; mobile: boolean }[] = [
  { href: "/", label: "Resumo", icon: "grid", mobile: true },
  { href: "/movimentos", label: "Movimentos", icon: "list", mobile: true },
  { href: "/analise", label: "Análise", icon: "chart", mobile: true },
  { href: "/orcamentos", label: "Orçamentos", icon: "target", mobile: true },
  { href: "/patrimonio", label: "Património", icon: "wallet", mobile: true },
  { href: "/partilhado", label: "Partilhado", icon: "house", mobile: true },
  { href: "/importar", label: "Importar", icon: "upload", mobile: false },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

function Badge({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span
      className={`num absolute rounded-full bg-review px-1 text-[10px] leading-4 font-semibold text-white ${className}`}
      aria-label={`${n} por rever`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Barra lateral (computador): ícones com etiqueta curta; o ativo fica num círculo escuro. */
export function SideNav({ toReview }: { toReview: number }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col items-center gap-1.5">
      {LINKS.map((l) => {
        const active = isActive(path, l.href);
        return (
          <Link key={l.href} href={l.href} className="group flex w-16 flex-col items-center gap-1 py-1" aria-current={active ? "page" : undefined}>
            <span
              className={`relative flex size-11 items-center justify-center rounded-full transition ${
                active ? "bg-ink text-bg" : "text-ink-2 group-hover:bg-surface-2 group-hover:text-ink"
              }`}
            >
              <Icon name={l.icon} />
              {l.href === "/movimentos" && toReview > 0 && <Badge n={toReview} className="-top-0.5 -right-1" />}
            </span>
            <span className={`text-[10.5px] ${active ? "font-medium text-ink" : "text-ink-3"}`}>{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra inferior (telemóvel). */
export function BottomNav({ toReview }: { toReview: number }) {
  const path = usePathname();
  return (
    <nav className="grid grid-cols-6">
      {LINKS.filter((l) => l.mobile).map((l) => {
        const active = isActive(path, l.href);
        return (
          <Link key={l.href} href={l.href} className="flex flex-col items-center gap-0.5 py-2" aria-current={active ? "page" : undefined}>
            <span className={`relative flex h-8 w-11 items-center justify-center rounded-full transition ${active ? "bg-ink text-bg" : "text-ink-3"}`}>
              <Icon name={l.icon} className="size-[18px]" />
              {l.href === "/movimentos" && toReview > 0 && <Badge n={toReview} className="-top-1 right-0.5" />}
            </span>
            <span className={`max-w-full truncate px-0.5 text-[9.5px] ${active ? "font-medium text-ink" : "text-ink-3"}`}>{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
