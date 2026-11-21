import { requireUser } from "@/server/auth";
import { countToReview } from "@/server/data";
import { logoutAction } from "./actions";
import { NavLinks } from "@/components/nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const toReview = await countToReview(user.id);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">Finanças</span>
          <NavLinks toReview={toReview} />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-ink-3 sm:inline">{user.displayName}</span>
            <form action={logoutAction}>
              <button className="text-ink-3 transition hover:text-ink">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
