import Link from "next/link";
import { requireUser } from "@/server/auth";
import { countToReview } from "@/server/data";
import { logoutAction } from "./actions";
import { BottomNav, SideNav } from "@/components/nav-links";
import { Icon, Logo } from "@/components/icons";
import { DemoBanner } from "@/components/demo-banner";
import { hasDemo } from "@/server/demo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [toReview, demo] = await Promise.all([countToReview(user.id), hasDemo()]);
  const initial = user.displayName.slice(0, 1).toUpperCase();

  return (
    <div className="min-h-dvh lg:flex lg:gap-6 lg:p-5">
      {/* Computador: barra lateral */}
      <aside className="card sticky top-5 hidden h-[calc(100dvh-2.5rem)] w-[88px] shrink-0 flex-col items-center py-5 lg:flex">
        <Link href="/" aria-label="Resumo" className="mb-6">
          <Logo />
        </Link>
        <SideNav toReview={toReview} />
        <div className="mt-auto flex flex-col items-center gap-3">
          <form action={logoutAction}>
            <button className="flex size-10 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink" aria-label="Sair" title="Sair">
              <Icon name="logout" />
            </button>
          </form>
          <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong" title={user.displayName}>
            {initial}
          </span>
        </div>
      </aside>

      {/* Telemóvel: barra de topo */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 bg-bg/85 px-4 backdrop-blur lg:hidden">
        <Link href="/" aria-label="Resumo">
          <Logo className="size-7" />
        </Link>
        <span className="text-sm font-semibold tracking-tight">Finanças</span>
        <div className="ml-auto flex items-center gap-1">
          <form action={logoutAction}>
            <button className="flex size-9 items-center justify-center rounded-full text-ink-3 hover:bg-surface" aria-label="Sair">
              <Icon name="logout" />
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl min-w-0 px-4 pt-4 pb-28 sm:px-6 lg:px-1 lg:pt-3 lg:pb-10">
        {demo && <DemoBanner />}
        {children}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <BottomNav toReview={toReview} />
      </div>
    </div>
  );
}
