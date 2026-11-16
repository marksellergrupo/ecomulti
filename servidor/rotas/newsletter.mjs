/* API da newsletter (captação de leads).
   POST   /api/newsletter           — público: subscrever
   GET    /api/newsletter           — painel: lista de subscritores   (Authorization: Bearer PAINEL_CHAVE)
   DELETE /api/newsletter?email=x   — painel: remover subscritor                                              */
import { listarTudo, obterItem, gravarItem, apagarItem } from "../../agente/armazem.mjs";
import { json, cabecalhosCors, autorizado, negar, hash, ipDe } from "../../agente/util-http.mjs";

const LOJA = "newsletter-subs";
const LIMITE_IP_DIA = Number(process.env.NEWSLETTER_LIMITE_IP || 15);
const INTERESSES = ["Notícias da empresa", "Domínios .ao", "Hospedagem", "Websites e lojas online", "E-mail profissional", "VPS", "Automação com IA", "Dicas e novidades digitais"];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const txt = (v, max) => String(v == null ? "" : v).replace(/\u0000/g, "").trim().slice(0, max);

/* Números angolanos: 9 dígitos a começar por 9 (aceita +244 / 00244) */
function telefoneAO(v) {
  const n = String(v || "").replace(/[\s().-]/g, "").replace(/^(\+|00)?244/, "");
  return /^9\d{8}$/.test(n) ? "+244" + n : null;
}

export default async (req) => {
  const cors = cabecalhosCors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (req.method === "POST") {
    let d; try { d = await req.json(); } catch { return json({ erro: "json" }, 400, cors); }
    if (d.website) return json({ ok: true }, 200, cors);                       // campo-isco (robôs): finge sucesso
    const email = txt(d.email, 254).toLowerCase();
    if (!EMAIL.test(email)) return json({ erro: "Indique um e-mail válido." }, 400, cors);
    if (d.consentimento !== true) return json({ erro: "É preciso aceitar a política de privacidade." }, 400, cors);
    let whatsapp = "";
    if (txt(d.whatsapp, 30)) {
      whatsapp = telefoneAO(d.whatsapp);
      if (!whatsapp) return json({ erro: "O WhatsApp deve ter 9 dígitos, por exemplo 923 000 000." }, 400, cors);
    }

    // limite por dia e por IP (guardado só como hash)
    const chaveLimite = "ip-" + hash(ipDe(req) + new Date().toISOString().slice(0, 10)).slice(0, 24);
    const uso = (await obterItem("newsletter-limite", chaveLimite)) || { n: 0 };
    if (uso.n >= LIMITE_IP_DIA) return json({ erro: "Demasiados pedidos. Tente novamente amanhã." }, 429, cors);
    await gravarItem("newsletter-limite", chaveLimite, { n: uso.n + 1 });

    const chave = hash(email);
    const antigo = await obterItem(LOJA, chave);
    const interesses = (Array.isArray(d.interesses) ? d.interesses : []).map((i) => txt(i, 40)).filter((i) => INTERESSES.includes(i));
    const agora = new Date().toISOString();
    const reg = {
      email, nome: txt(d.nome, 80) || antigo?.nome || "",
      whatsapp: whatsapp || antigo?.whatsapp || "",
      interesses: [...new Set([...(antigo?.interesses || []), ...interesses])],
      origem: antigo?.origem || txt(d.origem, 30) || "site",           // site | blog | artigo (fica a primeira origem)
      pagina: antigo?.pagina || txt(d.pagina, 120) || "",
      consentimento: true, consentidoEm: antigo?.consentidoEm || agora,
      data: antigo?.data || agora, actualizado: agora
    };
    await gravarItem(LOJA, chave, reg);
    return json({ ok: true, jaExistia: !!antigo }, 200, cors);
  }

  if (!(await autorizado(req))) return negar(cors);
  if (req.method === "GET") {
    const lista = (await listarTudo(LOJA)).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    return json({ subscritores: lista }, 200, cors);
  }
  if (req.method === "DELETE") {
    const email = txt(new URL(req.url).searchParams.get("email"), 254).toLowerCase();
    if (!EMAIL.test(email)) return json({ erro: "e-mail inválido" }, 400, cors);
    await apagarItem(LOJA, hash(email));
    return json({ ok: true }, 200, cors);
  }
  return json({ erro: "método" }, 405, cors);
};
