/* Copia contactos, IVA e preços de assets/js/config.js para o agente
   (agente/dados-empresa.mjs), para o agente nunca usar valores diferentes do site.
   Corre automaticamente em `npm run preview`. Uso manual: npm run precos */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const codigo = readFileSync(raiz + "assets/js/config.js", "utf8");
const ctx = { window: {} };
vm.runInNewContext(codigo, ctx);
const cfg = ctx.window.ECOMULTI;
if (!cfg || !cfg.precos) throw new Error("config.js não definiu window.ECOMULTI.precos");

const dados = { empresa: cfg.empresa, fiscal: cfg.fiscal, precos: cfg.precos };
writeFileSync(
  raiz + "agente/dados-empresa.mjs",
  "// GERADO por ferramentas/sincronizar-precos.mjs a partir de assets/js/config.js — não editar à mão.\n" +
  "export default " + JSON.stringify(dados, null, 2) + ";\n"
);
console.log("agente/dados-empresa.mjs actualizado (" + Object.keys(cfg.precos).length + " preços).");
