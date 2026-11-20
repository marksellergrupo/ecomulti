/* POST /api/contacto — os formulários do site ("Enviar por e-mail") e o pedido de orçamento enviam a mensagem
   directamente para a caixa da ECOMULTI, pelo SMTP do servidor (as mesmas variáveis SMTP_* da área do cliente).
   Destino: CONTACTO_EMAIL (por omissão suporte@ecomulti.ao). Responder ao e-mail responde ao cliente (Reply-To).
   Público: validação, campo-armadilha para robôs e limite de envios por IP. */
import { obterItem, gravarItem } from "../../agente/armazem.mjs";
import { json, cabecalhosCors, hash, ipDe } from "../../agente/util-http.mjs";
import { enviarEmail, envioDisponivel } from "../../agente/email.mjs";

const LIMITE_IP_HORA = Number(process.env.CONTACTO_LIMITE_IP || 10);
const destino = () => (process.env.CONTACTO_EMAIL || "suporte@ecomulti.ao").trim();
const txt = (v, max) => String(v == null ? "" : v).replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const umaLinha = (v, max) => txt(v, max).replace(/\s+/g, " ");
const EMAIL = /^[^\s@,;<>"]{1,64}@[^\s@,;<>"]{1,190}\.[^\s@,;<>"]{2,}$/;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async (req) => {
  const cors = cabecalhosCors(req, "POST,OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ erro: "método" }, 405, cors);
  let d; try { d = await req.json(); } catch { return json({ erro: "json" }, 400, cors); }

  // campo escondido que só os robôs preenchem: finge que correu bem e não envia
  if (txt(d.site, 200)) return json({ ok: true }, 200, cors);

  const nome = umaLinha(d.nome, 120), contacto = umaLinha(d.contacto, 254);
  const assunto = umaLinha(d.assunto, 150) || "Pedido pelo site";
  const texto = txt(d.texto, 8000), pagina = umaLinha(d.pagina, 120);
  if (nome.length < 2 || !texto) return json({ erro: "Indique o seu nome e a mensagem." }, 400, cors);
  const email = EMAIL.test(contacto) ? contacto.toLowerCase() : "";
  if (!email && contacto.replace(/\D/g, "").length < 9) return json({ erro: "Indique um e-mail ou telefone válido." }, 400, cors);

  if (!envioDisponivel()) return json({ erro: "envio de e-mail indisponível" }, 503, cors);

  const chave = "ip-" + hash(ipDe(req) + new Date().toISOString().slice(0, 13)).slice(0, 24);
  const uso = (await obterItem("contacto-limite", chave)) || { n: 0, t: Date.now() };
  if (uso.n >= LIMITE_IP_HORA) return json({ erro: "Demasiados envios. Tente novamente mais tarde ou fale connosco pelo WhatsApp." }, 429, cors);
  await gravarItem("contacto-limite", chave, { n: uso.n + 1, t: uso.t || Date.now() });

  const rodape = `\n\n---\nNome: ${nome}\nContacto: ${contacto}` + (pagina ? `\nPágina: ${pagina}` : "") + `\nEnviado pelo site em ${new Date().toISOString()}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#2b3555;max-width:640px">
    <h2 style="color:#0a1747;font-size:18px">${esc(assunto)}</h2>
    <pre style="font-family:inherit;white-space:pre-wrap;font-size:14px;line-height:1.5">${esc(texto)}</pre>
    <hr style="border:0;border-top:1px solid #e2e7f1"><p style="font-size:13px;color:#5f6a8a">
    <strong>Nome:</strong> ${esc(nome)}<br><strong>Contacto:</strong> ${esc(contacto)}${pagina ? `<br><strong>Página:</strong> ${esc(pagina)}` : ""}<br>
    ${email ? "Responda a este e-mail para escrever directamente ao cliente." : "O cliente deixou só o telefone."}</p></div>`;
  try {
    await enviarEmail({ para: destino(), assunto: `[Site] ${assunto}`, texto: texto + rodape, html, responderPara: email ? `"${nome.replace(/"/g, "")}" <${email}>` : undefined });
  } catch (e) {
    console.error("[contacto]", e.message);
    return json({ erro: "Não foi possível enviar agora." }, 502, cors);
  }
  return json({ ok: true }, 200, cors);
};
