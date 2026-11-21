import { NextResponse, type NextRequest } from "next/server";

// Só verifica se há cookie; a validação real da sessão é feita no servidor (requireUser).
export function middleware(req: NextRequest) {
  if (!req.cookies.has("sessao")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!login|_next|favicon.ico|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
