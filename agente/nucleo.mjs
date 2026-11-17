/* =====================================================================
   Núcleo do agente de atendimento ECOMULTI (Claude + ferramentas).
   Usado pelo chat do site e pelo WhatsApp. Não guarda nada sozinho:
   recebe o "estado" da conversa e devolve-o actualizado.
   ===================================================================== */
import Anthropic from "@anthropic-ai/sdk";
import { instrucoes } from "./prompt.mjs";
import { verificar } from "./dominios.mjs";
import {
  EXTENSOES, HOSPEDAGEM, EMAIL, WEBSITE, EXTRAS, EMPRESA,
  precificar, totais, kz, numeroPedido, textoPedido, dividirDominio
} from "./catalogo.mjs";

export const MODELO = process.env.AGENTE_MODELO || "claude-opus-5-5";
const ESFORCO = process.env.AGENTE_ESFORCO || "low"; // conversa comercial: respostas rápidas
const MAX_VOLTAS = 8;

export const agenteActivo = () => Boolean(process.env.ANTHROPIC_API_KEY);
let cliente;
const api = () => (cliente ||= new Anthropic({ maxRetries: 2, timeout: 50_000 }));

export { estadoNovo } from "./estado.mjs";

/* ---------------------------- ferramentas ---------------------------- */
export const FERRAMENTAS = [
  {
    name: "verificar_dominio",
    description: "Verifica em tempo real se um nome de domínio está livre nas extensões indicadas e devolve o preço anual de cada uma. Indicativo: a equipa confirma junto do registador antes do registo.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome sem extensão, ex.: 'padariaesperanca'. Só letras, números e hífen." },
        extensoes: { type: "array", items: { type: "string", enum: EXTENSOES }, description: "Extensões a verificar. Omitir = todas." }
      },
      required: ["nome"]
    }
  },
  {
    name: "definir_orcamento",
    description: "Define o orçamento actual do cliente com a lista COMPLETA de serviços que ele quer (substitui a anterior). Calcula preços, descontos e IVA com a tabela oficial e devolve o resumo. No site, o orçamento aparece também no carrinho.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              servico: { type: "string", enum: ["dominio", "hospedagem", "email", "website", "vps", "automacao_ia"] },
              plano: { type: "string", description: `hospedagem: ${Object.keys(HOSPEDAGEM).join("|")}; email: ${Object.keys(EMAIL).join("|")}; website: ${Object.keys(WEBSITE).join("|")}. Não usar em dominio/vps/automacao_ia.` },
              dominio: { type: "string", description: "Domínio completo, ex.: minhaempresa.ao. Obrigatório para dominio, hospedagem e email." },
              anos: { type: "integer", enum: [1, 2, 3], description: "Período (domínio, hospedagem, e-mail). Por omissão 1." },
              paginas_extra: { type: "integer", minimum: 0, maximum: 30, description: "Só website." },
              extras: { type: "array", items: { type: "string", enum: Object.keys(EXTRAS) }, description: "Só website." },
              prioritario: { type: "boolean", description: "Só website: prazo prioritário." },
              descricao: { type: "string", description: "Só vps/automacao_ia: necessidade do cliente em poucas palavras." }
            },
            required: ["servico"]
          }
        }
      },
      required: ["itens"]
    }
  },
  {
    name: "registar_pedido",
    description: "Regista o pedido com o orçamento actual e os dados do cliente, gera o número do pedido (ECO-...) e avisa a equipa. Só usar depois de o cliente ver o resumo e confirmar explicitamente.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome completo ou nome da empresa" },
        tipo_cliente: { type: "string", enum: ["Empresa", "Particular"] },
        telefone: { type: "string" },
        email: { type: "string" },
        nif: { type: "string", description: "Obrigatório para empresa" },
        morada: { type: "string" },
        metodo_pagamento: { type: "string", enum: ["Multicaixa Express", "Pagamento por referência", "Transferência bancária"] },
        observacoes: { type: "string" },
        cliente_confirmou: { type: "boolean", description: "true só se o cliente confirmou o resumo e os dados" }
      },
      required: ["nome", "tipo_cliente", "telefone", "metodo_pagamento", "cliente_confirmou"]
    }
  },
  {
    name: "chamar_humano",
    description: "Passa a conversa para a equipa humana (pedido do cliente, cliente actual com problema, reclamação, desconto especial, ou dúvida que não sabes responder com segurança).",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", enum: ["pedido_do_cliente", "suporte_cliente_actual", "reclamacao", "negociacao", "duvida_sem_resposta", "outro"] },
        resumo: { type: "string", description: "Resumo curto para a equipa: quem é, o que quer, o que já foi dito." }
      },
      required: ["motivo", "resumo"]
    }
  }
];

/* validação mínima (com eager_input_streaming o servidor não valida o input) */
function validar(nome, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "input inválido";
  const def = FERRAMENTAS.find((f) => f.name === nome);
  for (const campo of def.input_schema.required) if (input[campo] === undefined || input[campo] === "") return `falta o campo ${campo}`;
  return null;
}

const resumoOrcamento = (linhas) => {
  const t = totais(linhas);
  return {
    itens: linhas.map((l) => ({ servico: l.servicoLabel, plano: l.plano, detalhes: l.detalhes, total: l.total ? kz(l.total) : "sob consulta" })),
    subtotal: kz(t.sub), iva: kz(t.iva), total_estimado: kz(t.total)
  };
};

async function executar(nome, input, ctx) {
  const { estado, canal } = ctx;
  switch (nome) {
    case "verificar_dominio": {
      const d = dividirDominio(String(input.nome).replace(/\.(co\.ao|it\.ao|edu\.ao|org\.ao|ao|com|net|org)$/i, "") + ".ao");
      if (!d) return { erro: "Nome inválido: use só letras, números e hífen (sem espaços, acentos, nem hífen no início/fim)." };
      const exts = (Array.isArray(input.extensoes) && input.extensoes.length ? input.extensoes : EXTENSOES).filter((e) => EXTENSOES.includes(e));
      const resultados = await Promise.all(exts.map((e) => verificar(d.nome, e)));
      return { resultados: resultados.map((r) => ({ ...r, preco_ano: kz(r.preco_ano_kz) })), nota: "Verificação indicativa; a equipa confirma junto do registador antes de registar." };
    }
    case "definir_orcamento": {
      if (!Array.isArray(input.itens)) return { erro: "itens deve ser uma lista" };
      if (input.itens.length > 15) return { erro: "Máximo de 15 itens." };
      const linhas = [], erros = [];
      for (const it of input.itens) { const r = precificar(it); r.erro ? erros.push(r.erro) : linhas.push(r.linha); }
      if (erros.length) return { erro: erros.join(" ") };
      estado.orcamento = linhas;
      estado.pedido = null; // orçamento mudou: um pedido anterior deixa de corresponder
      const r = resumoOrcamento(linhas);
      // para o carrinho do site vão as linhas originais (totais numéricos), não as formatadas
      ctx.aoAccao?.({ tipo: "orcamento", itens: linhas, subtotal: r.subtotal, iva: r.iva, total_estimado: r.total_estimado });
      return resumoOrcamento(linhas);
    }
    case "registar_pedido": {
      if (!estado.orcamento.length) return { erro: "O orçamento está vazio. Use definir_orcamento primeiro." };
      if (input.cliente_confirmou !== true) return { erro: "Mostre o resumo ao cliente e peça confirmação antes de registar." };
      const tel = String(input.telefone || "").replace(/[^\d+]/g, "");
      if (tel.replace(/\D/g, "").length < 9) return { erro: "Telefone inválido — peça um número com pelo menos 9 dígitos." };
      const email = String(input.email || "").trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { erro: "E-mail inválido — confirme com o cliente." };
      const nif = String(input.nif || "").trim();
      if (input.tipo_cliente === "Empresa" && !/^[0-9A-Z]{9,14}$/i.test(nif)) return { erro: "Para empresa o NIF é obrigatório (9 a 14 caracteres) — peça-o ao cliente." };
      if (estado.pedido) return { numero: estado.pedido.numero, nota: "Este pedido já estava registado." };

      const numero = numeroPedido();
      const clienteDados = { nome: String(input.nome).trim().slice(0, 120), tipo: input.tipo_cliente, telefone: tel, email, nif, morada: String(input.morada || "").trim().slice(0, 200) };
      const texto = textoPedido({ numero, cliente: clienteDados, linhas: estado.orcamento, metodo: input.metodo_pagamento, observacoes: String(input.observacoes || "").slice(0, 500), canal });
      const pedido = { numero, data: new Date().toISOString(), canal, sessao: ctx.sessao, cliente: clienteDados, itens: estado.orcamento, metodo: input.metodo_pagamento, totais: totais(estado.orcamento), texto };
      estado.pedido = { numero };
      await ctx.guardarPedido?.(pedido);
      await ctx.avisarEquipa?.({ tipo: "pedido", numero, texto, canal, contacto: tel, whatsapp: ctx.contacto });
      ctx.aoAccao?.({ tipo: "pedido", numero, texto });
      return {
        numero,
        proximos_passos: canal === "whatsapp"
          ? "Pedido registado e equipa avisada. Diga o número ao cliente e explique: confirmamos a disponibilidade, enviamos a factura proforma e activamos após o pagamento."
          : "Pedido registado. O chat mostra agora um botão 'Enviar pedido pelo WhatsApp' — peça ao cliente para carregar nele para a equipa receber e enviar a proforma."
      };
    }
    case "chamar_humano": {
      estado.humano = { motivo: input.motivo, desde: Date.now() };
      const resumo = String(input.resumo).slice(0, 800);
      await ctx.avisarEquipa?.({ tipo: "humano", motivo: input.motivo, texto: resumo, canal, whatsapp: ctx.contacto });
      ctx.aoAccao?.({ tipo: "humano", texto: `Olá ${EMPRESA.nome}! Vim do assistente do site. ${resumo}` });
      if (canal !== "whatsapp") return { ok: true, nota: "O chat mostra um botão para falar com a equipa no WhatsApp." };
      return ctx.pausaHumano
        ? { ok: true, nota: "Equipa avisada. Diga ao cliente que uma pessoa da equipa continua esta conversa aqui em breve (no horário de atendimento); o assistente fica em pausa." }
        : { ok: true, nota: `Equipa avisada com o contacto do cliente. Diga-lhe que a equipa o vai contactar em breve (no horário de atendimento) e que, se preferir, pode falar já com uma pessoa em wa.me/${EMPRESA.whatsapp}.` };
    }
  }
  return { erro: "ferramenta desconhecida" };
}

/* ------------------------------------------------------------------------
   Um turno: junta a mensagem do cliente, conversa com o Claude (com as
   ferramentas) até haver resposta final e devolve o texto da resposta.
   ctx: { estado, canal, sessao, contacto, aoTexto(delta), aoAccao(obj),
          guardarPedido(pedido), avisarEquipa(aviso) }
   O estado só deve ser gravado pelo chamador se a função terminar sem erro
   (assim o histórico nunca fica com um tool_use sem resposta).
   ------------------------------------------------------------------------ */
export async function executarTurno(texto, ctx) {
  const { estado, canal } = ctx;
  estado.mensagens.push({ role: "user", content: texto });
  estado.turnos++;
  const partes = [];

  for (let volta = 0, falhasJson = 0; volta < MAX_VOLTAS; volta++) {
    const stream = api().beta.messages.stream({
      model: MODELO,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: ESFORCO },
      cache_control: { type: "ephemeral" },
      system: instrucoes(canal),
      tools: FERRAMENTAS,
      messages: estado.mensagens
    });
    if (ctx.aoTexto) stream.on("text", (d) => ctx.aoTexto(d));

    let msg;
    try {
      msg = await stream.finalMessage();
      falhasJson = 0;
    } catch (err) {
      // só o JSON de uma ferramenta impossível de ler é repetido; erros da API sobem
      if (err instanceof Anthropic.APIError || falhasJson++ >= 2) throw err;
      continue;
    }

    estado.mensagens.push({ role: "assistant", content: msg.content });
    const textos = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (textos.trim()) partes.push(textos.trim());

    if (msg.stop_reason === "pause_turn") continue;
    if (msg.stop_reason === "refusal") {
      const cortados = msg.content.filter((b) => b.type === "tool_use");
      if (cortados.length) estado.mensagens.push({ role: "user", content: cortados.map((u) => ({ type: "tool_result", tool_use_id: u.id, is_error: true, content: "interrompido" })) });
      const aviso = "Peço desculpa, não consigo ajudar com isso por aqui. Posso pô-lo em contacto com a nossa equipa?";
      if (!textos.trim()) { partes.push(aviso); ctx.aoTexto?.(aviso); }
      break;
    }
    const usos = msg.content.filter((b) => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || !usos.length) {
      // ex.: max_tokens a meio de uma ferramenta — input truncado, não executar,
      // mas fechar os tool_use para o histórico continuar válido
      if (usos.length) estado.mensagens.push({ role: "user", content: usos.map((u) => ({ type: "tool_result", tool_use_id: u.id, is_error: true, content: "interrompido" })) });
      break;
    }

    const resultados = await Promise.all(usos.map(async (u) => {
      const problema = validar(u.name, u.input);
      if (problema) return { type: "tool_result", tool_use_id: u.id, is_error: true, content: JSON.stringify({ erro: problema }) };
      try {
        const r = await executar(u.name, u.input, ctx);
        return { type: "tool_result", tool_use_id: u.id, is_error: Boolean(r && r.erro), content: JSON.stringify(r) };
      } catch (e) {
        return { type: "tool_result", tool_use_id: u.id, is_error: true, content: JSON.stringify({ erro: "falha interna: " + (e.message || e) }) };
      }
    }));
    estado.mensagens.push({ role: "user", content: resultados });
    if (partes.length && ctx.aoTexto) ctx.aoTexto("\n\n"); // separa o texto antes e depois das ferramentas
  }

  return partes.join("\n\n");
}
