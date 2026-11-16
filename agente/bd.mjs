/* Base de dados MySQL da ECOMULTI (na AngoWeb), através de ferramentas/api-bd/api-bd.php.
   Variáveis: BD_URL (ex.: https://ecomulti.ao/api-bd.php) e BD_CHAVE (igual a chave_api no config-bd.php).
   Sem estas variáveis não faz nada. Nunca lança erros: se a BD falhar, o pedido continua
   guardado na tabela app_dados e o erro fica nos logs ("[bd] ..."). */

export const bdConfigurada = () => Boolean(process.env.BD_URL && (process.env.BD_CHAVE || "").trim());

export async function chamarBD(acao, corpo, timeout = 6000) {
  const url = new URL(process.env.BD_URL);
  url.searchParams.set("acao", acao);
  const r = await fetch(url, {
    method: corpo ? "POST" : "GET",
    headers: { "x-api-chave": process.env.BD_CHAVE.trim(), accept: "application/json", ...(corpo ? { "content-type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(timeout)
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(`BD ${r.status}: ${j?.error?.message || "erro"}`); e.estado = r.status; throw e; }
  return j;
}

/* pedido = { numero, canal, metodo, cliente: {nome,tipo,email,telefone,nif,morada}, itens: [{codigo,descricao,valor,anos}], subtotal, iva, total } */
export async function gravarPedidoBD(pedido) {
  if (!bdConfigurada()) return null;
  try { return await chamarBD("pedido", pedido); }
  catch (e) { console.error("[bd]", pedido?.numero, e.message); return null; }
}

/* Converte o pedido do agente (linhas do orçamento) para o formato da BD */
export function pedidoDoAgente(p) {
  return {
    numero: p.numero, canal: p.canal, metodo: p.metodo, cliente: p.cliente,
    itens: (p.itens || []).map((l) => ({
      codigo: [l.servico, l.plano].filter(Boolean).join(":").slice(0, 80),
      descricao: [l.servicoLabel, l.plano].filter(Boolean).join(" — ") + (l.dominio ? ` (${l.dominio})` : ""),
      valor: Math.round(Number(l.total) || 0), anos: l.anos || 1
    })),
    subtotal: Math.round(p.totais?.sub || 0), iva: Math.round(p.totais?.iva || 0), total: Math.round(p.totais?.total || 0)
  };
}
