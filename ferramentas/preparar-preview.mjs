/* Prepara _publicar/ecomulti-preview (cópia limpa para o Netlify):
   1) sincroniza os preços do agente com config.js
   2) copia o site, sem ficheiros internos
   3) robots.txt bloqueia o Google (é só uma pré-visualização)
   Uso: npm run preview   (depois: publicar com o Netlify CLI — ver LEIA-ME.md) */
import { cpSync, rmSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const destino = raiz + "_publicar/ecomulti-preview/";
const EXCLUIR = new Set(["_original", "_publicar", "node_modules", "netlify", "agente", "ferramentas", ".netlify",
  "LEIA-ME.md", "AGENTE-LEIA-ME.md", ".htaccess", "package.json", "package-lock.json", "netlify.toml", ".env", ".gitignore"]);

execFileSync(process.execPath, [raiz + "ferramentas/sincronizar-precos.mjs"], { stdio: "inherit" });

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
for (const nome of readdirSync(raiz)) {
  if (EXCLUIR.has(nome) || nome.startsWith(".env")) continue;
  cpSync(raiz + nome, destino + nome, { recursive: true });
}
writeFileSync(destino + "robots.txt", "User-agent: *\nDisallow: /\n");
console.log("Pré-visualização pronta em _publicar/ecomulti-preview");
