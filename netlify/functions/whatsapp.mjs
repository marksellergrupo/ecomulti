/* Webhook do WhatsApp Business (Meta) — https://SEU-SITE/api/whatsapp
   GET : verificação do webhook (hub.challenge)
   POST: valida a assinatura, responde 200 de imediato e passa a mensagem
         à função em segundo plano (o agente pode demorar mais do que a Meta espera). */
import { assinaturaValida } from "../../agente/whatsapp-api.mjs";

export const config = { path: "/api/whatsapp" };

export default async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" &&
      process.env.WHATSAPP_VERIFY_TOKEN && url.searchParams.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("proibido", { status: 403 });
  }
  if (req.method !== "POST") return new Response("método", { status: 405 });

  const bruto = await req.text();
  const assinatura = req.headers.get("x-hub-signature-256") || "";
  if (!assinaturaValida(bruto, assinatura)) return new Response("assinatura inválida", { status: 401 });

  // a Meta também envia estados (entregue/lida): só as mensagens recebidas interessam
  if (!bruto.includes('"messages"')) return new Response("ok", { status: 200 });
  try {
    await fetch(new URL("/.netlify/functions/whatsapp-processar", url), {
      method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": assinatura }, body: bruto
    });
  } catch (e) {
    console.error("[whatsapp] não foi possível passar a mensagem ao processamento", e);
  }
  return new Response("ok", { status: 200 });
};
