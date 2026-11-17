/* Prepara o pacote para a hospedagem da AngoWeb: _publicar/ecomulti-angoweb.zip
   - public_html/        → site + proxy-20i.php + api-bd.php
   - ecomulti-servidor/  → aplicação Node.js (cPanel "Setup Node.js App", URL ecomulti.ao/api)
   - fora-do-public_html/ → modelos dos ficheiros de configuração e precos.sql (NÃO vão para a pasta pública)
   Uso: npm run angoweb */
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const base = raiz + "_publicar/angoweb/";
const pub = base + "public_html/";
const app = base + "ecomulti-servidor/";
const fora = base + "fora-do-public_html/";
const EXCLUIR = new Set(["_original", "_publicar", "node_modules", "agente", "servidor", "ferramentas", ".git", ".claude", ".vscode",
  "README.md", "LEIA-ME.md", "AGENTE-LEIA-ME.md", "package.json", "package-lock.json", "app.cjs", ".env", ".gitignore"]);

execFileSync(process.execPath, [raiz + "ferramentas/sincronizar-precos.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, [raiz + "ferramentas/precos-para-sql.mjs"], { stdio: "inherit" });

rmSync(base, { recursive: true, force: true });
for (const p of [pub, app, fora]) mkdirSync(p, { recursive: true });

/* 1) site (o config.js usa /api/..., servido pela aplicação Node no mesmo domínio) */
for (const nome of readdirSync(raiz)) {
  if (EXCLUIR.has(nome) || nome.startsWith(".env") || /\.(md|mjs|cjs|sql|zip)$/i.test(nome)) continue;
  cpSync(raiz + nome, pub + nome, { recursive: true });
}
if (!/endpoint:\s*"\/api\/admin"/.test(readFileSync(pub + "assets/js/config.js", "utf8"))) throw new Error("config.js: o endpoint do admin devia ser /api/admin");

/* 2) PHP da AngoWeb */
copyFileSync(raiz + "ferramentas/proxy-20i/proxy-20i.php", pub + "proxy-20i.php");
copyFileSync(raiz + "ferramentas/api-bd/api-bd.php", pub + "api-bd.php");

/* 3) .htaccess: bloqueia ficheiros internos se alguém os enviar por engano */
writeFileSync(pub + ".htaccess", readFileSync(raiz + ".htaccess", "utf8") + `
# Ficheiros internos nunca são servidos (documentação, scripts, SQL, configurações)
<FilesMatch "\\.(md|mjs|cjs|sql|toml|lock|env)$|^(package(-lock)?\\.json|config-.*\\.php)$">
  Require all denied
</FilesMatch>
`);

/* 4) aplicação Node.js (sem node_modules: o cPanel instala com "Run NPM Install") */
for (const nome of ["app.cjs", "package.json", "package-lock.json"]) copyFileSync(raiz + nome, app + nome);
cpSync(raiz + "servidor", app + "servidor", { recursive: true });
cpSync(raiz + "agente", app + "agente", { recursive: true });

/* 5) fora da pasta pública: modelos de configuração + preços */
copyFileSync(raiz + "ferramentas/api-bd/config-bd.exemplo.php", fora + "config-bd.exemplo.php");
copyFileSync(raiz + "ferramentas/proxy-20i/config-20i.exemplo.php", fora + "config-20i.exemplo.php");
copyFileSync(raiz + "ferramentas/api-bd/precos.sql", fora + "precos.sql");

writeFileSync(base + "LEIA-PRIMEIRO.txt", `PACOTE ECOMULTI PARA A ANGOWEB  (gerado em ${new Date().toISOString().slice(0, 16).replace("T", " ")})
Tudo corre na AngoWeb: site (public_html), API (aplicação Node.js em ecomulti.ao/api) e dados (MySQL).

1) public_html/
   Envie o conteúdo desta pasta para o public_html (substituir ficheiros).
   APAGUE a pasta public_html/api (tinha o catalogo.php antigo: agora é a aplicação Node que responde em /api).

2) ecomulti-servidor/
   Envie a pasta para a sua pasta pessoal, ao lado do public_html (ex.: /home/UTILIZADOR/ecomulti-servidor).
   No cPanel → Setup Node.js App → Create Application:
     Node.js version: 20 ou superior · Application mode: Production
     Application root: ecomulti-servidor · Application URL: ecomulti.ao / api · Startup file: app.cjs
   Em "Environment variables" acrescente (ver LEIA-ME.md):
     DB_NOME, DB_UTILIZADOR, DB_SENHA  (os mesmos do config-bd.php)
     VINTEI_URL, VINTEI_PROXY_CHAVE, BD_URL, BD_CHAVE
     SMTP_HOST, SMTP_PORTA, SMTP_UTILIZADOR, SMTP_SENHA  (área do cliente: envio dos códigos)
     (opcional) ANTHROPIC_API_KEY, ADMIN_EMAIL, ADMIN_SENHA
   Carregue em "Run NPM Install" e depois em "Restart".
   Teste: https://ecomulti.ao/api/saude  → {"ok":true,"bd":"ok",...}

3) fora-do-public_html/
   NÃO envie para o public_html. Modelos do config-20i.php e config-bd.php (se ainda não os tiver)
   e precos.sql (importar no phpMyAdmin, base ecomulti_ecomulti).
`);

/* 6) zip (caminhos com "/" para o Linux da AngoWeb) */
const zip = raiz + "_publicar/ecomulti-angoweb.zip";
rmSync(zip, { force: true });
const r = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", raiz + "ferramentas/zip.ps1",
  "-Origem", base, "-Destino", zip], { stdio: "inherit" });
console.log(r.status === 0 && existsSync(zip) ? `Pacote pronto: ${zip}` : `Pasta pronta em ${base} (zip não criado: comprima-a à mão).`);
