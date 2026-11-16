/* Testes da ligação à base de dados MySQL (api-bd.php), de ponta a ponta:
   Node → api-bd.php (servidor PHP local) → MySQL do XAMPP, numa base de TESTE temporária
   (cópia da estrutura de ecomulti_ecomulti; os seus dados não são tocados).
   Uso: npm run testar-bd
   Variáveis opcionais: PHP, MYSQL_BIN (pasta com mysql.exe), BD_TESTE_PORTA (3900), BD_TESTE_UTILIZADOR (root), BD_TESTE_SENHA */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORTA = process.env.BD_TESTE_PORTA || "3900";
const UTIL = process.env.BD_TESTE_UTILIZADOR || "root";
const SENHA = process.env.BD_TESTE_SENHA || "";
const BIN = process.env.MYSQL_BIN || "C:\\xampp\\mysql\\bin";
const exe = (n) => (existsSync(join(BIN, n + ".exe")) ? join(BIN, n + ".exe") : n);
const php = [process.env.PHP, "php", "C:\\xampp\\php\\php.exe"].filter(Boolean).find((p) => { try { return spawnSync(p, ["-v"]).status === 0; } catch { return false; } });
const acesso = ["-h", "127.0.0.1", "-P", PORTA, "-u", UTIL, ...(SENHA ? ["-p" + SENHA] : [])];
const BASE = "ecomulti_teste_" + Date.now().toString(36);

function sql(q, base = BASE) {
  const r = spawnSync(exe("mysql"), [...acesso, "-N", "-B", ...(base ? [base] : []), "-e", q], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("mysql: " + (r.stderr || r.error));
  return r.stdout.replace(/\r/g, "").trim();
}

if (!php) { console.log("PHP não encontrado (defina PHP=caminho/php)."); process.exit(1); }
try { sql("SELECT 1", null); } catch (e) { console.log("MySQL não responde na porta " + PORTA + ". Ligue o MySQL no XAMPP.\n" + e.message); process.exit(1); }

/* base de teste com a mesma estrutura da ecomulti_ecomulti */
sql(`CREATE DATABASE ${BASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, null);
const estrutura = spawnSync(exe("mysqldump"), [...acesso, "--no-data", "--skip-comments", "ecomulti_ecomulti"], { encoding: "utf8" });
if (estrutura.status !== 0) throw new Error("mysqldump: " + estrutura.stderr);
const imp = spawnSync(exe("mysql"), [...acesso, BASE], { input: estrutura.stdout, encoding: "utf8" });
if (imp.status !== 0) throw new Error("importar estrutura: " + imp.stderr);

/* servidor PHP com a api-bd.php e um config-bd.php de teste fora da pasta pública */
const dir = mkdtempSync(join(tmpdir(), "apibd-"));
mkdirSync(join(dir, "public_html"));
copyFileSync(new URL("./api-bd/api-bd.php", import.meta.url), join(dir, "public_html", "api-bd.php"));
const CHAVE = "chave-de-teste-da-bd-com-mais-de-24";
writeFileSync(join(dir, "config-bd.php"), `<?php return ['host' => '127.0.0.1', 'porta' => ${Number(PORTA)}, 'base' => '${BASE}', 'utilizador' => '${UTIL}', 'senha' => '${SENHA.replace(/'/g, "\\'")}', 'chave_api' => '${CHAVE}'];`);
const proc = spawn(php, ["-S", "127.0.0.1:8791", "-t", join(dir, "public_html")], { stdio: "ignore" });
for (let i = 0; i < 50; i++) { try { await fetch("http://127.0.0.1:8791/"); break; } catch { await new Promise((ok) => setTimeout(ok, 100)); } }

Object.assign(process.env, { BD_URL: "http://127.0.0.1:8791/api-bd.php", BD_CHAVE: CHAVE });
const { chamarBD, gravarPedidoBD, pedidoDoAgente } = await import("../agente/bd.mjs");
const { precificar, totais } = await import("../agente/catalogo.mjs");

let ok = 0;
const teste = async (nome, fn) => { try { await fn(); ok++; console.log("✔", nome); } catch (e) { console.error("✘", nome, "\n  ", e.message); process.exitCode = 1; } };
const num = () => "ECO-261113-" + (1000 + Math.floor(Math.random() * 9000));

try {
  await teste("ping com a chave certa", async () => {
    const r = await chamarBD("ping");
    assert.equal(r.ok, true); assert.equal(r.encomendas, 0);
  });

  await teste("chave errada → 403", async () => {
    const r = await fetch(process.env.BD_URL + "?acao=ping", { headers: { "x-api-chave": "errada-errada-errada-errada" } });
    assert.equal(r.status, 403);
  });

  const nAgente = num();
  await teste("pedido do agente → cliente + encomenda + itens", async () => {
    const linhas = [
      precificar({ servico: "dominio", dominio: "padariateste.ao", anos: 2 }).linha,
      precificar({ servico: "hospedagem", plano: "business", dominio: "padariateste.ao", anos: 1 }).linha
    ];
    const p = { numero: nAgente, canal: "site", metodo: "Multicaixa Express", totais: totais(linhas), itens: linhas,
      cliente: { nome: "Padaria Teste, Lda", tipo: "Empresa", telefone: "+244923000000", email: "Teste@Padaria.ao", nif: "5000123456", morada: "Luanda" } };
    const r = await gravarPedidoBD(pedidoDoAgente(p));
    assert.equal(r.ok, true);
    assert.equal(sql(`SELECT CONCAT_WS('|', tipo, nif, nome, email, telefone) FROM clientes WHERE id = ${r.cliente_id}`), "empresa|5000123456|Padaria Teste, Lda|teste@padaria.ao|+244923000000");
    const t = totais(linhas);
    assert.equal(sql(`SELECT CONCAT_WS('|', metodo, subtotal, iva, total, estado) FROM encomendas WHERE numero = '${nAgente}'`),
      `mcx|${Math.round(t.sub)}|${Math.round(t.iva)}|${Math.round(t.total)}|pendente`);
    const itens = sql(`SELECT CONCAT_WS('|', codigo, nome, anos, preco_unit, total_linha) FROM encomenda_itens WHERE encomenda_id = ${r.encomenda_id} ORDER BY id`).split("\n");
    assert.equal(itens.length, 2);
    assert.equal(itens[0], `dominio:padariateste.ao|Registo de domínio — padariateste.ao|2|${linhas[0].total / 2}|${linhas[0].total}`);
    assert.match(itens[1], /^hospedagem:Business\|Hospedagem — Business \(padariateste\.ao\)\|1\|/);
  });

  await teste("mesmo número enviado outra vez → não duplica", async () => {
    const r = await gravarPedidoBD({ numero: nAgente, cliente: { nome: "Repetido", email: "teste@padaria.ao" }, itens: [{ descricao: "Y", valor: 1 }] });
    assert.equal(r.repetido, true);
    assert.equal(sql(`SELECT COUNT(*) FROM encomendas WHERE numero = '${nAgente}'`), "1");
  });

  await teste("mesmo e-mail noutro pedido → reutiliza o cliente", async () => {
    const r = await gravarPedidoBD({ numero: num(), metodo: "Transferência bancária", total: 1000,
      cliente: { nome: "Padaria Teste", tipo: "Empresa", email: "teste@padaria.ao", telefone: "923000000" }, itens: [{ descricao: "Logótipo", valor: 1000 }] });
    assert.equal(sql("SELECT COUNT(*) FROM clientes"), "1");
    assert.equal(sql(`SELECT metodo FROM encomendas WHERE id = ${r.encomenda_id}`), "trf");
  });

  await teste("cliente só com telefone, NIF vazio → 'Consumidor final'", async () => {
    const r = await gravarPedidoBD({ numero: num(), metodo: "Pagamento por referência",
      cliente: { nome: "Maria", tipo: "Particular", telefone: "+244 911 111 111" }, itens: [{ descricao: "Site", valor: 120000 }] });
    assert.equal(sql(`SELECT CONCAT_WS('|', tipo, nif, email, telefone) FROM clientes WHERE id = ${r.cliente_id}`), "particular|Consumidor final||+244911111111");
    assert.equal(sql(`SELECT CONCAT_WS('|', metodo, subtotal, iva, total) FROM encomendas WHERE id = ${r.encomenda_id}`), "ref|120000|0|120000");
  });

  await teste("dados inválidos → recusado sem rebentar (devolve null)", async () => {
    const antes = sql("SELECT COUNT(*) FROM encomendas");
    assert.equal(await gravarPedidoBD({ numero: num(), cliente: { nome: "Sem itens", email: "a@b.ao" }, itens: [] }), null);
    assert.equal(await gravarPedidoBD({ numero: "XPTO", cliente: { nome: "Num", email: "a@b.ao" }, itens: [{ descricao: "a", valor: 1 }] }), null);
    assert.equal(sql("SELECT COUNT(*) FROM encomendas"), antes);
  });

  await teste("página de orçamento (/api/pedido) grava também no MySQL", async () => {
    const pedido = (await import("../netlify/functions/pedido.mjs")).default;
    const n = num();
    const r = await pedido(new Request("http://x/api/pedido", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      numero: n, metodo: "Pagamento por referência", total: 136800,
      cliente: { nome: "João Teste", tipo: "Particular", email: "joao@teste.ao", telefone: "923111222" },
      itens: [{ descricao: "Hospedagem — Starter", valor: 120000 }] }) }));
    assert.equal(r.status, 200);
    assert.equal(sql(`SELECT CONCAT_WS('|', e.subtotal, e.iva, e.total, c.email) FROM encomendas e JOIN clientes c ON c.id = e.cliente_id WHERE e.numero = '${n}'`), "120000|16800|136800|joao@teste.ao");
  });

  await teste("BD em baixo → o pedido do site continua a funcionar", async () => {
    const url = process.env.BD_URL; process.env.BD_URL = "http://127.0.0.1:9/api-bd.php";
    try {
      const pedido = (await import("../netlify/functions/pedido.mjs")).default;
      const r = await pedido(new Request("http://x/api/pedido", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        numero: num(), metodo: "Multicaixa Express", total: 1000, cliente: { nome: "Ana", email: "ana@teste.ao" }, itens: [{ descricao: "Teste", valor: 1000 }] }) }));
      assert.equal(r.status, 200);
    } finally { process.env.BD_URL = url; }
  });
} finally {
  proc.kill();
  rmSync(dir, { recursive: true, force: true });
  sql(`DROP DATABASE ${BASE}`, null);
}
console.log(`\n${ok} testes passaram${process.exitCode ? " (com falhas acima)" : ""}. Base de teste ${BASE} apagada.`);
