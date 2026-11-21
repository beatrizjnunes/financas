// Ligação à base de dados, partilhada pela app, pelos scripts e pelo drizzle-kit.
// Local: ficheiro SQLite em data/. Produção (Vercel + Turso): aceita os nomes criados pela
// integração da Vercel (prefixo DATABASE) ou DATABASE_URL / DATABASE_AUTH_TOKEN.
const env = process.env;

const remoteUrl = env.DATABASE_TURSO_DATABASE_URL || env.DATABASE_URL;

// Em produção nunca cair para um ficheiro local: perderia os dados a cada deploy.
if (!remoteUrl && env.VERCEL_ENV === "production") {
  throw new Error("Falta DATABASE_TURSO_DATABASE_URL (ou DATABASE_URL) no ambiente de produção.");
}

export const dbUrl = remoteUrl || "file:data/financas.db";
export const dbAuthToken = env.DATABASE_TURSO_AUTH_TOKEN || env.DATABASE_AUTH_TOKEN || undefined;
