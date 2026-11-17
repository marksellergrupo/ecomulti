/* Subscrições dos clientes (domínios, hospedagem, e-mail…), criadas a partir das vendas pagas.
   - Cada serviço de uma venda paga passa a ser uma subscrição (id = <venda>-<n.º do serviço>).
   - Serviços recorrentes (domínio, hospedagem/alojamento, e-mail, VPS) têm data de renovação
     (1 ano por omissão, ou "2 anos"/"3 anos" se estiver na descrição); os restantes (website, logótipo…)
     ficam como pagamento único, sem renovação.
   - A equipa pode corrigir no painel (serviço, domínio, datas, estado, e-mail); depois disso a
     sincronização já não altera essa subscrição.
   - O cliente só vê as subscrições do seu e-mail, de vendas pagas e não canceladas. */
import { obterItem, gravarItem, listarTudo } from "./armazem.mjs";

const SUBS = "subscricoes", VENDAS = "admin-vendas";
const DOMINIO_RE = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:co\.ao|it\.ao|edu\.ao|org\.ao|ao|com|net|org|pt))\b/i;
const RECORRENTE_RE = /dom\S{0,2}nio|domain|hosped|aloj|e-?mail|correio|vps|servidor|manuten/i;   // tolerante a acentos
const DIA = 864e5;

export function somarAnos(iso, anos) {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + anos);
  return d.toISOString().slice(0, 10);
}

function novaSubscricao(venda, item, i) {
  const desc = String(item.descricao || "");
  const recorrente = RECORRENTE_RE.test(desc);
  const anos = Math.min(Math.max(parseInt((desc.match(/(\d+)\s*anos?\b/i) || [])[1] || "1", 10), 1), 10);
  const dominio = ((desc.match(DOMINIO_RE) || [])[1] || (/hosped|aloj/i.test(desc) && venda.vintei?.dominio) || "").toLowerCase();
  const inicio = (venda.pagoEm || venda.data || new Date().toISOString()).slice(0, 10);
  return {
    id: `${venda.id}-${i + 1}`, vendaId: venda.id,
    email: String(venda.cliente?.email || "").toLowerCase(), clienteNome: venda.cliente?.nome || "",
    servico: desc.slice(0, 200), dominio, tipo: recorrente ? "recorrente" : "unico",
    inicio, renovacao: recorrente ? somarAnos(inicio, anos) : "", valor: Number(item.valor) || 0,
    estado: "activa", editada: false, criadoEm: new Date().toISOString(), actualizado: new Date().toISOString()
  };
}

/* cria (ou actualiza, se nunca foi editada) as subscrições de uma venda paga */
export async function criarDaVenda(venda) {
  if (!venda || venda.estado !== "pago") return [];
  const criadas = [];
  for (const [i, item] of (venda.itens || []).entries()) {
    const id = `${venda.id}-${i + 1}`, antiga = await obterItem(SUBS, id);
    if (antiga?.editada) continue;
    const nova = novaSubscricao(venda, item, i);
    if (antiga) {   // mantém datas e estado; só acompanha o cliente e o serviço da venda
      const s = { ...antiga, email: nova.email, clienteNome: nova.clienteNome, servico: nova.servico, dominio: antiga.dominio || nova.dominio, valor: nova.valor };
      if (JSON.stringify(s) !== JSON.stringify(antiga)) { s.actualizado = new Date().toISOString(); await gravarItem(SUBS, id, s); }
      continue;
    }
    await gravarItem(SUBS, id, nova); criadas.push(nova);
  }
  return criadas;
}

/* garante que todas as vendas pagas têm subscrições (inclui as vendas antigas) */
export async function sincronizar() {
  const vendas = await listarTudo(VENDAS);
  for (const v of vendas) if (v.estado === "pago") await criarDaVenda(v);
  return vendas;
}

export function situacao(s, agora = Date.now()) {
  if (s.estado === "cancelada") return { situacao: "cancelada", dias: null };
  if (!s.renovacao) return { situacao: "unico", dias: null };
  const dias = Math.ceil((Date.parse(s.renovacao + "T23:59:59Z") - agora) / DIA);
  return { situacao: dias < 0 ? "expirada" : dias <= 30 ? "a_expirar" : "activa", dias };
}

/* painel admin: todas, com o estado da venda */
export async function listarTodas() {
  const vendas = await sincronizar();
  const estadoVenda = Object.fromEntries(vendas.map((v) => [v.id, v.estado]));
  return (await listarTudo(SUBS))
    .map((s) => ({ ...s, vendaEstado: estadoVenda[s.vendaId] || "apagada", ...situacao(s) }))
    .sort((a, b) => (a.renovacao || "9999").localeCompare(b.renovacao || "9999"));
}

/* área do cliente: só as do e-mail, de vendas pagas e não canceladas */
export async function listarDoCliente(email) {
  email = String(email || "").toLowerCase();
  if (!email) return [];
  const vendas = await sincronizar();
  const pagas = new Set(vendas.filter((v) => v.estado === "pago").map((v) => v.id));
  return (await listarTudo(SUBS))
    .filter((s) => s.email === email && pagas.has(s.vendaId) && s.estado !== "cancelada")
    .map((s) => ({ id: s.id, servico: s.servico, dominio: s.dominio, tipo: s.tipo, inicio: s.inicio, renovacao: s.renovacao, ...situacao(s) }))
    .sort((a, b) => (a.renovacao || "9999").localeCompare(b.renovacao || "9999"));
}

/* domínio registado na 20i → a subscrição desse domínio passa a renovar na data do registo + anos */
export async function dominioRegistado(venda, dominio, anos, em = new Date().toISOString()) {
  await criarDaVenda(venda);
  const subs = (await listarTudo(SUBS)).filter((s) => s.vendaId === venda.id && s.dominio === dominio && /dom\S{0,2}nio|domain/i.test(s.servico));
  for (const s of subs) {
    if (s.editada) continue;
    Object.assign(s, { tipo: "recorrente", inicio: em.slice(0, 10), renovacao: somarAnos(em, anos), actualizado: new Date().toISOString() });
    await gravarItem(SUBS, s.id, s);
  }
  return subs.length;
}

/* painel admin: corrigir uma subscrição */
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
export async function guardar(d) {
  const s = await obterItem(SUBS, String(d.id || ""));
  if (!s) { const e = new Error("Subscrição não encontrada."); e.estado = 404; throw e; }
  const txt = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  const email = txt(d.email, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { const e = new Error("E-mail inválido."); e.estado = 400; throw e; }
  for (const k of ["inicio", "renovacao"]) if (d[k] && !DATA_RE.test(d[k])) { const e = new Error("Data inválida."); e.estado = 400; throw e; }
  Object.assign(s, {
    servico: txt(d.servico, 200) || s.servico, dominio: txt(d.dominio, 253).toLowerCase(), email: email || s.email,
    inicio: d.inicio || s.inicio, renovacao: d.tipo === "unico" ? "" : (d.renovacao || s.renovacao),
    tipo: d.tipo === "unico" ? "unico" : "recorrente", estado: d.estado === "cancelada" ? "cancelada" : "activa",
    editada: true, actualizado: new Date().toISOString()
  });
  await gravarItem(SUBS, s.id, s);
  return s;
}
