/* =====================================================================
   Catálogo e cálculo de preços do agente.
   Usa os MESMOS preços e as MESMAS regras das calculadoras do site
   (preços vêm de agente/dados-empresa.mjs, gerado a partir de config.js).
   ===================================================================== */
import DADOS from "./dados-empresa.mjs";

export const EMPRESA = DADOS.empresa;
export const FISCAL = DADOS.fiscal || { taxaIVA: 0.14, precosIncluemIVA: false };
const P = DADOS.precos;
export const preco = (chave) => P[chave];

export const kz = (v) =>
  new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 0 }).format(Math.round(v || 0)).replace(/\s/g, ".") + " Kz";

export const EXTENSOES = [".ao", ".co.ao", ".it.ao", ".edu.ao", ".org.ao", ".com", ".net", ".org"];

export const HOSPEDAGEM = {
  starter:  { nome: "Starter",  chave: "hospedagem.starter",  inclui: ["5 GB SSD", "1 website", "5 contas de e-mail", "SSL", "painel de gestão"], para: "pequenos sites e projectos pessoais" },
  business: { nome: "Business", chave: "hospedagem.business", inclui: ["10 GB SSD", "até 5 websites", "20 contas de e-mail", "SSL", "cópias de segurança diárias"], para: "empresas com presença profissional (o mais popular)" },
  premium:  { nome: "Premium",  chave: "hospedagem.premium",  inclui: ["10 GB SSD", "até 15 websites", "50 contas de e-mail", "SSL", "cópias de segurança e suporte prioritário"], para: "projectos com mais tráfego e muitos sites" }
};
export const EMAIL = {
  essencial:    { nome: "Essencial",    chave: "email.essencial",    inclui: ["1 conta", "10 GB", "domínio próprio", "webmail", "filtro básico de spam"], para: "profissionais e pequenos negócios" },
  profissional: { nome: "Profissional", chave: "email.profissional", inclui: ["até 5 contas", "10 GB por conta", "webmail e aplicações", "filtro de spam reforçado"], para: "equipas (o mais escolhido)" },
  empresarial:  { nome: "Empresarial",  chave: "email.empresarial",  inclui: ["até 15 contas", "10 GB por conta", "endereços por departamento", "suporte prioritário"], para: "equipas maiores" }
};
export const WEBSITE = {
  landing:       { nome: "Landing Page",       chave: "desenvolvimento.landing",       dias: 7,  inclui: ["1 página optimizada", "design responsivo", "formulário de contacto", "botão de WhatsApp"] },
  institucional: { nome: "Site Institucional", chave: "desenvolvimento.institucional", dias: 15, inclui: ["até 8 páginas", "design personalizado", "formulários e mapa", "SEO básico"] },
  loja:          { nome: "Loja Online",        chave: "desenvolvimento.loja",          dias: 30, inclui: ["catálogo e carrinho", "painel de encomendas", "pagamentos locais", "design responsivo e SEO"] }
};
export const EXTRAS = {
  blog:     { nome: "Blog ou secção de notícias",  chave: "extra.blog" },
  idiomas:  { nome: "Site em dois idiomas",        chave: "extra.idiomas" },
  seo:      { nome: "SEO avançado",                chave: "extra.seo" },
  logo:     { nome: "Criação de logótipo",         chave: "extra.logo" },
  formacao: { nome: "Formação para gerir o site",  chave: "extra.formacao" }
};
const descontoAnos = (anos) => ({ 1: 0, 2: preco("regra.desconto_2anos"), 3: preco("regra.desconto_3anos") }[anos] || 0);

/* ---------- validações ---------- */
export function dividirDominio(raw) {
  const d = String(raw || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const ext = EXTENSOES.slice().sort((a, b) => b.length - a.length).find((e) => d.endsWith(e));
  if (!ext) return null;
  const nome = d.slice(0, -ext.length);
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(nome) ? { nome, ext, dominio: nome + ext } : null;
}
export const dominioValido = (d) => /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(String(d || ""));
const limparDominio = (d) => String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const inteiro = (v, min, max, def) => {
  const n = Number.isInteger(v) ? v : def;
  return n == null ? null : Math.min(max, Math.max(min, n));
};

/* ---------------------------------------------------------------------
   Converte um item pedido pelo agente numa linha de orçamento
   com o mesmo formato do carrinho do site (localStorage ecomulti_orcamento).
   --------------------------------------------------------------------- */
export function precificar(item) {
  const s = item && item.servico;
  if (s === "dominio") {
    const d = dividirDominio(item.dominio || item.plano);
    if (!d) return { erro: `Domínio inválido: "${item.dominio || item.plano || ""}". Extensões aceites: ${EXTENSOES.join(", ")}.` };
    const anos = inteiro(item.anos, 1, 3, 1);
    return { linha: {
      servico: "dominio", servicoLabel: "Registo de domínio", icon: "globe", plano: d.dominio, anos,
      detalhes: [`Registo por ${anos} ${anos === 1 ? "ano" : "anos"}`, "Disponibilidade confirmada pela ECOMULTI antes do registo"],
      total: preco("dominio" + d.ext) * anos
    } };
  }
  if (s === "hospedagem" || s === "email") {
    const tabela = s === "hospedagem" ? HOSPEDAGEM : EMAIL;
    const plano = tabela[String(item.plano || "").toLowerCase()];
    if (!plano) return { erro: `Plano de ${s} inválido. Use: ${Object.keys(tabela).join(", ")}.` };
    const dominio = limparDominio(item.dominio);
    if (!dominioValido(dominio)) return { erro: `Falta o domínio (ex.: minhaempresa.ao) para ${s === "hospedagem" ? "a hospedagem" : "os e-mails"}. Pergunte ao cliente.` };
    const anos = inteiro(item.anos, 1, 3, 1);
    const mensal = preco(plano.chave), subtotal = mensal * 12 * anos, pct = descontoAnos(anos);
    const rotulo = s === "hospedagem" ? "Hospedagem" : "E-mail profissional";
    return { linha: {
      servico: s, servicoLabel: rotulo, icon: s === "hospedagem" ? "server" : "mail", plano: plano.nome, anos, dominio,
      substitui: s + ":" + dominio,
      detalhes: [`Domínio: ${dominio}`, `${anos} ${anos === 1 ? "ano" : "anos"} (${anos * 12} meses) × ${kz(mensal)}/mês`, pct ? `Desconto de ${pct}% incluído` : null].filter(Boolean),
      total: subtotal - Math.round((subtotal * pct) / 100)
    } };
  }
  if (s === "website") {
    const p = WEBSITE[String(item.plano || "").toLowerCase()];
    if (!p) return { erro: `Pacote de website inválido. Use: ${Object.keys(WEBSITE).join(", ")}.` };
    const n = inteiro(item.paginas_extra, 0, 30, 0);
    const extras = [...new Set(Array.isArray(item.extras) ? item.extras : [])];
    const invalido = extras.find((e) => !EXTRAS[e]);
    if (invalido) return { erro: `Extra desconhecido: ${invalido}. Use: ${Object.keys(EXTRAS).join(", ")}.` };
    const subtotal = preco(p.chave) + n * preco("regra.pagina_extra") + extras.reduce((t, e) => t + preco(EXTRAS[e].chave), 0);
    const urg = item.prioritario ? Math.round((subtotal * preco("regra.prioritario")) / 100) : 0;
    return { linha: {
      servico: "desenvolvimento", servicoLabel: "Website", icon: "code", plano: p.nome, substitui: "desenvolvimento",
      detalhes: [n ? `${n} página(s) adicional(is)` : null, ...extras.map((e) => EXTRAS[e].nome),
        item.prioritario ? "Prazo prioritário" : `Entrega estimada ≈ ${p.dias} dias`].filter(Boolean),
      total: subtotal + urg
    } };
  }
  if (s === "vps" || s === "automacao_ia") {
    const desc = String(item.descricao || "").trim().slice(0, 300);
    if (!desc) return { erro: "Para VPS/IA descreva em poucas palavras o que o cliente precisa (campo descricao)." };
    return { linha: {
      servico: s, servicoLabel: s === "vps" ? "Servidor VPS" : "Automação com IA", icon: s === "vps" ? "server" : "cpu",
      plano: "Proposta personalizada", detalhes: [desc, "Preço sob consulta — a equipa envia proposta"], total: 0
    } };
  }
  return { erro: `Serviço desconhecido: ${s}.` };
}

export function totais(linhas) {
  const base = linhas.reduce((t, l) => t + (Number(l.total) || 0), 0);
  if (FISCAL.precosIncluemIVA) { const sub = base / (1 + FISCAL.taxaIVA); return { sub, iva: base - sub, total: base }; }
  return { sub: base, iva: base * FISCAL.taxaIVA, total: base * (1 + FISCAL.taxaIVA) };
}

export function numeroPedido(agora = new Date()) {
  // data de Luanda (UTC+1)
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Luanda", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(agora).split("-");
  return `ECO-${a.slice(2)}${m}${d}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/* Mesmo texto que a página de orçamento envia por WhatsApp */
export function textoPedido({ numero, cliente, linhas, metodo, observacoes, canal }) {
  const t = totais(linhas), pct = Math.round(FISCAL.taxaIVA * 100);
  const itens = linhas.map((i) => `• ${i.servicoLabel} — ${i.plano}: ${i.total ? kz(i.total) : "sob consulta"}` +
    (i.detalhes && i.detalhes.length ? `\n   ${i.detalhes.join(" | ")}` : "")).join("\n");
  return `*Pedido de orçamento ${numero}*\n` + `(registado pelo assistente automático — ${canal === "whatsapp" ? "WhatsApp" : "site"})\n\n` +
    `*Cliente* (${cliente.tipo})\n${cliente.nome}\n` + (cliente.nif ? `NIF: ${cliente.nif}\n` : "") +
    (cliente.email ? `E-mail: ${cliente.email}\n` : "") + `Telefone: ${cliente.telefone}\n` + (cliente.morada ? `Morada: ${cliente.morada}\n` : "") +
    `\n*Serviços*\n${itens}\n\n` +
    `Subtotal: ${kz(t.sub)}\nIVA (${pct}%): ${kz(t.iva)}\n*Total estimado: ${kz(t.total)}*\n\n` +
    `Pagamento preferido: ${metodo}` + (observacoes ? `\n\nObservações: ${observacoes}` : "") +
    `\n\nPor favor, enviem a factura proforma. Obrigado!`;
}
