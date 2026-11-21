import { requireUser } from "@/server/auth";
import { countToReview, myAvatar } from "@/server/data";
import { BottomNav, HomeLogo, SideNav } from "@/components/nav-links";
import { ProfileMenu } from "@/components/profile-menu";
import { DemoBanner } from "@/components/demo-banner";
import { hasDemo } from "@/server/demo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [toReview, demo, avatar] = await Promise.all([countToReview(user.id), hasDemo(), myAvatar(user.id)]);

  return (
    <div className="min-h-dvh lg:flex lg:gap-6 lg:p-5">
      {/* Computador: barra lateral (o logótipo leva ao Resumo) */}
      <aside className="card sticky top-5 hidden h-[calc(100dvh-2.5rem)] w-[88px] shrink-0 flex-col items-center py-4 lg:flex">
        <div className="mb-5">
          <HomeLogo size="size-9" />
        </div>
        <SideNav toReview={toReview} />
        <div className="mt-auto">
          <ProfileMenu name={user.displayName} avatar={avatar} placement="side" />
        </div>
      </aside>

      {/* Telemóvel: barra de topo */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-bg/85 px-3 backdrop-blur lg:hidden">
        <HomeLogo size="size-7" />
        <span className="text-sm font-semibold tracking-tight">Finanças</span>
        <div className="ml-auto">
          <ProfileMenu name={user.displayName} avatar={avatar} placement="top" />
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
