/* Servidor local para experimentar o site + agente no computador.
   Uso:  set ANTHROPIC_API_KEY=...   (PowerShell: $env:ANTHROPIC_API_KEY="...")
         node ferramentas/servidor-local.mjs      → http://localhost:8099
   Sem chave, o chat funciona em modo guiado. */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, normalize, join } from "node:path";
import { Readable } from "node:stream";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const PORTA = Number(process.env.PORTA || 8099);
const rotas = {
  "/api/agente": (await import("../netlify/functions/agente.mjs")).default,
  "/api/painel": (await import("../netlify/functions/painel.mjs")).default,
  "/api/blog": (await import("../netlify/functions/blog.mjs")).default,
  "/api/newsletter": (await import("../netlify/functions/newsletter.mjs")).default,
  "/api/admin": (await import("../netlify/functions/admin.mjs")).default,
  "/api/pedido": (await import("../netlify/functions/pedido.mjs")).default
};
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".xml": "application/xml" };
const BLOQUEADO = /^\/(agente|netlify|ferramentas|node_modules|_original|\.env)/;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  const rota = rotas[url.pathname];
  if (rota) {
    const corpo = ["GET", "HEAD"].includes(req.method) ? undefined : Readable.toWeb(req);
    const r = await rota(new Request(url, { method: req.method, headers: req.headers, body: corpo, duplex: "half" }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    if (r.body) for await (const parte of r.body) res.write(parte);
    return res.end();
  }
  let caminho = decodeURIComponent(url.pathname);
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
}).listen(PORTA, () => console.log(`Site + agente em http://localhost:${PORTA}  (IA: ${process.env.ANTHROPIC_API_KEY ? "activa" : "desligada — modo guiado"})`));
