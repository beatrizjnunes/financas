"use client";

import { useActionState } from "react";
import { Logo } from "@/components/icons";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(loginAction, null);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form action={action} className="card w-full max-w-sm p-8">
        <Logo className="size-10" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Finanças</h1>
        <p className="mt-1 text-sm text-ink-3">Entra com a tua conta.</p>

        <div className="mt-8 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-2">Utilizador</span>
            <input name="username" autoComplete="username" autoCapitalize="none" required className="input w-full" placeholder="ivo ou bea" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-2">Palavra-passe</span>
            <input name="password" type="password" autoComplete="current-password" required className="input w-full" />
          </label>
        </div>

        {error && <p className="mt-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <button disabled={pending} className="btn-primary mt-6 w-full">
          {pending ? "A entrar…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
