# Finanças (Ivo & Bea)

Web app de finanças pessoais e do casal. Next.js 15 + TypeScript + Tailwind, SQLite (Drizzle + libSQL/Turso).

## Correr localmente

Precisa de Node 22.

```bash
npm install
cp .env.example .env      # preencher passwords e nomes no banco
npm run db:migrate        # cria data/financas.db
npm run db:seed           # cria ivo/bea, as contas e as categorias (pode repetir-se)
npm run dev               # http://localhost:3000
```

Em `.env`:
- `IVO_PASSWORD` / `BEA_PASSWORD`: mínimo 10 caracteres. Para mudar uma password, altera-a e corre `npm run db:seed`.
- `IVO_BANK_NAMES` / `BEA_BANK_NAMES`: os nomes com que os bancos vos identificam, separados por `;`
  (ex.: `IVO PINTO DUARTE`). Põe todas as variantes: a Revolut tanto mostra `Beatriz Nunes` como `BEATRIZ JACINTO NUNES`. Servem para detetar transferências entre contas próprias (→ *Transf. interna*)
  e entre vocês (→ *Entre nós*). Se faltarem, essas transferências aparecem como *Pessoal*.

## Importar extratos

1. **Importar** → escolhe a conta → arrasta o CSV.
2. Revê a tabela. Podes pesquisar e filtrar, mudar a categoria, o tipo (fixa/variável/pontual) e o âmbito
   (Pessoal / Casal / Transf. interna / Entre nós / Ignorar), linha a linha ou em massa.
3. **Importar N movimentos**.

Podes importar extratos com períodos sobrepostos, porque os movimentos já importados são detetados e ficam de fora.
Os movimentos pendentes são postos de parte e entram numa importação seguinte, quando já estiverem concluídos.

| Banco | Estado | Como exportar |
|---|---|---|
| Revolut | ✅ CSV | App → conta → ⋯ → Extrato → Excel/CSV |
| ING | ✅ CSV (em inglês, separado por `;`) | Mijn ING → conta → descarregar movimentos → CSV `;` |
| Caixa | Fase 2 (falta extrato de exemplo) | |

No ING, os pagamentos com cartão ficam com a data e hora em que pagaste (vêm nas notificações), não com a data
de lançamento, e os carregamentos da Revolut com o cartão do ING são marcados como *Transf. interna*.

Só são importados movimentos em EUR da conta principal da Revolut ("Current"). Os de outras moedas e de cofres
aparecem como "postos de parte" até haver um extrato de exemplo com eles.

## Privacidade

- Todas as consultas passam por `src/server/data/`, que filtra sempre pelo utilizador da sessão.
- `/samples`, `/data`, `*.db` e `.env` estão no `.gitignore`.
- Os testes usam `tests/fixtures/`, uma cópia anonimizada dos extratos.

## Testes

```bash
npm test
```

Cobrem os parsers (incluindo a verificação dos saldos linha a linha), a deduplicação, a classificação e a formatação de valores.

## Backup

Local: copia `data/financas.db` (com a app parada), por exemplo:

```bash
cp data/financas.db "backups/financas-$(date +%F).db"
```

Turso (produção): `turso db shell <nome> .dump > backup.sql`. A exportação em CSV a partir da app chega numa fase seguinte.

## Publicar (Vercel + Turso)

1. Na Vercel: *Storage → Turso → Create*, ligada ao projeto com o prefixo `DATABASE`. Cria
   `DATABASE_TURSO_DATABASE_URL` e `DATABASE_TURSO_AUTH_TOKEN` (também se aceitam `DATABASE_URL` / `DATABASE_AUTH_TOKEN`).
2. Em *Settings → Environment Variables* (Production, marcadas como *Sensitive*): `BEA_PASSWORD`, `IVO_PASSWORD`,
   `BEA_BANK_NAMES`, `IVO_BANK_NAMES`.
3. Cada deploy de produção corre `db:migrate` e `db:seed` antes do `next build` (ver `vercel.json`), por isso não é
   preciso ter os segredos da Turso localmente (a Vercel não os deixa descarregar). Para mudar uma password, altera-a
   na Vercel e faz *Redeploy*.

## Estrutura

```
src/app/(app)/        páginas autenticadas (movimentos, importar)
src/app/login/        login
src/server/auth.ts    sessões (cookie httpOnly, token guardado como sha256)
src/server/data/      acesso a dados, sempre filtrado pelo dono
src/server/import/    parsers por banco, deduplicação, classificação, pré-visualização e gravação
src/lib/              formatação pt-PT (1.234,56 €, dd/mm/aaaa) e etiquetas
drizzle/              migrações SQL
scripts/              migrate, seed
tests/                Vitest
```
