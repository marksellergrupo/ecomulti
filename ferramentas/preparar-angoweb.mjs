/* Prepara o pacote para a hospedagem da AngoWeb: _publicar/ecomulti-angoweb.zip
   - public_html/  → site + proxy-20i.php + api-bd.php + api/catalogo.php
                     (config.js aponta as APIs para o Netlify, onde correm as funções)
   - fora-do-public_html/ → modelos dos ficheiros de configuração e precos.sql (NÃO vão para a pasta pública)
   Uso: npm run angoweb        (endereço do Netlify: NETLIFY_URL=https://xxx.netlify.app npm run angoweb) */
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const NETLIFY = (process.env.NETLIFY_URL || "https://ecomulti-preview.netlify.app").replace(/\/+$/, "");
const base = raiz + "_publicar/angoweb/";
const pub = base + "public_html/";
const fora = base + "fora-do-public_html/";
const EXCLUIR = new Set(["_original", "_publicar", "node_modules", "netlify", "agente", "ferramentas", ".netlify", ".git", ".claude", ".vscode",
  "README.md", "LEIA-ME.md", "AGENTE-LEIA-ME.md", "package.json", "package-lock.json", "netlify.toml", ".env", ".gitignore"]);

execFileSync(process.execPath, [raiz + "ferramentas/sincronizar-precos.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, [raiz + "ferramentas/precos-para-sql.mjs"], { stdio: "inherit" });

rmSync(base, { recursive: true, force: true });
mkdirSync(pub + "api", { recursive: true });
mkdirSync(fora, { recursive: true });

/* 1) site */
for (const nome of readdirSync(raiz)) {
  if (EXCLUIR.has(nome) || nome.startsWith(".env") || /\.(md|mjs|sql|zip)$/i.test(nome)) continue;
  cpSync(raiz + nome, pub + nome, { recursive: true });
}

/* 2) config.js: as APIs (chat, pedidos, painel, blog, newsletter) correm no Netlify */
const cfg = pub + "assets/js/config.js";
const antes = readFileSync(cfg, "utf8");
const depois = antes.replace(/endpoint:\s*"\/api\//g, `endpoint: "${NETLIFY}/api/`);
if ((depois.match(new RegExp(NETLIFY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/api/", "g")) || []).length < 5) throw new Error("config.js: não encontrei os 5 endpoints /api/...");
writeFileSync(cfg, depois);

/* 3) PHP da AngoWeb */
copyFileSync(raiz + "ferramentas/proxy-20i/proxy-20i.php", pub + "proxy-20i.php");
copyFileSync(raiz + "ferramentas/api-bd/api-bd.php", pub + "api-bd.php");
copyFileSync(raiz + "ferramentas/api-bd/catalogo.php", pub + "api/catalogo.php");

/* 4) .htaccess: bloqueia ficheiros internos se alguém os enviar por engano */
writeFileSync(pub + ".htaccess", readFileSync(raiz + ".htaccess", "utf8") + `
# Ficheiros internos nunca são servidos (documentação, scripts, SQL, configurações)
<FilesMatch "\\.(md|mjs|sql|toml|lock|env)$|^(package(-lock)?\\.json|config-.*\\.php)$">
  Require all denied
</FilesMatch>
`);

/* 5) fora da pasta pública: modelos de configuração + preços */
copyFileSync(raiz + "ferramentas/api-bd/config-bd.exemplo.php", fora + "config-bd.exemplo.php");
copyFileSync(raiz + "ferramentas/proxy-20i/config-20i.exemplo.php", fora + "config-20i.exemplo.php");
copyFileSync(raiz + "ferramentas/api-bd/precos.sql", fora + "precos.sql");

writeFileSync(base + "LEIA-PRIMEIRO.txt", `PACOTE ECOMULTI PARA A ANGOWEB  (gerado em ${new Date().toISOString().slice(0, 16).replace("T", " ")})
APIs do site apontadas para: ${NETLIFY}

1) public_html/
   Envie TODO o conteúdo desta pasta para o public_html da AngoWeb (substituir ficheiros).
   Depois APAGUE do public_html os ficheiros antigos que já não fazem parte do site:
   AGENTE-LEIA-ME.md, package.json, package-lock.json, netlify.toml e todos os .mjs.

2) fora-do-public_html/
   NÃO envie esta pasta para o public_html.
   - config-20i.php e config-bd.php: já os criou na pasta acima do public_html. Se ainda não criou
     o config-bd.php, use config-bd.exemplo.php como modelo (renomeie e preencha).
   - precos.sql: importe no phpMyAdmin da AngoWeb, na base ecomulti_ecomulti (Importar).

3) Testes
   - https://ecomulti.ao/api-bd.php      → deve mostrar "api-bd: acesso negado"
   - https://ecomulti.ao/proxy-20i.php   → deve mostrar "proxy: acesso negado"
   - https://ecomulti.ao/api/catalogo.php → deve mostrar código com os preços

4) No Netlify (variáveis): BD_URL, BD_CHAVE, VINTEI_URL, VINTEI_PROXY_CHAVE e publique de novo.
`);

/* 6) zip */
const zip = raiz + "_publicar/ecomulti-angoweb.zip";
rmSync(zip, { force: true });
// caminhos com "/" (o Compress-Archive do PowerShell 5.1 usa "\" e o Linux da AngoWeb extrai mal)
const r = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", raiz + "ferramentas/zip.ps1",
  "-Origem", base, "-Destino", zip], { stdio: "inherit" });
spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", raiz + "ferramentas/zip.ps1",
  "-Origem", pub + "assets", "-Destino", raiz + "_publicar/assets.zip", "-IncluirPasta"], { stdio: "inherit" });
console.log(r.status === 0 && existsSync(zip) ? `Pacote pronto: ${zip}` : `Pasta pronta em ${base} (zip não criado: comprima-a à mão).`);
