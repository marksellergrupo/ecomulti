/* Testes da área do cliente (registo, confirmação, entrada, recuperação, subscrições) — sem enviar e-mails reais.
   Uso: npm run testar-cliente */
import assert from "node:assert/strict";
import { usarTransporteDeTeste } from "../agente/email.mjs";

const caixa = [];   // e-mails "enviados"
usarTransporteDeTeste(async (m) => { caixa.push(m); });
const codigoPara = (email) => { const m = [...caixa].reverse().find((x) => x.to === email); return m && (m.text.match(/\b(\d{6})\b/) || [])[1]; };

const cliente = (await import("../servidor/rotas/cliente.mjs")).default;
const admin = (await import("../servidor/rotas/admin.mjs")).default;
let ip = 1;
const chamar = async (rota, acao, dados = {}, token, ipFixo) => {
  const r = await rota(new Request("http://x/api", { method: "POST",
    headers: { "content-type": "application/json", "x-ip-cliente": ipFixo || "10.1.0." + (ip++ % 250), ...(token ? { authorization: "Bearer " + token } : {}) },
    body: JSON.stringify({ acao, ...dados }) }));
  return { estado: r.status, corpo: await r.json() };
};
const tokAdmin = (await chamar(admin, "login", { email: "ecomulti.ao@gmail.com", senha: "admin@ecomult" })).corpo.token;

let ok = 0;
const teste = async (nome, fn) => { try { await fn(); ok++; console.log("✔", nome); } catch (e) { console.error("✘", nome, "\n  ", e.message); process.exitCode = 1; } };

const ANA = "ana@cliente.ao", SENHA = "senha-da-ana-123";
let tokAna;

await teste("registo → código de 6 dígitos enviado por e-mail (sem revelar nada)", async () => {
  const r = await chamar(cliente, "registar", { nome: "Ana Teste", email: " Ana@Cliente.AO ", senha: SENHA });
  assert.equal(r.estado, 200); assert.match(r.corpo.mensagem, /código/);
  assert.match(codigoPara(ANA), /^\d{6}$/);
});

await teste("antes de confirmar não entra (e recebe novo código só com a senha certa)", async () => {
  const r = await chamar(cliente, "entrar", { email: ANA, senha: SENHA });
  assert.equal(r.corpo.confirmar, true); assert.ok(!r.corpo.token);
  assert.equal((await chamar(cliente, "entrar", { email: ANA, senha: "errada-errada" })).estado, 401);
});

await teste("código errado → recusado; 5 erros invalidam o código", async () => {
  const novo = await chamar(cliente, "registar", { nome: "Bruno", email: "bruno@cliente.ao", senha: "senha-do-bruno" });
  assert.equal(novo.estado, 200);
  for (let i = 0; i < 5; i++) assert.equal((await chamar(cliente, "confirmar", { email: "bruno@cliente.ao", codigo: "000000", senha: "senha-do-bruno" })).estado, 400);
  const certo = codigoPara("bruno@cliente.ao");
  assert.equal((await chamar(cliente, "confirmar", { email: "bruno@cliente.ao", codigo: certo, senha: "senha-do-bruno" })).estado, 400, "código bloqueado após 5 erros");
});

await teste("confirmar exige também a senha do registo (ninguém activa a conta de outra pessoa)", async () => {
  const cod = codigoPara(ANA);
  assert.equal((await chamar(cliente, "confirmar", { email: ANA, codigo: cod, senha: "outra-senha-qualquer" })).estado, 400);
  const r = await chamar(cliente, "confirmar", { email: ANA, codigo: cod, senha: SENHA });
  assert.equal(r.estado, 200, JSON.stringify(r.corpo)); assert.ok(r.corpo.token); tokAna = r.corpo.token;
  assert.equal(r.corpo.cliente.email, ANA);
  assert.equal((await chamar(cliente, "confirmar", { email: ANA, codigo: cod, senha: SENHA })).estado, 400, "código só serve uma vez");
});

await teste("registar de novo um e-mail já confirmado não revela nada e avisa o dono", async () => {
  const antes = caixa.length;
  const r = await chamar(cliente, "registar", { nome: "Intruso", email: ANA, senha: "senha-do-intruso" });
  assert.equal(r.estado, 200); assert.match(r.corpo.mensagem, /código/);
  assert.match(caixa.at(-1).subject, /Já tem conta/); assert.equal(caixa.length, antes + 1);
  assert.equal((await chamar(cliente, "entrar", { email: ANA, senha: "senha-do-intruso" })).estado, 401, "a senha da Ana não mudou");
});

await teste("subscrições: vazias até haver uma venda paga com o e-mail do cliente", async () => {
  const r = await chamar(cliente, "subscricoes", {}, tokAna);
  assert.equal(r.estado, 200); assert.deepEqual(r.corpo.subscricoes, []);
});

let vendaAna;
await teste("venda paga no painel → subscrições com data de renovação (recorrentes) e únicas", async () => {
  vendaAna = (await chamar(admin, "vendas.guardar", { estado: "pago", pagoEm: "2026-11-10", cliente: { nome: "Ana Teste", email: "ana@cliente.ao", telefone: "923000001" },
    itens: [{ descricao: "Registo de domínio — anateste.ao", valor: 35000 }, { descricao: "Hospedagem — Business (anateste.ao) 2 anos", valor: 143856 }, { descricao: "Website — Landing Page", valor: 120000 }] }, tokAdmin)).corpo.venda;
  const subs = (await chamar(cliente, "subscricoes", {}, tokAna)).corpo.subscricoes;
  assert.equal(subs.length, 3);
  const dom = subs.find((s) => /domínio/.test(s.servico)), hosp = subs.find((s) => /Hospedagem/.test(s.servico)), web = subs.find((s) => /Website/.test(s.servico));
  assert.equal(dom.dominio, "anateste.ao"); assert.equal(dom.inicio, "2026-11-10"); assert.equal(dom.renovacao, "2027-11-10");
  assert.equal(hosp.renovacao, "2028-11-10", "2 anos");
  assert.equal(web.tipo, "unico"); assert.equal(web.renovacao, ""); assert.equal(web.situacao, "unico");
});

await teste("outro cliente não vê as subscrições da Ana", async () => {
  await chamar(cliente, "registar", { nome: "Carla", email: "carla@cliente.ao", senha: "senha-da-carla" });
  const t = (await chamar(cliente, "confirmar", { email: "carla@cliente.ao", codigo: codigoPara("carla@cliente.ao"), senha: "senha-da-carla" })).corpo.token;
  assert.deepEqual((await chamar(cliente, "subscricoes", {}, t)).corpo.subscricoes, []);
});

await teste("sem sessão, ou com token adulterado → 401", async () => {
  assert.equal((await chamar(cliente, "subscricoes")).estado, 401);
  const [c, s] = tokAna.split(".");
  const falso = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(c, "base64url")), e: "carla@cliente.ao" })).toString("base64url") + "." + s;
  assert.equal((await chamar(cliente, "subscricoes", {}, falso)).estado, 401);
});

await teste("painel: lista e corrige uma subscrição (a sincronização já não a altera)", async () => {
  const todas = (await chamar(admin, "subs.listar", {}, tokAdmin)).corpo.subscricoes;
  const dom = todas.find((s) => s.vendaId === vendaAna.id && /domínio/.test(s.servico));
  assert.equal(dom.vendaEstado, "pago");
  const r = await chamar(admin, "subs.guardar", { ...dom, renovacao: "2026-12-01" }, tokAdmin);
  assert.equal(r.estado, 200); assert.equal(r.corpo.subscricao.editada, true);
  const daAna = (await chamar(cliente, "subscricoes", {}, tokAna)).corpo.subscricoes.find((s) => s.id === dom.id);
  assert.equal(daAna.renovacao, "2026-12-01"); assert.equal(daAna.situacao, "a_expirar");
  assert.equal((await chamar(admin, "subs.guardar", { ...dom, renovacao: "01/12/2026" }, tokAdmin)).estado, 400, "data inválida");
});

await teste("subscrição cancelada no painel ou venda reaberta → deixa de aparecer ao cliente", async () => {
  const todas = (await chamar(admin, "subs.listar", {}, tokAdmin)).corpo.subscricoes.filter((s) => s.vendaId === vendaAna.id);
  await chamar(admin, "subs.guardar", { ...todas.find((s) => s.tipo === "unico"), estado: "cancelada" }, tokAdmin);
  assert.equal((await chamar(cliente, "subscricoes", {}, tokAna)).corpo.subscricoes.length, 2);
  await chamar(admin, "vendas.estado", { id: vendaAna.id, estado: "em_aberto" }, tokAdmin);
  assert.equal((await chamar(cliente, "subscricoes", {}, tokAna)).corpo.subscricoes.length, 0);
  await chamar(admin, "vendas.estado", { id: vendaAna.id, estado: "pago" }, tokAdmin);
  assert.equal((await chamar(cliente, "subscricoes", {}, tokAna)).corpo.subscricoes.length, 2, "volta a aparecer, sem duplicar");
});

await teste("recuperar a senha: código por e-mail → nova senha → sessões antigas terminam", async () => {
  const r = await chamar(cliente, "recuperar", { email: ANA });
  assert.equal(r.estado, 200); assert.match(caixa.at(-1).subject, /Recuperar/);
  const cod = codigoPara(ANA);
  assert.equal((await chamar(cliente, "redefinir", { email: ANA, codigo: cod, senha: "curta" })).estado, 400);
  const n = await chamar(cliente, "redefinir", { email: ANA, codigo: cod, senha: "nova-senha-da-ana" });
  assert.equal(n.estado, 200); assert.ok(n.corpo.token);
  assert.equal((await chamar(cliente, "subscricoes", {}, tokAna)).estado, 401, "token antigo deixou de servir");
  assert.equal((await chamar(cliente, "entrar", { email: ANA, senha: "nova-senha-da-ana" })).estado, 200);
});

await teste("recuperar com e-mail sem conta → mesma resposta e nenhum e-mail", async () => {
  const antes = caixa.length;
  const r = await chamar(cliente, "recuperar", { email: "ninguem@cliente.ao" });
  assert.equal(r.estado, 200); assert.match(r.corpo.mensagem, /código/); assert.equal(caixa.length, antes);
});

await teste("demasiadas tentativas de entrar a partir do mesmo IP → 429", async () => {
  let ultimo;
  for (let i = 0; i < 12; i++) ultimo = await chamar(cliente, "entrar", { email: ANA, senha: "errada-" + i }, null, "10.9.9.9");
  assert.equal(ultimo.estado, 429);
});

await teste("sem SMTP configurado → registo indisponível (503), sem rebentar", async () => {
  usarTransporteDeTeste(null);
  const r = await chamar(cliente, "registar", { nome: "Dora", email: "dora@cliente.ao", senha: "senha-da-dora" });
  assert.equal(r.estado, 503);
  usarTransporteDeTeste(async (m) => { caixa.push(m); });
});

console.log(`\n${ok} testes passaram${process.exitCode ? " (com falhas acima)" : ""}.`);
