/* GET /api/painel — pedidos e avisos registados pelo agente (para painel.html).
   Protegido pela chave PAINEL_CHAVE (cabeçalho Authorization: Bearer ...). */
import { timingSafeEqual } from "node:crypto";
import { listar } from "../../agente/armazem.mjs";

export const config = { path: "/api/painel" };

const igual = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export default async (req) => {
  const chave = process.env.PAINEL_CHAVE;
  const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (!chave || chave.length < 12) return new Response(JSON.stringify({ erro: "PAINEL_CHAVE não configurada (mín. 12 caracteres)" }), { status: 503, headers: h });
  const dada = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!igual(dada, chave)) {
    await new Promise((ok) => setTimeout(ok, 800)); // trava tentativas em série
    return new Response(JSON.stringify({ erro: "chave inválida" }), { status: 401, headers: h });
  }
  const [pedidos, avisos] = await Promise.all([listar("agente-pedidos", 100), listar("agente-avisos", 100)]);
  return new Response(JSON.stringify({ pedidos, avisos }), { status: 200, headers: h });
};
