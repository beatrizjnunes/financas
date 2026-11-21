"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { logoutAction, setAvatarAction } from "@/app/(app)/actions";
import { Icon } from "./icons";

/** Recorta ao centro em quadrado e reduz para 256×256 JPEG (fica com ~20–40 KB). */
async function toAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function Avatar({ name, src, className = "size-10" }: { name: string; src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- data URL pequena, não precisa de next/image
    <img src={src} alt="" className={`${className} rounded-full object-cover`} />
  ) : (
    <span className={`${className} flex items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-strong`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Avatar; ao carregar abre um menu com o nome, a foto de perfil e "Terminar sessão". */
export function ProfileMenu({ name, avatar, placement }: { name: string; avatar: string | null; placement: "side" | "top" }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    start(async () => {
      try {
        await setAvatarAction(await toAvatar(f));
      } catch {
        setError("Não consegui usar essa imagem. Experimenta uma JPG ou PNG.");
      }
    });
  }

  const size = placement === "side" ? "size-10" : "size-8 text-xs";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Perfil de ${name}`}
        className={`block rounded-full transition hover:ring-2 hover:ring-accent/30 ${open ? "ring-2 ring-accent/40" : ""}`}
      >
        <Avatar name={name} src={avatar} className={size} />
      </button>
      {open && (
        <div
          role="menu"
          className={`card absolute z-50 w-60 p-2 shadow-xl ${placement === "side" ? "bottom-0 left-full ml-3" : "top-full right-0 mt-2"}`}
        >
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar name={name} src={avatar} className="size-11 text-base" />
            <div className="min-w-0">
              <p className="text-xs text-ink-3">Sessão iniciada como</p>
              <p className="truncate font-semibold">{name}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
          <button
            role="menuitem"
            disabled={pending}
            onClick={() => file.current?.click()}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          >
            <Icon name="upload" className="size-4" /> {pending ? "A guardar…" : avatar ? "Mudar foto" : "Adicionar foto"}
          </button>
          {avatar && (
            <button
              role="menuitem"
              disabled={pending}
              onClick={() => start(() => setAvatarAction(null))}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            >
              <span className="flex size-4 items-center justify-center text-xs">✕</span> Remover foto
            </button>
          )}
          {error && <p className="px-3 py-1 text-xs text-danger">{error}</p>}
          <div className="my-1 h-px bg-line" />
          <form action={logoutAction}>
            <button role="menuitem" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink-2 transition hover:bg-surface-2 hover:text-danger">
              <Icon name="logout" className="size-4" /> Terminar sessão
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
