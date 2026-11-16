/* Testes do servidor (servidor/app.mjs) por HTTP, como na AngoWeb.
   Se o MySQL do XAMPP estiver ligado, usa uma base de TESTE temporária (cópia da estrutura de
   ecomulti_ecomulti + preços) e testa também o armazenamento em MySQL; senão, usa memória.
   Uso: npm run testar-servidor
   Variáveis opcionais: MYSQL_BIN, BD_TESTE_PORTA (3900), BD_TESTE_UTILIZADOR (root), BD_TESTE_SENHA */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PORTA = process.env.BD_TESTE_PORTA || "3900", UTIL = process.env.BD_TESTE_UTILIZADOR || "root", SENHA = process.env.BD_TESTE_SENHA || "";
const BIN = process.env.MYSQL_BIN || "C:\\xampp\\mysql\\bin";
const exe = (n) => (existsSync(join(BIN, n + ".exe")) ? join(BIN, n + ".exe") : n);
const acesso = ["-h", "127.0.0.1", "-P", PORTA, "-u", UTIL, ...(SENHA ? ["-p" + SENHA] : [])];
const BASE = "ecomulti_teste_srv_" + Date.now().toString(36);
const sql = (q, base = BASE) => {
  const r = spawnSync(exe("mysql"), [...acesso, "-N", "-B", ...(base ? [base] : []), "-e", q], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("mysql: " + (r.stderr || r.error));
  return r.stdout.replace(/\r/g, "").trim();
};

let comMySQL = false;
try { sql("SELECT 1", null); comMySQL = true; } catch { console.log("… MySQL desligado: testa só com armazenamento em memória"); }
if (comMySQL) {
  sql(`CREATE DATABASE ${BASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, null);
  const d = spawnSync(exe("mysqldump"), [...acesso, "--skip-comments", "ecomulti_ecomulti", "regras_preco", "categorias", "clientes", "encomendas", "encomenda_itens"], { encoding: "utf8" });
  if (d.status !== 0) throw new Error("mysqldump: " + d.stderr);
  const i = spawnSync(exe("mysql"), [...acesso, BASE], { input: d.stdout, encoding: "utf8" });
  if (i.status !== 0) throw new Error("importar: " + i.stderr);
  Object.assign(process.env, { DB_NOME: BASE, DB_UTILIZADOR: UTIL, DB_SENHA: SENHA, DB_HOST: "127.0.0.1", DB_PORTA: PORTA });
}

process.env.NAO_ESCUTAR = "1";
const { servidor } = await import("../servidor/app.mjs");
const armazem = await import("../agente/armazem.mjs");
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const BASEURL = `http://127.0.0.1:${servidor.address().port}`;

let ok = 0;
const teste = async (nome, fn) => { try { await fn(); ok++; console.log("✔", nome); } catch (e) { console.error("✘", nome, "\n  ", e.message); process.exitCode = 1; } };
const post = (rota, corpo, cab = {}) => fetch(BASEURL + rota, { method: "POST", headers: { "content-type": "application/json", ...cab }, body: JSON.stringify(corpo) });

try {
  await teste("GET /api/saude", async () => {
    const j = await (await fetch(BASEURL + "/api/saude")).json();
    assert.equal(j.ok, true);
    assert.equal(j.bd, comMySQL ? "ok" : "sem base de dados (memória)");
  });

  await teste("funciona com ou sem o /api no endereço (depende de como o cPanel monta a aplicação)", async () => {
    assert.equal((await (await fetch(BASEURL + "/saude")).json()).ok, true);
    assert.equal((await (await fetch(BASEURL + "/api/saude/")).json()).ok, true);
    const r = await post("/admin", { acao: "login", email: "x@x.ao", senha: "y" });
    assert.equal(r.status, 401, "chegou à rota do admin");
  });

  await teste("endereço desconhecido → 404 em JSON (o site não é servido em produção)", async () => {
    const r = await fetch(BASEURL + "/api/nao-existe");
    assert.equal(r.status, 404);
    assert.equal((await fetch(BASEURL + "/index.html")).status, 404);
  });

  let token;
  await teste("painel: login, criar venda e voltar a ler (fica guardada)", async () => {
    const l = await (await post("/api/admin", { acao: "login", email: "ecomulti.ao@gmail.com", senha: "admin@ecomult" })).json();
    assert.ok(l.token, JSON.stringify(l)); token = l.token;
    const auth = { authorization: "Bearer " + token };
    const v = await (await post("/api/admin", { acao: "vendas.guardar", estado: "pago", cliente: { nome: "Cliente Servidor", telefone: "923000000" }, itens: [{ descricao: "Hospedagem Starter", valor: 39900 }] }, auth)).json();
    assert.ok(v.venda?.id, JSON.stringify(v));
    const lista = await (await post("/api/admin", { acao: "vendas.listar" }, auth)).json();
    assert.ok(lista.vendas.some((x) => x.id === v.venda.id));
    if (comMySQL) assert.equal(sql(`SELECT COUNT(*) FROM app_dados WHERE loja = 'admin-vendas' AND chave = '${v.venda.id}'`), "1", "venda gravada no MySQL");
  });

  await teste("painel: sem sessão → 401", async () => {
    assert.equal((await post("/api/admin", { acao: "vendas.listar" })).status, 401);
  });

  await teste("página de orçamento: POST /api/pedido → venda em aberto no painel", async () => {
    const n = "ECO-261116-" + (1000 + Math.floor(Math.random() * 9000));
    const r = await post("/api/pedido", { numero: n, metodo: "Multicaixa Express", total: 45486, cliente: { nome: "Pedido Site", email: "pedido@teste.ao", telefone: "923111222" }, itens: [{ descricao: "Hospedagem — Starter", valor: 39900 }] });
    assert.equal(r.status, 200);
    const lista = await (await post("/api/admin", { acao: "vendas.listar" }, { authorization: "Bearer " + token })).json();
    assert.equal(lista.vendas.find((x) => x.id === n)?.estado, "em_aberto");
  });

  await teste("o cliente não consegue falsificar o IP (cabeçalho x-ip-cliente é substituído)", async () => {
    // 6 tentativas falhadas com IPs "falsos" diferentes contam para o mesmo IP real → bloqueio
    let ultimo;
    for (let i = 0; i < 12; i++) ultimo = await post("/api/admin", { acao: "login", email: "x@x.ao", senha: "errada" }, { "x-ip-cliente": "10.0.0." + i });
    assert.equal(ultimo.status, 429, "bloqueado por tentativas a partir do mesmo IP real");
  });

  await teste("GET /api/catalogo.php → preços da base em JavaScript", async () => {
    const r = await fetch(BASEURL + "/api/catalogo.php");
    assert.match(r.headers.get("content-type"), /javascript/);
    const js = await r.text();
    if (!comMySQL) return assert.match(js, /config\.js/);
    const w = {}; new Function("window", js)(w);
    assert.equal(w.precoDe("hospedagem.business"), Number(sql("SELECT valor FROM regras_preco WHERE chave = 'hospedagem.business'")));
  });

  if (comMySQL) {
    await teste("MySQL: onlyIfNew (mensagem do WhatsApp processada uma só vez)", async () => {
      assert.equal(await armazem.marcarVisto("wamid.TESTE1"), true);
      assert.equal(await armazem.marcarVisto("wamid.TESTE1"), false);
    });
    await teste("MySQL: listar por prefixo trata % e _ como texto", async () => {
      await armazem.gravarItem("teste-lista", "a%b_1", { v: 1 });
      await armazem.gravarItem("teste-lista", "axb_2", { v: 2 });
      assert.equal((await armazem.listarTudo("teste-lista")).length, 2);
      await armazem.apagarItem("teste-lista", "a%b_1");
      assert.deepEqual(await armazem.listarTudo("teste-lista"), [{ v: 2 }]);
    });
    await teste("MySQL: acentos e emojis guardados sem perdas", async () => {
      const v = { texto: "Olá, Luanda — orçamento ✅ 🇦🇴" };
      await armazem.gravarItem("teste-utf8", "k", v);
      assert.deepEqual(await armazem.obterItem("teste-utf8", "k"), v);
    });
  }
} finally {
  servidor.close();
  await armazem.fecharBD();
  if (comMySQL) sql(`DROP DATABASE ${BASE}`, null);
}
console.log(`\n${ok} testes passaram${process.exitCode ? " (com falhas acima)" : ""}${comMySQL ? ` (MySQL, base ${BASE} apagada)` : " (memória)"}.`);
process.exit();
