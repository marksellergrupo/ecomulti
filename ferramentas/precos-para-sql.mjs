/* Gera ferramentas/api-bd/precos.sql a partir de assets/js/config.js, para a base MySQL
   (tabelas regras_preco e dominio_precos) ficar com os mesmos preços do site.
   Uso: npm run precos-sql   → depois importe precos.sql no phpMyAdmin (AngoWeb e/ou XAMPP). */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const ctx = { window: {} };
vm.runInNewContext(readFileSync(raiz + "assets/js/config.js", "utf8"), ctx);
const precos = ctx.window.ECOMULTI?.precos;
if (!precos) throw new Error("config.js não definiu window.ECOMULTI.precos");

const unidade = (k) =>
  /^(hospedagem|email)\./.test(k) ? "kz_mes" :
  /^dominio\./.test(k) ? "kz_ano" :
  /^regra\./.test(k) && k !== "regra.pagina_extra" ? "pct" : "kz";
const q = (s) => "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";

const linhas = Object.entries(precos).filter(([, v]) => Number.isFinite(Number(v)));
const regras = linhas.map(([k, v]) => `(${q(k)}, ${Math.round(Number(v))}, ${q(unidade(k))})`);
const dominios = linhas.filter(([k]) => k.startsWith("dominio.")).map(([k, v]) => `(${q(k.slice("dominio".length))},${Math.round(Number(v))}, 1)`);

const sql = `-- GERADO por ferramentas/precos-para-sql.mjs a partir de assets/js/config.js (${new Date().toISOString().slice(0, 10)}).
-- Importe no phpMyAdmin, na base ecomulti_ecomulti. Pode ser importado várias vezes.
SET NAMES utf8mb4;
START TRANSACTION;

INSERT INTO regras_preco (chave, valor, unidade) VALUES
  ${regras.join(",\n  ")}
ON DUPLICATE KEY UPDATE valor = VALUES(valor), unidade = VALUES(unidade);

INSERT INTO dominio_precos (extensao, preco_ano, ativo) VALUES
  ${dominios.join(",\n  ")}
ON DUPLICATE KEY UPDATE preco_ano = VALUES(preco_ano);

COMMIT;
`;
writeFileSync(raiz + "ferramentas/api-bd/precos.sql", sql);
console.log(`ferramentas/api-bd/precos.sql gerado (${regras.length} preços, ${dominios.length} extensões de domínio).`);
