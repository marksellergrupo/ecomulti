/* Verificação de domínios no servidor — mesma lógica de assets/js/dominio.js.
   Com VINTEI_API_KEY: extensões internacionais (.com/.net/.org) → pesquisa da 20i (registador).
   Sem chave, ou se a 20i falhar: .com/.net/.org → RDAP oficial; .ao/.co.ao → DNS público (indicativo). */
import { preco } from "./catalogo.mjs";
import { vinteiConfigurado, disponibilidade20i } from "./vintei.mjs";

const RDAP = {
  ".com": "https://rdap.verisign.com/com/v1/domain/",
  ".net": "https://rdap.verisign.com/net/v1/domain/",
  ".org": "https://rdap.publicinterestregistry.org/rdap/domain/"
};
export const ESTADOS = {
  free: "disponível",
  probable: "provavelmente disponível (confirmação final pela equipa)",
  taken: "já registado",
  unknown: "não foi possível confirmar — a equipa confirma",
  error: "não foi possível confirmar — a equipa confirma"
};

const pedir = (url, accept) => fetch(url, { headers: { accept }, signal: AbortSignal.timeout(8000) });

async function viaRdap(dom, ext) {
  const r = await pedir(RDAP[ext] + encodeURIComponent(dom), "application/rdap+json");
  if (r.status === 404) return "free";
  if (r.ok) return "taken";
  throw new Error("rdap " + r.status);
}
async function viaDns(dom) {
  const r = await pedir(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(dom)}&type=NS`, "application/dns-json");
  if (!r.ok) throw new Error("dns " + r.status);
  const j = await r.json();
  if (j.Status === 3) return "probable";
  if (j.Answer && j.Answer.length) return "taken";
  return "unknown";
}
/* .ao e subdomínios .ao não são vendidos pela 20i */
const usa20i = (ext) => vinteiConfigurado() && !ext.endsWith(".ao");

async function via20i(dom) {
  try { return await disponibilidade20i(dom); }
  catch (e) { console.error("[20i]", e.message); return null; }
}

export async function verificar(nome, ext) {
  const dom = nome + ext;
  let estado = null, fonte = null;
  if (usa20i(ext)) { estado = await via20i(dom); if (estado) fonte = "20i"; }
  if (!estado) {
    try {
      if (RDAP[ext]) { try { estado = await viaRdap(dom, ext); fonte = "rdap"; } catch { estado = await viaDns(dom); fonte = "dns"; } }
      else { estado = await viaDns(dom); fonte = "dns"; }
    } catch { estado = "error"; }
  }
  return { dominio: dom, estado, situacao: ESTADOS[estado], preco_ano_kz: preco("dominio" + ext), fonte };
}
