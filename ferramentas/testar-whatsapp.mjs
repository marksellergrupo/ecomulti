/* Testes do canal WhatsApp sem custos: API falsa da Anthropic + Graph API falsa da Meta.
   Uso: node ferramentas/testar-whatsapp.mjs */
import assert from "node:assert/strict";
import http from "node:http";
import { createHmac } from "node:crypto";
import { iniciarApiFalsa } from "./api-falsa.mjs";

const enviados = [];
const graph = http.createServer((req, res) => {
  let c = ""; req.on("data", (d) => (c += d));
  req.on("end", () => { enviados.push({ url: req.url, auth: req.headers.authorization, corpo: JSON.parse(c) }); res.writeHead(200, { "content-type": "application/json" }); res.end('{"messages":[{"id":"wamid.x"}]}'); });
});
await new Promise((ok) => graph.listen(8788, "127.0.0.1", ok));
const anth = await iniciarApiFalsa(8787);

Object.assign(process.env, {
  ANTHROPIC_API_KEY: "falsa", ANTHROPIC_BASE_URL: "http://127.0.0.1:8787",
  WHATSAPP_TOKEN: "token-falso", WHATSAPP_PHONE_NUMBER_ID: "123456", WHATSAPP_APP_SECRET: "segredo-app",
  WHATSAPP_VERIFY_TOKEN: "verifica-123", WHATSAPP_GRAPH_URL: "http://127.0.0.1:8788", EQUIPA_WHATSAPP: "244900000000"
});
const webhook = (await import("../netlify/functions/whatsapp.mjs")).default;
const processar = (await import("../netlify/functions/whatsapp-processar.mjs")).default;

let ok = 0;
const teste = async (nome, fn) => { try { await fn(); ok++; console.log("✔", nome); } catch (e) { console.error("✘", nome, "\n  ", e.message); process.exitCode = 1; } };
const assinar = (b) => "sha256=" + createHmac("sha256", "segredo-app").update(b).digest("hex");
let seq = 0;
const corpoMsg = (texto, de = "244911111111") => JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: {
  contacts: [{ wa_id: de, profile: { name: "Maria" } }],
  messages: [{ id: "wamid.teste" + seq++, from: de, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: texto } }] } }] }] });
const mandar = async (texto, de) => { const b = corpoMsg(texto, de); await processar(new Request("http://x/.netlify/functions/whatsapp-processar", { method: "POST", headers: { "x-hub-signature-256": assinar(b) }, body: b })); return b; };
const textosPara = (n) => enviados.filter((e) => e.corpo.to === n && e.corpo.type === "text").map((e) => e.corpo.text.body);

await teste("verificação do webhook (GET)", async () => {
  const bom = await webhook(new Request("http://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=verifica-123&hub.challenge=987"));
  assert.equal(bom.status, 200); assert.equal(await bom.text(), "987");
  const mau = await webhook(new Request("http://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=987"));
  assert.equal(mau.status, 403);
});

await teste("assinatura inválida é rejeitada (401)", async () => {
  const b = corpoMsg("Olá");
  const r = await webhook(new Request("http://x/api/whatsapp", { method: "POST", headers: { "x-hub-signature-256": "sha256=00" }, body: b }));
  assert.equal(r.status, 401);
});

await teste("mensagem de texto → resposta do agente enviada ao cliente", async () => {
  await mandar("Olá, boa tarde");
  const t = textosPara("244911111111");
  assert.ok(t.length >= 1, "enviou resposta");
  assert.match(t.at(-1), /\*ECOMULTI\*/, "negrito convertido para o formato WhatsApp");
  assert.ok(enviados.some((e) => e.corpo.status === "read"), "marcou como lida");
  assert.equal(enviados[0].auth, "Bearer token-falso");
});

await teste("mesma mensagem reenviada pela Meta não é respondida duas vezes", async () => {
  const b = corpoMsg("Olá");
  const antes = textosPara("244911111111").length;
  for (let i = 0; i < 2; i++) await processar(new Request("http://x/p", { method: "POST", headers: { "x-hub-signature-256": assinar(b) }, body: b }));
  assert.equal(textosPara("244911111111").length, antes + 1);
});

await teste("orçamento + pedido no WhatsApp → equipa avisada", async () => {
  await mandar("Quero um site");
  await mandar("Confirmo");
  const equipa = textosPara("244900000000");
  assert.ok(equipa.some((t) => /Novo pedido ECO-/.test(t) && /wa\.me\/244911111111/.test(t)), "aviso de pedido com contacto");
  assert.match(textosPara("244911111111").at(-1), /ECO-/);
});

await teste("pedido de pessoa → equipa avisada", async () => {
  await mandar("Quero falar com uma pessoa");
  assert.ok(textosPara("244900000000").some((t) => /atendimento humano/.test(t)));
});

await teste("mensagem de áudio → pede texto", async () => {
  const b = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "wamid.audio1", from: "244922222222", timestamp: String(Math.floor(Date.now() / 1000)), type: "audio", audio: {} }] } }] }] });
  await processar(new Request("http://x/p", { method: "POST", headers: { "x-hub-signature-256": assinar(b) }, body: b }));
  assert.match(textosPara("244922222222").at(-1), /só consigo ler mensagens de texto/);
});

await teste("sem chave da IA → resposta com menu e links", async () => {
  const chave = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  await mandar("Olá", "244933333333");
  assert.match(textosPara("244933333333").at(-1), /dominios\.html/);
  process.env.ANTHROPIC_API_KEY = chave;
});

graph.close(); anth.close();
console.log(`\n${ok} testes passaram${process.exitCode ? " (com falhas acima)" : ""}.`);
