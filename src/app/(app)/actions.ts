"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logout, requireUser } from "@/server/auth";
import { clearDemo, loadDemo } from "@/server/demo";

export async function logoutAction() {
  await logout();
  redirect("/login");
}

/** Carrega dados fictícios para os dois utilizadores (marcados, para se poderem apagar). */
export async function loadDemoAction() {
  await requireUser();
  await loadDemo();
  revalidatePath("/", "layout");
}

/** Apaga tudo o que foi criado pelos dados fictícios — os dados reais ficam intactos. */
export async function clearDemoAction() {
  await requireUser();
  await clearDemo();
  revalidatePath("/", "layout");
}
