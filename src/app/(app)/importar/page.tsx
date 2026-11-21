import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { listCategories, myAccounts } from "@/server/data";
import { PARSERS } from "@/server/import/parsers";
import { ImportFlow } from "./import-flow";

export const metadata: Metadata = { title: "Importar" };

export default async function ImportPage() {
  const user = await requireUser();
  const [accounts, categories] = await Promise.all([myAccounts(user.id), listCategories()]);
  const supported = new Set(PARSERS.map((p) => p.bank));

  return (
    <ImportFlow
      accounts={accounts.map((a) => ({ id: a.id, name: a.name, bank: a.bank, supported: supported.has(a.bank) }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName }))}
    />
  );
}
