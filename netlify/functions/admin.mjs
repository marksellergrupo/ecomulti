/* API do dashboard administrativo:  POST /api/admin   corpo: { acao: "...", ...dados }
   Só "login" é público; todas as outras acções exigem a sessão (Authorization: Bearer <token>).
   Vendas, clientes e leads ficam guardados em Netlify Blobs.
   Os pedidos feitos pelo assistente (chat/WhatsApp) são importados automaticamente como vendas "em aberto". */
import { listarTudo, obterItem, gravarItem, apagarItem } from "../../agente/armazem.mjs";
import { json, cabecalhosCors, ipDe, novoNumero, hash } from "../../agente/util-http.mjs";
import { utilizador, verificarLogin, emitirToken, validarToken, alterarSenha, bloqueado, registarFalha, limparFalhas } from "../../agente/admin-auth.mjs";
import { vinteiConfigurado, tiposPacote, criarHospedagem } from "../../agente/vintei.mjs";
import { dominioValido } from "../../agente/catalogo.mjs";

export const config = { path: "/api/admin" };

const VENDAS = "admin-vendas", CLIENTES = "admin-clientes", IGNORADOS = "admin-ignorados", LEADS = "newsletter-subs";
const ESTADOS_VENDA = ["em_aberto", "pago", "cancelado"];
const ESTADOS_LEAD = ["novo", "contactado", "convertido", "descartado"];
const METODOS = ["Multicaixa Express", "Referência", "Transferência", "Numerário", "Outro"];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const txt = (v, max) => String(v == null ? "" : v).replace(/\u0000/g, "").trim().slice(0, max);
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 100) / 100, 1e11) : 0; };
const digitos = (s) => String(s || "").replace(/\D/g, "");
const agora = () => new Date().toISOString();
const idSeguro = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{3,40}$/.test(s);
const erro = (m, estado = 400) => { const e = new Error(m); e.estado = estado; return e; };

/* ---------------------------------------------------------------- vendas */
function limparCliente(c = {}) {
  const email = txt(c.email, 254).toLowerCase();
  return {
    nome: txt(c.nome, 120), tipo: c.tipo === "Empresa" ? "Empresa" : "Particular",
    telefone: txt(c.telefone || c.tel, 30), email: email && EMAIL.test(email) ? email : "",
    nif: txt(c.nif, 20).toUpperCase(), morada: txt(c.morada, 200)
  };
}
function limparVenda(d, antigo) {
  const cliente = limparCliente(d.cliente);
  if (cliente.nome.length < 2) throw erro("Indique o nome do cliente.");
  const itens = (Array.isArray(d.itens) ? d.itens : []).slice(0, 30).map((i) => ({ descricao: txt(i.descricao, 200), valor: num(i.valor) })).filter((i) => i.descricao);
  let total = num(d.total);
  if (!total) total = itens.reduce((t, i) => t + i.valor, 0);
  if (!total) throw erro("O valor total deve ser maior que zero.");
  const estado = ESTADOS_VENDA.includes(d.estado) ? d.estado : "em_aberto";
  const metodo = txt(d.metodo, 30);
  const id = antigo?.id || (idSeguro(d.id) ? d.id : novoNumero());
  const data = isNaN(Date.parse(d.data)) ? (antigo?.data || agora()) : new Date(d.data).toISOString();
  let pagoEm = "";
  if (estado === "pago") pagoEm = antigo?.pagoEm || (isNaN(Date.parse(d.pagoEm)) ? agora() : new Date(d.pagoEm).toISOString());
  if (estado === "pago" && !isNaN(Date.parse(d.pagoEm))) pagoEm = new Date(d.pagoEm).toISOString();
  return {
    id, data, cliente, clienteId: antigo?.clienteId || "", itens, total, metodo: METODOS.includes(metodo) ? metodo : metodo || "",
    estado, pagoEm, canal: txt(d.canal, 30) || antigo?.canal || "manual", notas: txt(d.notas, 600),
    criadoEm: antigo?.criadoEm || agora(), actualizado: agora(),
    ...(antigo?.vintei ? { vintei: antigo.vintei } : {})   // a activação na 20i nunca se perde ao editar
  };
}

/* importa os pedidos do assistente (chat/WhatsApp) que ainda não são vendas */
async function importarPedidos() {
  const [pedidos, existentes, ignorados] = await Promise.all([listarTudo("agente-pedidos"), listarTudo(VENDAS), listarTudo(IGNORADOS)]);
  const ja = new Set([...existentes.map((v) => v.id), ...ignorados.map((i) => i.id)]);
  for (const p of pedidos) {
    if (!p?.numero || ja.has(p.numero) || !idSeguro(p.numero)) continue;
    const itens = (p.itens || []).map((i) => ({ descricao: txt(`${i.servicoLabel || i.servico || "Serviço"}${i.plano ? " — " + i.plano : ""}`, 200), valor: num(i.total) }));
    const v = {
      id: p.numero, data: p.data || agora(), cliente: limparCliente({ ...p.cliente, telefone: p.cliente?.telefone }), clienteId: "",
      itens, total: num(p.totais?.total) || itens.reduce((t, i) => t + i.valor, 0), metodo: txt(p.metodo, 30), estado: "em_aberto", pagoEm: "",
      canal: txt(p.canal, 30) || "chat", notas: "", criadoEm: p.data || agora(), actualizado: agora()
    };
    if (v.total > 0 && v.cliente.nome) await gravarItem(VENDAS, v.id, v);
  }
}

/* ------------------------------------------------------------- clientes */
function limparClientePerfil(d, antigo) {
  const c = limparCliente(d);
  if (c.nome.length < 2) throw erro("Indique o nome do cliente.");
  return { id: antigo?.id || ("c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), ...c, notas: txt(d.notas, 600), criadoEm: antigo?.criadoEm || agora(), actualizado: agora() };
}
/* encontra (por e-mail, telefone ou NIF) ou cria o cliente a partir dos dados de uma venda */
async function garantirCliente(dados) {
  const lista = await listarTudo(CLIENTES);
  const tel = digitos(dados.telefone).slice(-9);
  const achado = lista.find((c) => (dados.email && c.email === dados.email) || (tel.length >= 9 && digitos(c.telefone).slice(-9) === tel) || (dados.nif && c.nif && c.nif === dados.nif));
  if (achado) {
    const novo = { ...achado };
    for (const k of ["telefone", "email", "nif", "morada"]) if (!novo[k] && dados[k]) novo[k] = dados[k];
    if (JSON.stringify(novo) !== JSON.stringify(achado)) { novo.actualizado = agora(); await gravarItem(CLIENTES, novo.id, novo); }
    return novo.id;
  }
  const c = limparClientePerfil(dados);
  await gravarItem(CLIENTES, c.id, c);
  return c.id;
}

/* ---------------------------------------------------------------- acções */
const ACCOES = {
  async sessao(_d, s) { return { ok: true, email: s.email, senhaInicial: s.senhaInicial }; },

  async senha(d) {
    const nova = String(d.nova || "");
    if (nova.length < 10) throw erro("A nova senha deve ter pelo menos 10 caracteres.");
    if (!/[A-Za-z]/.test(nova) || !/\d/.test(nova)) throw erro("Use letras e números na nova senha.");
    const ok = await verificarLogin((await utilizador()).email, String(d.actual || ""));
    if (!ok) throw erro("A senha actual não está correta.", 403);
    if (nova === d.actual) throw erro("A nova senha deve ser diferente da actual.");
    const u = await alterarSenha(nova);
    return { ok: true, ...(await emitirToken(u)) };
  },

  async resumo() {
    await importarPedidos();
    const [vendas, clientes, leads] = await Promise.all([listarTudo(VENDAS), listarTudo(CLIENTES), listarTudo(LEADS)]);
    const mes = agora().slice(0, 7), semana = new Date(Date.now() - 7 * 864e5).toISOString();
    const pagas = vendas.filter((v) => v.estado === "pago"), abertas = vendas.filter((v) => v.estado === "em_aberto");
    const soma = (l) => l.reduce((t, v) => t + (v.total || 0), 0);
    const serie = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i);
      const m = d.toISOString().slice(0, 7);
      serie.push({ mes: m, total: soma(pagas.filter((v) => (v.pagoEm || "").startsWith(m))) });
    }
    return {
      mes: { total: soma(pagas.filter((v) => (v.pagoEm || "").startsWith(mes))), n: pagas.filter((v) => (v.pagoEm || "").startsWith(mes)).length },
      pagoTotal: soma(pagas), nPagas: pagas.length,
      aberto: { total: soma(abertas), n: abertas.length, atrasadas: abertas.filter((v) => v.data < new Date(Date.now() - 7 * 864e5).toISOString()).length },
      clientes: clientes.length, leads: leads.length, leadsNovos: leads.filter((l) => (l.data || "") >= semana).length,
      serie, recentes: vendas.sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 6)
    };
  },

  async "vendas.listar"() {
    await importarPedidos();
    return { vendas: (await listarTudo(VENDAS)).sort((a, b) => (b.data || "").localeCompare(a.data || "")) };
  },
  async "vendas.guardar"(d) {
    const antigo = idSeguro(d.id) ? await obterItem(VENDAS, d.id) : null;
    const v = limparVenda(d, antigo);
    if (v.estado === "pago") v.clienteId = await garantirCliente(v.cliente);
    await gravarItem(VENDAS, v.id, v);
    return { ok: true, venda: v };
  },
  async "vendas.estado"(d) {
    if (!idSeguro(d.id) || !ESTADOS_VENDA.includes(d.estado)) throw erro("Pedido inválido.");
    const v = await obterItem(VENDAS, d.id);
    if (!v) throw erro("Venda não encontrada.", 404);
    v.estado = d.estado;
    if (d.metodo) v.metodo = txt(d.metodo, 30);
    if (d.estado === "pago") { v.pagoEm = isNaN(Date.parse(d.pagoEm)) ? agora() : new Date(d.pagoEm).toISOString(); v.clienteId = await garantirCliente(v.cliente); }
    else v.pagoEm = "";
    v.actualizado = agora();
    await gravarItem(VENDAS, v.id, v);
    return { ok: true, venda: v };
  },
  /* ---- 20i: criar a hospedagem de uma venda paga (botão manual no painel) ---- */
  async "vintei.tipos"() {
    if (!vinteiConfigurado()) throw erro("A ligação à 20i não está configurada no Netlify (VINTEI_URL e VINTEI_PROXY_CHAVE).", 503);
    try { return { tipos: await tiposPacote() }; }
    catch (e) { throw erro("Não foi possível ler os pacotes da 20i: " + e.message, 502); }
  },
  async "vintei.activar"(d, sessao) {
    if (!vinteiConfigurado()) throw erro("A ligação à 20i não está configurada no Netlify (VINTEI_URL e VINTEI_PROXY_CHAVE).", 503);
    if (!idSeguro(d.id)) throw erro("Pedido inválido.");
    const tipo = txt(d.tipo, 40);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(tipo)) throw erro("Escolha o tipo de pacote da 20i.");
    const dominio = txt(d.dominio, 253).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!dominioValido(dominio)) throw erro("Indique um domínio válido (ex.: empresa.ao).");
    const v = await obterItem(VENDAS, d.id);
    if (!v) throw erro("Venda não encontrada.", 404);
    if (v.estado !== "pago") throw erro("Só vendas pagas podem ser activadas na 20i.");
    if (v.vintei?.pacoteId) throw erro(`Esta venda já foi activada na 20i (pacote ${v.vintei.pacoteId}).`, 409);
    if (v.vintei?.aActivar && Date.now() - Date.parse(v.vintei.aActivar) < 120000) throw erro("A activação desta venda já está em curso. Aguarde um momento.", 409);

    v.vintei = { aActivar: agora(), tipo, dominio };          // trava contra duplo clique
    await gravarItem(VENDAS, v.id, v);
    try {
      const { pacoteId } = await criarHospedagem({ tipo, dominio });
      v.vintei = { pacoteId, tipo, tipoNome: txt(d.tipoNome, 80), dominio, em: agora(), por: sessao?.email || "" };
    } catch (e) {
      v.vintei = { erro: txt(e.message, 300), tipo, dominio, em: agora() };
      await gravarItem(VENDAS, v.id, v);
      throw erro("A 20i não criou a hospedagem: " + e.message, 502);
    }
    v.actualizado = agora();
    await gravarItem(VENDAS, v.id, v);
    return { ok: true, venda: v };
  },

  async "vendas.apagar"(d) {
    if (!idSeguro(d.id)) throw erro("Pedido inválido.");
    await apagarItem(VENDAS, d.id);
    await gravarItem(IGNORADOS, d.id, { id: d.id, em: agora() });   // não voltar a importar do assistente
    return { ok: true };
  },

  async "clientes.listar"() {
    const [clientes, vendas] = await Promise.all([listarTudo(CLIENTES), listarTudo(VENDAS)]);
    const lista = clientes.map((c) => {
      const minhas = vendas.filter((v) => v.clienteId === c.id);
      const pagas = minhas.filter((v) => v.estado === "pago");
      return { ...c, compras: pagas.length, totalComprado: pagas.reduce((t, v) => t + v.total, 0), ultimaCompra: pagas.map((v) => v.pagoEm).sort().pop() || "", emAberto: vendas.filter((v) => v.estado === "em_aberto" && (v.clienteId === c.id || (c.email && v.cliente?.email === c.email))).length };
    });
    return { clientes: lista.sort((a, b) => (b.ultimaCompra || b.criadoEm || "").localeCompare(a.ultimaCompra || a.criadoEm || "")) };
  },
  async "clientes.guardar"(d) {
    const antigo = idSeguro(d.id) ? await obterItem(CLIENTES, d.id) : null;
    const c = limparClientePerfil(d, antigo);
    await gravarItem(CLIENTES, c.id, c);
    return { ok: true, cliente: c };
  },
  async "clientes.apagar"(d) {
    if (!idSeguro(d.id)) throw erro("Cliente inválido.");
    await apagarItem(CLIENTES, d.id);
    return { ok: true };
  },

  async "leads.listar"() {
    return { leads: (await listarTudo(LEADS)).map((l) => ({ estado: "novo", notas: "", ...l })).sort((a, b) => (b.data || "").localeCompare(a.data || "")) };
  },
  async "leads.criar"(d) {
    const email = txt(d.email, 254).toLowerCase();
    if (!EMAIL.test(email)) throw erro("Indique um e-mail válido.");
    const k = hash(email);
    if (await obterItem(LEADS, k)) throw erro("Este e-mail já está na lista.");
    const l = { email, nome: txt(d.nome, 80), whatsapp: txt(d.whatsapp, 20), interesses: [], origem: "manual", pagina: "", consentimento: false, consentidoEm: "", data: agora(), actualizado: agora(), estado: "novo", notas: txt(d.notas, 600) };
    await gravarItem(LEADS, k, l);
    return { ok: true, lead: l };
  },
  async "leads.actualizar"(d) {
    const email = txt(d.email, 254).toLowerCase(), k = hash(email);
    const l = await obterItem(LEADS, k);
    if (!l) throw erro("Lead não encontrado.", 404);
    if (ESTADOS_LEAD.includes(d.estado)) l.estado = d.estado;
    if (d.notas !== undefined) l.notas = txt(d.notas, 600);
    if (d.nome !== undefined) l.nome = txt(d.nome, 80);
    l.actualizado = agora();
    await gravarItem(LEADS, k, l);
    return { ok: true, lead: l };
  },
  async "leads.apagar"(d) {
    await apagarItem(LEADS, hash(txt(d.email, 254).toLowerCase()));
    return { ok: true };
  },
  async "leads.converter"(d) {
    const email = txt(d.email, 254).toLowerCase(), k = hash(email);
    const l = await obterItem(LEADS, k);
    if (!l) throw erro("Lead não encontrado.", 404);
    const id = await garantirCliente({ nome: l.nome || email.split("@")[0], email, telefone: l.whatsapp || "", notas: "Convertido a partir da newsletter/leads." });
    l.estado = "convertido"; l.actualizado = agora();
    await gravarItem(LEADS, k, l);
    return { ok: true, clienteId: id };
  }
};

export default async (req) => {
  const cors = cabecalhosCors(req, "POST,OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ erro: "método" }, 405, cors);
  let d; try { d = await req.json(); } catch { return json({ erro: "json" }, 400, cors); }
  const acao = String(d.acao || "");

  try {
    if (acao === "login") {
      const ip = ipDe(req);
      if (await bloqueado(ip)) return json({ erro: "Demasiadas tentativas falhadas. Aguarde 15 minutos e tente novamente." }, 429, cors);
      const u = await verificarLogin(d.email, d.senha);
      if (!u) { await registarFalha(ip); return json({ erro: "E-mail ou senha incorretos." }, 401, cors); }
      await limparFalhas(ip);
      return json({ ok: true, email: u.email, senhaInicial: !!u.senhaInicial, ...(await emitirToken(u)) }, 200, cors);
    }
    const sessao = await validarToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
    if (!sessao) return json({ erro: "Sessão expirada. Entre novamente." }, 401, cors);
    const fn = ACCOES[acao];
    if (!fn) return json({ erro: "acção desconhecida" }, 400, cors);
    return json(await fn(d, sessao), 200, cors);
  } catch (e) {
    if (e.estado) return json({ erro: e.message }, e.estado, cors);
    console.error("admin:", e);
    return json({ erro: "Erro interno. Tente novamente." }, 500, cors);
  }
};
