/* Testes do agente sem custos: usa a API falsa (ferramentas/api-falsa.mjs).
   Uso: npm run testar */
import assert from "node:assert/strict";
import { iniciarApiFalsa, pedidosRecebidos } from "./api-falsa.mjs";
import { preco } from "../agente/catalogo.mjs";

process.env.ANTHROPIC_API_KEY = "chave-falsa-de-teste";
process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:8787";
const srv = await iniciarApiFalsa(8787);

const { executarTurno, estadoNovo, MODELO } = await import("../agente/nucleo.mjs");
const funcao = (await import("../netlify/functions/agente.mjs")).default;

let ok = 0;
const teste = async (nome, fn) => { try { await fn(); ok++; console.log("✔", nome); } catch (e) { console.error("✘", nome, "\n  ", e.message); process.exitCode = 1; } };

const estado = estadoNovo();
const accoes = [], pedidos = [], avisos = [];
const ctx = { estado, canal: "site", sessao: "teste", aoAccao: (a) => accoes.push(a), guardarPedido: async (p) => pedidos.push(p), avisarEquipa: async (a) => avisos.push(a) };

await teste("saudação simples (texto em streaming)", async () => {
  let fluxo = "";
  const r = await executarTurno("Olá", { ...ctx, aoTexto: (d) => (fluxo += d) });
  assert.match(r, /ECOMULTI/);
  assert.equal(fluxo.trim(), r);
  const p = pedidosRecebidos.at(-1);
  assert.equal(p.corpo.model, MODELO);
  assert.equal(p.corpo.fallbacks, "default");
  assert.match(p.cabecalhos["anthropic-beta"] || "", /server-side-fallback-2026-07-01/);
  assert.equal(p.corpo.output_config.effort, "low");
  assert.ok(p.corpo.system.length > 3000, "instruções presentes");
  assert.equal(p.corpo.tools.length, 4);
});

await teste("verificar domínio (ferramenta + RDAP/DNS reais)", async () => {
  const r = await executarTurno("Quero um domínio", ctx);
  assert.match(r, /ecomulti\.ao/);
  assert.match(r, /ecomulti\.com/);
  assert.match(r, /35\.000 Kz|25\.000 Kz/);
});

await teste("definir orçamento → linhas com preços oficiais + acção para o carrinho", async () => {
  const r = await executarTurno("Quero um site para a padaria", ctx);
  const a = accoes.find((x) => x.tipo === "orcamento");
  assert.ok(a, "acção orcamento emitida");
  assert.equal(a.itens.length, 3);
  assert.equal(a.itens[0].total, 280000 + 45000);
  assert.equal(a.itens[2].total, Math.round(preco("hospedagem.business") * 24 * (1 - preco("regra.desconto_2anos") / 100)), "Business 2 anos com desconto");
  assert.equal(estado.orcamento.length, 3);
  assert.match(r, /325.000 Kz/);
});

await teste("registar pedido → número ECO, texto e aviso à equipa", async () => {
  const r = await executarTurno("Confirmo, pode registar", ctx);
  assert.equal(pedidos.length, 1);
  assert.match(pedidos[0].numero, /^ECO-\d{6}-\d{4}$/);
  assert.match(pedidos[0].texto, /Padaria Teste/);
  assert.match(pedidos[0].texto, /IVA \(14%\)/);
  assert.ok(avisos.some((x) => x.tipo === "pedido"));
  assert.ok(accoes.some((x) => x.tipo === "pedido" && x.texto.includes(pedidos[0].numero)));
  assert.match(r, /ECO-/);
});

await teste("pedido não é duplicado se confirmar duas vezes", async () => {
  await executarTurno("Confirmo outra vez", ctx);
  assert.equal(pedidos.length, 1);
});

await teste("erro de ferramenta volta ao modelo como is_error (sem rebentar)", async () => {
  const r = await executarTurno("erro-ferramenta", ctx);
  assert.match(r, /Falta o dom/);
});

await teste("chamar humano → aviso + acção", async () => {
  await executarTurno("Quero falar com uma pessoa", ctx);
  assert.ok(avisos.some((x) => x.tipo === "humano"));
  assert.ok(accoes.some((x) => x.tipo === "humano"));
});

await teste("histórico continua válido após vários turnos", async () => {
  const r = await executarTurno("Olá de novo", ctx);
  assert.match(r, /ECOMULTI/);
});

await teste("função /api/agente: GET, validação e streaming NDJSON", async () => {
  const g = await funcao(new Request("http://localhost/api/agente"));
  assert.deepEqual(await g.json(), { ativo: true });
  const mau = await funcao(new Request("http://localhost/api/agente", { method: "POST", body: JSON.stringify({ sessao: "x", mensagem: "oi" }) }));
  assert.equal(mau.status, 400);
  const r = await funcao(new Request("http://localhost/api/agente", { method: "POST", body: JSON.stringify({ sessao: "abcdefgh12345678", mensagem: "Quero um site", pagina: "/hospedagem-ecomulti.html" }) }));
  const linhas = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(linhas.some((l) => l.t === "accao" && l.tipo === "orcamento"));
  assert.equal(linhas.at(-1).t, "fim");
  const primeiro = pedidosRecebidos.at(-2).corpo.messages[0].content;
  assert.match(primeiro, /página "Hospedagem"/);
});

await teste("sem chave → modo guiado (503)", async () => {
  const chave = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const r = await funcao(new Request("http://localhost/api/agente", { method: "POST", body: JSON.stringify({ sessao: "abcdefgh12345678", mensagem: "oi" }) }));
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { modo: "guiado" });
  process.env.ANTHROPIC_API_KEY = chave;
});

srv.close();
console.log(`\n${ok} testes passaram${process.exitCode ? " (com falhas acima)" : ""}.`);
