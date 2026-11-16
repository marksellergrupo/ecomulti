/* POST /api/pedido — o site regista aqui os pedidos de orçamento (além de os enviar por WhatsApp/e-mail),
   para aparecerem no dashboard como vendas "em aberto". Público, com limites e validação. */
import { obterItem, gravarItem } from "../../agente/armazem.mjs";
import { json, cabecalhosCors, hash, ipDe, novoNumero } from "../../agente/util-http.mjs";
import { gravarPedidoBD } from "../../agente/bd.mjs";

const LIMITE_IP_DIA = Number(process.env.PEDIDO_LIMITE_IP || 20);
const txt = (v, max) => String(v == null ? "" : v).replace(/\u0000/g, "").trim().slice(0, max);
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 100) / 100, 1e11) : 0; };
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export default async (req) => {
  const cors = cabecalhosCors(req, "POST,OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ erro: "método" }, 405, cors);
  let d; try { d = await req.json(); } catch { return json({ erro: "json" }, 400, cors); }

  const c = d.cliente || {};
  const nome = txt(c.nome, 120), email = txt(c.email, 254).toLowerCase(), telefone = txt(c.telefone || c.tel, 30);
  const itens = (Array.isArray(d.itens) ? d.itens : []).slice(0, 30).map((i) => ({ descricao: txt(i.descricao, 200), valor: num(i.valor) })).filter((i) => i.descricao);
  const total = num(d.total) || itens.reduce((t, i) => t + i.valor, 0);
  if (nome.length < 2 || !itens.length || !total) return json({ erro: "pedido inválido" }, 400, cors);
  if (!EMAIL.test(email) && telefone.replace(/\D/g, "").length < 9) return json({ erro: "contacto inválido" }, 400, cors);

  const chaveLimite = "ip-" + hash(ipDe(req) + new Date().toISOString().slice(0, 10)).slice(0, 24);
  const uso = (await obterItem("pedido-limite", chaveLimite)) || { n: 0 };
  if (uso.n >= LIMITE_IP_DIA) return json({ erro: "limite diário" }, 429, cors);
  await gravarItem("pedido-limite", chaveLimite, { n: uso.n + 1 });

  const id = /^ECO-\d{6}-\d{4}$/.test(String(d.numero || "")) ? d.numero : novoNumero();
  const existente = await obterItem("admin-vendas", id);
  if (existente && existente.estado !== "em_aberto") return json({ ok: true, numero: id }, 200, cors);   // nunca altera vendas já tratadas
  const agora = new Date().toISOString();
  await gravarItem("admin-vendas", id, {
    id, data: existente?.data || agora,
    cliente: { nome, tipo: c.tipo === "Empresa" ? "Empresa" : "Particular", telefone, email: EMAIL.test(email) ? email : "", nif: txt(c.nif, 20).toUpperCase(), morada: txt(c.morada, 200) },
    clienteId: existente?.clienteId || "", itens, total, metodo: txt(d.metodo, 30), estado: "em_aberto", pagoEm: "",
    canal: "orcamento-site", notas: txt(d.notas, 600), criadoEm: existente?.criadoEm || agora, actualizado: agora
  });
  // cópia no MySQL da AngoWeb (se BD_URL estiver definido); se falhar, o pedido já está guardado acima
  const subtotal = itens.reduce((t, i) => t + i.valor, 0);
  await gravarPedidoBD({
    numero: id, canal: "orcamento-site", metodo: txt(d.metodo, 30),
    cliente: { nome, tipo: c.tipo === "Empresa" ? "Empresa" : "Particular", email: EMAIL.test(email) ? email : "", telefone, nif: txt(c.nif, 20).toUpperCase(), morada: txt(c.morada, 200) },
    itens: itens.map((i) => ({ codigo: "site", descricao: i.descricao, valor: Math.round(i.valor), anos: 1 })),
    subtotal: Math.round(subtotal), iva: Math.round(Math.max(0, total - subtotal)), total: Math.round(total)
  });
  return json({ ok: true, numero: id }, 200, cors);
};
