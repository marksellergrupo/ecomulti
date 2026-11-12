/* API falsa da Anthropic (só para testes, sem custos nem chave).
   Responde em streaming SSE com guiões fixos e valida o histórico como a API real:
   cada tool_use tem de ter o tool_result correspondente na mensagem seguinte. */
import http from "node:http";

let n = 0;
const id = (p) => `${p}_${Date.now().toString(36)}${(n++).toString(36)}`;
export const pedidosRecebidos = [];

function eventos(blocos, stop) {
  const ev = [["message_start", { message: { id: id("msg"), type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 50, output_tokens: 1 } } }]];
  blocos.forEach((b, i) => {
    if (b.texto != null) {
      ev.push(["content_block_start", { index: i, content_block: { type: "text", text: "" } }]);
      for (const parte of b.texto.match(/.{1,12}/gs) || []) ev.push(["content_block_delta", { index: i, delta: { type: "text_delta", text: parte } }]);
    } else {
      ev.push(["content_block_start", { index: i, content_block: { type: "tool_use", id: id("toolu"), name: b.ferramenta, input: {} } }]);
      const json = JSON.stringify(b.input);
      for (const parte of json.match(/.{1,15}/gs)) ev.push(["content_block_delta", { index: i, delta: { type: "input_json_delta", partial_json: parte } }]);
    }
    ev.push(["content_block_stop", { index: i }]);
  });
  ev.push(["message_delta", { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 30 } }], ["message_stop", {}]);
  return ev;
}

function validarHistorico(msgs) {
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    const ids = m.content.filter((b) => b.type === "tool_use").map((b) => b.id);
    if (!ids.length) continue;
    const prox = msgs[i + 1];
    const res = prox && Array.isArray(prox.content) ? prox.content.filter((b) => b.type === "tool_result").map((b) => b.tool_use_id) : [];
    if (!ids.every((x) => res.includes(x))) return `tool_use ${ids} sem tool_result na mensagem ${i + 1}`;
  }
  return null;
}

function guiao(msgs) {
  const ult = msgs[msgs.length - 1];
  if (Array.isArray(ult.content) && ult.content[0]?.type === "tool_result") {
    const r = ult.content.map((b) => b.content).join(" ");
    return { blocos: [{ texto: "Resultado das ferramentas: " + r.slice(0, 400) }], stop: "end_turn" };
  }
  const t = (typeof ult.content === "string" ? ult.content : ult.content.map((b) => b.text || "").join(" ")).toLowerCase();
  if (t.includes("dominio") || t.includes("domínio"))
    return { blocos: [{ texto: "Vou verificar. " }, { ferramenta: "verificar_dominio", input: { nome: "ecomulti", extensoes: [".ao", ".com"] } }], stop: "tool_use" };
  if (t.includes("site"))
    return { blocos: [{ ferramenta: "definir_orcamento", input: { itens: [
      { servico: "website", plano: "institucional", extras: ["seo"] },
      { servico: "dominio", dominio: "padariateste.ao" },
      { servico: "hospedagem", plano: "business", anos: 2, dominio: "padariateste.ao" }] } }], stop: "tool_use" };
  if (t.includes("confirmo"))
    return { blocos: [{ ferramenta: "registar_pedido", input: { nome: "Padaria Teste, Lda", tipo_cliente: "Empresa", telefone: "+244 923 000 000", email: "teste@padaria.ao", nif: "5000123456", metodo_pagamento: "Multicaixa Express", cliente_confirmou: true } }], stop: "tool_use" };
  if (t.includes("pessoa"))
    return { blocos: [{ ferramenta: "chamar_humano", input: { motivo: "pedido_do_cliente", resumo: "Cliente quer falar com uma pessoa sobre um site." } }], stop: "tool_use" };
  if (t.includes("erro-ferramenta"))
    return { blocos: [{ ferramenta: "definir_orcamento", input: { itens: [{ servico: "hospedagem", plano: "business" }] } }], stop: "tool_use" };
  return { blocos: [{ texto: "Olá! Sou o assistente da **ECOMULTI**. Em que posso ajudar?" }], stop: "end_turn" };
}

export function iniciarApiFalsa(porta = 8787) {
  const srv = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      const p = JSON.parse(corpo || "{}");
      pedidosRecebidos.push({ cabecalhos: req.headers, corpo: p });
      const erro = validarHistorico(p.messages || []);
      if (erro) { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: erro } })); return; }
      const { blocos, stop } = guiao(p.messages);
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const [tipo, dados] of eventos(blocos, stop)) res.write(`event: ${tipo}\ndata: ${JSON.stringify({ type: tipo, ...dados })}\n\n`);
      res.end();
    });
  });
  return new Promise((ok) => srv.listen(porta, "127.0.0.1", () => ok(srv)));
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  await iniciarApiFalsa(Number(process.env.PORTA || 8787));
  console.log("API falsa em http://127.0.0.1:" + (process.env.PORTA || 8787));
}
