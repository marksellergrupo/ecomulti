/* Servidor da ECOMULTI (Node.js na AngoWeb — cPanel "Setup Node.js App").
   Atende os endereços /api/... do site no mesmo domínio (ecomulti.ao/api/...).
   Arranque no cPanel: Application startup file = app.cjs (que carrega este ficheiro).
   Em desenvolvimento (ferramentas/servidor-local.mjs) também serve as páginas do site. */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, normalize, join } from "node:path";
import { Readable } from "node:stream";
import { consultaSQL, mysqlConfigurado, ligacaoBD } from "../agente/armazem.mjs";
import limpar from "./rotas/limpar.mjs";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const SERVIR_SITE = process.env.SERVIR_SITE === "1";
const PORTA = Number(process.env.PORT || process.env.PORTA || 3000);

const ROTAS = {
  "/api/admin": () => import("./rotas/admin.mjs"),
  "/api/cliente": () => import("./rotas/cliente.mjs"),
  "/api/pedido": () => import("./rotas/pedido.mjs"),
  "/api/contacto": () => import("./rotas/contacto.mjs"),
  "/api/agente": () => import("./rotas/agente.mjs"),
  "/api/blog": () => import("./rotas/blog.mjs"),
  "/api/newsletter": () => import("./rotas/newsletter.mjs"),
  "/api/painel": () => import("./rotas/painel.mjs"),
  "/api/whatsapp": () => import("./rotas/whatsapp.mjs")
};

/* Preços da base (tabela regras_preco) em JavaScript, para <script src="api/catalogo.php">.
   Sem base de dados, não define nada e o site usa os preços do config.js. */
async function catalogo() {
  const js = (corpo) => new Response(corpo, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300" } });
  if (!mysqlConfigurado()) return js("/* catálogo indisponível (sem base de dados): o site usa os preços do config.js */\n");
  try {
    const linhas = await consultaSQL("SELECT chave, valor, unidade FROM regras_preco");
    const valores = {}, unidades = {};
    for (const l of linhas) if (/^[a-z0-9._-]{1,60}$/i.test(l.chave)) { valores[l.chave] = Number(l.valor); unidades[l.chave] = l.unidade; }
    if (!Object.keys(valores).length) return js("/* catálogo indisponível (tabela vazia): o site usa os preços do config.js */\n");
    return js(`(function () {\n  "use strict";\n  var valores = ${JSON.stringify(valores)};\n  var unidades = ${JSON.stringify(unidades)};\n` +
      `  window.precoDe = function (chave) {\n    if (!(chave in valores)) throw new Error("Preço desconhecido: " + chave);\n    return valores[chave];\n  };\n` +
      `  window.precoUnidade = function (chave) { return unidades[chave]; };\n})();\n`);
  } catch (e) {
    console.error("[catalogo]", e.message);
    return js("/* catálogo indisponível (erro na base de dados): o site usa os preços do config.js */\n");
  }
}

async function saude() {
  let bd = "sem base de dados (memória)", ligacao;
  if (mysqlConfigurado()) {
    ligacao = ligacaoBD().via;
    try { await consultaSQL("SELECT 1"); bd = "ok"; } catch (e) { bd = "erro: " + e.code; }
  }
  return new Response(JSON.stringify({ ok: true, bd, ligacao, node: process.version }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/* IP do cliente: o servidor web (LiteSpeed/Apache) acrescenta-o no fim do X-Forwarded-For */
function ipCliente(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return xff.at(-1) || String(req.headers["x-real-ip"] || "") || req.socket.remoteAddress || "desconhecido";
}

const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".xml": "application/xml" };
const BLOQUEADO = /^\/(agente|servidor|ferramentas|node_modules|_original|_publicar|\.env|\.git)/;
async function ficheiroDoSite(caminho, res) {
  if (caminho.endsWith("/")) caminho += "index.html";
  const ficheiro = normalize(join(raiz, caminho));
  if (!ficheiro.startsWith(normalize(raiz)) || BLOQUEADO.test(caminho)) { res.writeHead(403); return res.end(); }
  try {
    const dados = await readFile(ficheiro);
    res.writeHead(200, { "content-type": TIPOS[extname(ficheiro)] || "application/octet-stream" });
    res.end(dados);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile(join(raiz, "404.html")).catch(() => "404"));
  }
}

export const servidor = http.createServer(async (req, res) => {
  try {
    const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0];
    const url = new URL(req.url, `${proto}://${req.headers.host || "localhost"}`);
    // aceita /api/admin, /outra-pasta/api/admin e também /admin (quando o cPanel entrega o endereço sem o /api)
    const i = url.pathname.indexOf("/api/");
    const rota = (i >= 0 ? url.pathname.slice(i) : SERVIR_SITE ? url.pathname : "/api" + url.pathname).replace(/(.)\/+$/, "$1");

    let resposta;
    if (rota === "/api/catalogo.php" || rota === "/api/catalogo") resposta = await catalogo();
    else if (rota === "/api/saude") resposta = await saude();
    else if (ROTAS[rota]) {
      const cab = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (k !== "x-ip-cliente") cab.set(k, Array.isArray(v) ? v.join(", ") : v);
      cab.set("x-ip-cliente", ipCliente(req));
      const corpo = ["GET", "HEAD"].includes(req.method) ? undefined : Readable.toWeb(req);
      const fn = (await ROTAS[rota]()).default;
      resposta = await fn(new Request(url, { method: req.method, headers: cab, body: corpo, duplex: "half" }));
    } else if (SERVIR_SITE && i < 0) return ficheiroDoSite(decodeURIComponent(url.pathname), res);
    else resposta = new Response(JSON.stringify({ erro: "não encontrado" }), { status: 404, headers: { "content-type": "application/json" } });

    res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
    if (resposta.body) for await (const parte of resposta.body) res.write(parte);   // permite respostas em streaming (chat)
    res.end();
  } catch (e) {
    console.error("[servidor]", e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ erro: "Erro interno." }));
  }
});

/* Limpeza diária (conversas e registos técnicos antigos) */
const correrLimpeza = () => limpar().catch((e) => console.error("[limpar]", e.message));
setTimeout(correrLimpeza, 60_000).unref();
setInterval(correrLimpeza, 864e5).unref();

if (process.env.NAO_ESCUTAR !== "1") {
  servidor.listen(PORTA, () => console.log(`ECOMULTI servidor em ${PORTA}${SERVIR_SITE ? " (com o site)" : ""} · base de dados: ${mysqlConfigurado() ? process.env.DB_NOME : "memória"}`));
}
