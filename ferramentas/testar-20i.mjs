/* Testes da ligação à 20i sem custos: usa a 20i falsa (ferramentas/vintei-falsa.mjs).
   Uso: npm run testar-20i
   Para testar a conta real (só leitura): VINTEI_API_KEY=... node ferramentas/testar-20i.mjs --real */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.argv.includes("--real")) {
  const { contaRevenda, disponibilidade20i, tiposPacote } = await import("../agente/vintei.mjs");
  try {
    await contaRevenda();
    console.log("✔ Ligação à 20i OK (chave e IP aceites).");
  } catch (e) {
    console.error("✘", e.message);
    if (e.estado === 401) console.error("  Confirme a General API Key e se o IP desta máquina está autorizado no My20i (Reseller → API).");
    process.exit(1);
  }
  const esperado = { "ecomulti-teste-xyz.com": "free", "google.com": "taken" };
  for (const [d, e] of Object.entries(esperado)) {
    try {
      const r = await disponibilidade20i(d);
      console.log(`${r === e ? "✔" : "✘"} ${d} → ${r} (esperado: ${e})`);
      if (r !== e) process.exitCode = 1;
    } catch (err) { console.log(`✘ ${d} → ${err.message}`); process.exitCode = 1; }
  }
  // só leitura: os tipos de pacote que o painel vai mostrar no "Activar na 20i"
  try {
    const tipos = await tiposPacote();
    console.log(`${tipos.length ? "✔" : "✘"} Tipos de pacote na 20i: ${tipos.length}`);
    for (const t of tipos) console.log(`   ${t.id} — ${t.nome}${t.plataforma ? " (" + t.plataforma + ")" : ""}`);
    if (!tipos.length) process.exitCode = 1;
  } catch (err) { console.log(`✘ tipos de pacote → ${err.message}`); process.exitCode = 1; }
  process.exit();
}

const { iniciar20iFalsa, pedidos20i } = await import("./vintei-falsa.mjs");
const srv = await iniciar20iFalsa(8789, "chave-teste-20i");
Object.assign(process.env, { VINTEI_API_KEY: "chave-teste-20i", VINTEI_URL: "http://127.0.0.1:8789/" });
const { contaRevenda, disponibilidade20i, pedir20i } = await import("../agente/vintei.mjs");
const { verificar } = await import("../agente/dominios.mjs");

let ok = 0;
const teste = async (nome, fn) => { try { await fn(); ok++; console.log("✔", nome); } catch (e) { console.error("✘", nome, "\n  ", e.message); process.exitCode = 1; } };

await teste("autenticação com a chave em base64", async () => {
  const c = await contaRevenda();
  assert.equal(c.id, 12345);
  assert.equal(pedidos20i.at(-1).auth, "Bearer " + Buffer.from("chave-teste-20i").toString("base64"));
});

await teste("chave errada → erro 401 com mensagem clara", async () => {
  process.env.VINTEI_API_KEY = "errada";
  try { await assert.rejects(pedir20i("/reseller"), (e) => e.estado === 401 && /20i 401/.test(e.message)); }
  finally { process.env.VINTEI_API_KEY = "chave-teste-20i"; }
});

await teste("domínio livre → free (ignora sugestões de outros domínios)", async () => {
  assert.equal(await disponibilidade20i("PadariaTeste.com"), "free");
});

await teste("domínio ocupado → taken", async () => {
  assert.equal(await disponibilidade20i("ocupado.com"), "taken");
});

await teste("verificar() usa a 20i para .com", async () => {
  const r = await verificar("padariateste", ".com");
  assert.equal(r.estado, "free"); assert.equal(r.fonte, "20i"); assert.equal(r.situacao, "disponível");
  assert.ok(r.preco_ano_kz > 0);
  const r2 = await verificar("ocupado", ".net");
  assert.equal(r2.estado, "taken"); assert.equal(r2.fonte, "20i");
});

await teste(".ao não passa pela 20i", async () => {
  const antes = pedidos20i.length;
  const r = await verificar("padariateste", ".ao");
  assert.equal(pedidos20i.length, antes);
  assert.notEqual(r.fonte, "20i");
});

await teste("20i em erro → recorre ao RDAP/DNS sem rebentar", async () => {
  const r = await verificar("falha-teste", ".com");
  assert.notEqual(r.fonte, "20i");
  assert.ok(["free", "probable", "taken", "unknown", "error"].includes(r.estado));
});

await teste("sem VINTEI_API_KEY → não chama a 20i", async () => {
  const chave = process.env.VINTEI_API_KEY; delete process.env.VINTEI_API_KEY;
  try {
    const antes = pedidos20i.length;
    const r = await verificar("padariateste", ".com");
    assert.equal(pedidos20i.length, antes); assert.notEqual(r.fonte, "20i");
  } finally { process.env.VINTEI_API_KEY = chave; }
});

/* Proxy PHP da AngoWeb de ponta a ponta: Node → proxy-20i.php → 20i falsa (só se houver PHP nesta máquina) */
const php = [process.env.PHP, "php", "C:\\xampp\\php\\php.exe"].filter(Boolean).find((p) => { try { return spawnSync(p, ["-v"]).status === 0; } catch { return false; } });
if (!php) console.log("… proxy PHP não testado (PHP não encontrado; defina PHP=caminho/php)");
else {
  const dir = mkdtempSync(join(tmpdir(), "proxy20i-"));
  mkdirSync(join(dir, "public_html"));
  copyFileSync(new URL("./proxy-20i/proxy-20i.php", import.meta.url), join(dir, "public_html", "proxy-20i.php"));
  const segredo = "segredo-de-teste-com-mais-de-24-caracteres";
  writeFileSync(join(dir, "config-20i.php"), `<?php return ['chave_20i' => 'chave-teste-20i', 'chave_proxy' => '${segredo}', 'url_20i' => 'http://127.0.0.1:8789'];`);
  const proc = spawn(php, ["-S", "127.0.0.1:8790", "-t", join(dir, "public_html")], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch("http://127.0.0.1:8790/"); break; } catch { await new Promise((ok) => setTimeout(ok, 100)); } }

  delete process.env.VINTEI_API_KEY;   // em produção o servidor Node não tem a chave da 20i (fica no config-20i.php)
  Object.assign(process.env, { VINTEI_URL: "http://127.0.0.1:8790/proxy-20i.php?p=", VINTEI_PROXY_CHAVE: segredo });
  try {
    await teste("proxy PHP: verificar() via proxy, chave da 20i só no proxy", async () => {
      const r = await verificar("padariateste", ".com");
      assert.equal(r.estado, "free"); assert.equal(r.fonte, "20i");
      assert.equal(pedidos20i.at(-1).auth, "Bearer " + Buffer.from("chave-teste-20i").toString("base64"));
      assert.equal(await disponibilidade20i("ocupado.org"), "taken");
    });
    await teste("proxy PHP: segredo errado → 403", async () => {
      process.env.VINTEI_PROXY_CHAVE = "segredo-errado-mas-com-tamanho-suficiente";
      try { await assert.rejects(pedir20i("/reseller"), (e) => e.estado === 403); }
      finally { process.env.VINTEI_PROXY_CHAVE = segredo; }
    });
    await teste("proxy PHP: endereços fora da lista são recusados (apagar pacotes, outros métodos)", async () => {
      const antes = pedidos20i.length;
      await assert.rejects(pedir20i("/reseller/*/addDomain", { metodo: "GET" }), (e) => e.estado === 404);
      await assert.rejects(pedir20i("/reseller/*/deleteWeb", { metodo: "POST", corpo: { "delete-id": ["1"] } }), (e) => e.estado === 404);
      await assert.rejects(pedir20i("/package"), (e) => e.estado === 404);
      await assert.rejects(pedir20i("/reseller/*/packageTypes", { metodo: "POST", corpo: {} }), (e) => e.estado === 404);
      assert.equal(pedidos20i.length, antes, "nada chegou à 20i");
    });

    /* Painel admin → servidor Node (admin.mjs) → proxy PHP → 20i falsa */
    const admin = (await import("../servidor/rotas/admin.mjs")).default;
    const chamarAdmin = async (acao, dados = {}, token) => {
      const r = await admin(new Request("http://x/api/admin", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify({ acao, ...dados }) }));
      return { estado: r.status, corpo: await r.json() };
    };
    const login = await chamarAdmin("login", { email: "ecomulti.ao@gmail.com", senha: "admin@ecomult" });
    const token = login.corpo.token;
    const novaVenda = async (estado, notas = "") => (await chamarAdmin("vendas.guardar", { estado, cliente: { nome: "Cliente Teste", telefone: "923000000" },
      itens: [{ descricao: "Hospedagem — Starter", valor: 39900 }], notas }, token)).corpo.venda;

    await teste("painel: lista os tipos de pacote da 20i", async () => {
      assert.ok(token, "login no painel");
      const r = await chamarAdmin("vintei.tipos", {}, token);
      assert.equal(r.estado, 200);
      assert.deepEqual(r.corpo.tipos.map((t) => t.id + ":" + t.nome), ["111:ECOMULTI Start", "222:ECOMULTI Pro"]);
    });

    await teste("painel: sem sessão → 401 (ninguém cria pacotes sem login)", async () => {
      const r = await chamarAdmin("vintei.activar", { id: "ECO-261113-0001", tipo: "111", dominio: "x.ao" });
      assert.equal(r.estado, 401);
    });

    await teste("painel: venda em aberto não pode ser activada", async () => {
      const v = await novaVenda("em_aberto");
      const antes = pedidos20i.length;
      const r = await chamarAdmin("vintei.activar", { id: v.id, tipo: "111", dominio: "cliente.ao" }, token);
      assert.equal(r.estado, 400); assert.match(r.corpo.erro, /pagas/);
      assert.equal(pedidos20i.length, antes, "nada foi enviado à 20i");
    });

    await teste("painel: venda paga → cria hospedagem na 20i e guarda o pacote na venda", async () => {
      const v = await novaVenda("pago", "Site para padariateste.ao");
      const r = await chamarAdmin("vintei.activar", { id: v.id, tipo: "111", tipoNome: "ECOMULTI Start", dominio: "https://www.PadariaTeste.ao/" }, token);
      assert.equal(r.estado, 200, JSON.stringify(r.corpo));
      assert.equal(r.corpo.venda.vintei.pacoteId, "987654");
      assert.equal(r.corpo.venda.vintei.dominio, "padariateste.ao");
      assert.equal(r.corpo.venda.vintei.por, "ecomulti.ao@gmail.com");
      const enviado = pedidos20i.at(-1);
      assert.equal(enviado.url, "/reseller/*/addWeb"); assert.equal(enviado.metodo, "POST");
      assert.deepEqual(enviado.corpo, { type: "111", domain_name: "padariateste.ao", extra_domain_names: [] });

      // segunda vez → recusado, nada enviado
      const antes = pedidos20i.length;
      const r2 = await chamarAdmin("vintei.activar", { id: v.id, tipo: "111", dominio: "padariateste.ao" }, token);
      assert.equal(r2.estado, 409); assert.equal(pedidos20i.length, antes);

      // editar a venda não apaga a activação
      const ed = await chamarAdmin("vendas.guardar", { id: v.id, estado: "pago", cliente: { nome: "Cliente Teste" }, itens: [{ descricao: "Hospedagem", valor: 39900 }] }, token);
      assert.equal(ed.corpo.venda.vintei.pacoteId, "987654");
    });

    await teste("painel: 20i recusa → erro claro, fica registado e pode tentar de novo", async () => {
      const v = await novaVenda("pago");
      const r = await chamarAdmin("vintei.activar", { id: v.id, tipo: "222", dominio: "recusado.com" }, token);
      assert.equal(r.estado, 502); assert.match(r.corpo.erro, /Domain already hosted/);
      const lista = (await chamarAdmin("vendas.listar", {}, token)).corpo.vendas;
      assert.match(lista.find((x) => x.id === v.id).vintei.erro, /Domain already hosted/);
      const r2 = await chamarAdmin("vintei.activar", { id: v.id, tipo: "222", dominio: "outro-dominio.com" }, token);
      assert.equal(r2.estado, 200); assert.equal(r2.corpo.venda.vintei.pacoteId, "987654");
    });

    await teste("painel: domínio ou tipo inválidos → recusado antes de chamar a 20i", async () => {
      const v = await novaVenda("pago");
      const antes = pedidos20i.length;
      assert.equal((await chamarAdmin("vintei.activar", { id: v.id, tipo: "111", dominio: "não é domínio" }, token)).estado, 400);
      assert.equal((await chamarAdmin("vintei.activar", { id: v.id, tipo: "1; DROP", dominio: "ok.ao" }, token)).estado, 400);
      assert.equal(pedidos20i.length, antes);
    });

    /* ---- registo de domínios (compra real na 20i) ---- */
    const CONTACTO = { nome: "Ana Teste", organizacao: "Padaria Teste, Lda", email: "ana@padaria.ao", telefone: "923 000 001", morada: "Rua Direita 10", cidade: "Luanda", pais: "AO" };
    const vendaDominio = async (desc = "Registo de domínio — padariateste.com") => (await chamarAdmin("vendas.guardar", { estado: "pago", pagoEm: "2026-11-10",
      cliente: { nome: "Ana Teste", email: "ana@padaria.ao", telefone: "923000001" }, itens: [{ descricao: desc, valor: 32000 }] }, token)).corpo.venda;
    const registar = (id, dados) => chamarAdmin("vintei.dominio", { id, dominio: "padariateste.com", anos: 1, confirmo: true, contacto: CONTACTO, ...dados }, token);

    await teste("domínio: venda paga → confirma disponibilidade e regista com os dados do titular", async () => {
      const v = await vendaDominio();
      const r = await registar(v.id, { anos: 2 });
      assert.equal(r.estado, 200, JSON.stringify(r.corpo));
      const reg = r.corpo.venda.vinteiDominios.find((x) => x.dominio === "padariateste.com");
      assert.ok(reg.registoId); assert.equal(reg.anos, 2); assert.equal(reg.por, "ecomulti.ao@gmail.com");
      const ped = pedidos20i.filter((p) => p.url.startsWith("/domain-search/padariateste.com") || p.url === "/reseller/*/addDomain").slice(-2);
      assert.equal(ped[0].url, "/domain-search/padariateste.com", "verificou a disponibilidade antes");
      assert.equal(ped[1].url, "/reseller/*/addDomain");
      assert.deepEqual(ped[1].corpo, { name: "padariateste.com", years: 2, contact: { name: "Ana Teste", organisation: "Padaria Teste, Lda", address: "Rua Direita 10",
        city: "Luanda", sp: "Luanda", pc: "0000", cc: "AO", telephone: "+244.923000001", email: "ana@padaria.ao" } });
      // segunda vez → recusado sem chamar a 20i
      const antes = pedidos20i.length;
      assert.equal((await registar(v.id, { anos: 2 })).estado, 409); assert.equal(pedidos20i.length, antes);
      // editar a venda não apaga o registo
      const ed = await chamarAdmin("vendas.guardar", { id: v.id, estado: "pago", cliente: { nome: "Ana Teste", email: "ana@padaria.ao" }, itens: [{ descricao: "Registo de domínio — padariateste.com", valor: 32000 }] }, token);
      assert.ok(ed.corpo.venda.vinteiDominios?.[0]?.registoId);
    });

    await teste("domínio: a subscrição do domínio passa a renovar na data do registo + anos", async () => {
      const subs = (await chamarAdmin("subs.listar", {}, token)).corpo.subscricoes.filter((s) => s.dominio === "padariateste.com");
      assert.ok(subs.length >= 1);
      const hoje = new Date().toISOString().slice(0, 10), daqui2 = new Date(); daqui2.setUTCFullYear(daqui2.getUTCFullYear() + 2);
      assert.equal(subs[0].inicio, hoje); assert.equal(subs[0].renovacao, daqui2.toISOString().slice(0, 10));
    });

    await teste("domínio: ocupado, .ao ou não vendido pela 20i → recusado, nada comprado", async () => {
      const v = await vendaDominio();
      const conta = () => pedidos20i.filter((p) => p.url === "/reseller/*/addDomain").length, antes = conta();
      const ocupado = await registar(v.id, { dominio: "ocupado.com" });
      assert.equal(ocupado.estado, 409); assert.match(ocupado.corpo.erro, /já está registado/);
      const ao = await registar(v.id, { dominio: "padariateste.ao" });
      assert.equal(ao.estado, 400); assert.match(ao.corpo.erro, /\.ao/);
      assert.equal(conta(), antes, "nenhum pedido de compra chegou à 20i");
    });

    await teste("domínio: venda em aberto, sem confirmação ou dados do titular em falta → recusado antes da 20i", async () => {
      const aberta = (await chamarAdmin("vendas.guardar", { estado: "em_aberto", cliente: { nome: "X Teste" }, itens: [{ descricao: "Domínio", valor: 1 }] }, token)).corpo.venda;
      const v = await vendaDominio(), antes = pedidos20i.length;
      assert.equal((await registar(aberta.id, {})).estado, 400);
      assert.equal((await registar(v.id, { confirmo: false })).estado, 400);
      assert.equal((await registar(v.id, { contacto: { ...CONTACTO, email: "" } })).estado, 400);
      assert.equal((await registar(v.id, { contacto: { ...CONTACTO, telefone: "123" } })).estado, 400);
      assert.equal((await registar(v.id, { anos: 0 })).estado, 400);
      assert.equal(pedidos20i.length, antes);
    });

    await teste("domínio: 20i recusa (ex.: sem saldo) → erro claro, fica registado e pode tentar de novo", async () => {
      const v = await vendaDominio("Registo de domínio — semsaldo.com");
      const r = await registar(v.id, { dominio: "semsaldo.com" });
      assert.equal(r.estado, 502); assert.match(r.corpo.erro, /Insufficient account balance/);
      const lista = (await chamarAdmin("vendas.listar", {}, token)).corpo.vendas;
      assert.match(lista.find((x) => x.id === v.id).vinteiDominios[0].erro, /Insufficient/);
      assert.equal((await registar(v.id, { dominio: "outro-nome.com" })).estado, 200);
    });

    await teste("proxy: registar domínio passa; transferir domínios e mexer em DNS continuam bloqueados", async () => {
      const antes = pedidos20i.length;
      await assert.rejects(pedir20i("/reseller/*/transferDomain", { metodo: "POST", corpo: {} }), (e) => e.estado === 404);
      await assert.rejects(pedir20i("/domain/123/dns", { metodo: "POST", corpo: {} }), (e) => e.estado === 404);
      assert.equal(pedidos20i.length, antes);
    });
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
}

srv.close();
console.log(`\n${ok} testes passaram${process.exitCode ? " (com falhas acima)" : ""}.`);
