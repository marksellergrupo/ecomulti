/* WhatsApp Business Cloud API (Meta): enviar mensagens e validar webhooks. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { EMPRESA } from "./catalogo.mjs";
import { registarAviso } from "./armazem.mjs";

const VERSAO = process.env.WHATSAPP_API_VERSAO || "v23.0";
export const whatsappConfigurado = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

async function graph(corpo) {
  const r = await fetch(`${process.env.WHATSAPP_GRAPH_URL || "https://graph.facebook.com"}/${VERSAO}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }),
    signal: AbortSignal.timeout(15000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`WhatsApp ${r.status}: ${j.error?.message || "erro"}`); e.codigo = j.error?.code; throw e; }
  return j;
}

/* Markdown do modelo → formatação do WhatsApp */
const paraWhatsApp = (t) => t.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/^#{1,6}\s+/gm, "").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1: $2");

export async function enviarTexto(para, texto) {
  const corpo = paraWhatsApp(texto).trim();
  // limite do WhatsApp: 4096 caracteres por mensagem
  for (let i = 0; i < corpo.length; i += 4000) {
    await graph({ to: para, type: "text", text: { body: corpo.slice(i, i + 4000), preview_url: true } });
  }
}
export const marcarLida = (id) => graph({ status: "read", message_id: id }).catch(() => {});

/* Assinatura X-Hub-Signature-256 (HMAC SHA-256 do corpo com o App Secret) */
export function assinaturaValida(corpoBruto, cabecalho) {
  const segredo = process.env.WHATSAPP_APP_SECRET;
  if (!segredo || !cabecalho || !cabecalho.startsWith("sha256=")) return false;
  const esperado = Buffer.from(createHmac("sha256", segredo).update(corpoBruto).digest("hex"));
  const recebido = Buffer.from(cabecalho.slice(7));
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

/* ------------------------------------------------------------------------
   Avisar a equipa (pedido novo / pedido de atendimento humano).
   Fica sempre registado no painel; se o WhatsApp estiver configurado,
   também envia mensagem para o número da equipa (EQUIPA_WHATSAPP).
   Fora da janela de 24 h o WhatsApp só aceita modelos aprovados: se
   WHATSAPP_MODELO_AVISO estiver definido, usa esse modelo como recurso.
   ------------------------------------------------------------------------ */
export async function avisarEquipa(aviso) {
  await registarAviso(aviso);
  if (!whatsappConfigurado()) return;
  const equipa = process.env.EQUIPA_WHATSAPP || EMPRESA.whatsapp;
  const titulo = aviso.tipo === "pedido" ? `🛒 Novo pedido ${aviso.numero}` : `🙋 Cliente pede atendimento humano (${aviso.motivo})`;
  const contacto = (aviso.whatsapp ? `\nWhatsApp do cliente: wa.me/${String(aviso.whatsapp).replace(/\D/g, "")}` : "") +
    (aviso.contacto ? `\nTelefone indicado: ${aviso.contacto}` : "");
  const texto = `${titulo}\nCanal: ${aviso.canal}${contacto}\n\n${aviso.texto}`;
  try {
    await enviarTexto(equipa, texto);
  } catch (e) {
    const modelo = process.env.WHATSAPP_MODELO_AVISO;
    if (!modelo) { console.error("[avisarEquipa]", e.message); return; }
    await graph({
      to: equipa, type: "template",
      template: { name: modelo, language: { code: process.env.WHATSAPP_MODELO_IDIOMA || "pt_PT" },
        components: [{ type: "body", parameters: [{ type: "text", text: `${titulo}${contacto}`.replace(/\n/g, " · ").slice(0, 900) }] }] }
    }).catch((e2) => console.error("[avisarEquipa modelo]", e2.message));
  }
}
