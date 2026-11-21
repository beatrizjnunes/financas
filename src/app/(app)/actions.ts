"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logout, requireUser } from "@/server/auth";
import { setMyAvatar } from "@/server/data";
import { clearDemo, loadDemo } from "@/server/demo";

export async function logoutAction() {
  await logout();
  redirect("/login");
}

/** Foto de perfil: só JPEG/PNG/WebP em data URL, até ~300 KB (o navegador já a reduz para 256×256). */
const Avatar = z
  .string()
  .max(400_000)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
  .nullable();

export async function setAvatarAction(dataUrl: unknown) {
  const user = await requireUser();
  await setMyAvatar(user.id, Avatar.parse(dataUrl));
  revalidatePath("/", "layout");
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
