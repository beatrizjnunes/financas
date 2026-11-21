"use server";

import { redirect } from "next/navigation";
import { login } from "@/server/auth";

export async function loginAction(_: string | null, form: FormData): Promise<string | null> {
  const ok = await login(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
  if (!ok) return "Utilizador ou palavra-passe incorretos.";
  redirect("/movimentos");
}
