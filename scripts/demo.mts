// Carrega os dados fictícios só se SEED_DEMO=1 (corre no build da Vercel; sem a variável não faz nada).
// Não volta a carregar se já existirem. Para os apagar: botão "Apagar dados fictícios" na app.
import { hasDemo, loadDemo } from "../src/server/demo.ts";

if (process.env.SEED_DEMO !== "1") {
  console.log("· Dados fictícios: SEED_DEMO não está ativo, nada a fazer");
} else if (await hasDemo()) {
  console.log("· Dados fictícios já existem");
} else {
  console.log(`✓ Dados fictícios: ${await loadDemo()} movimentos`);
}
