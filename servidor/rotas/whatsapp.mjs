/* Webhook do WhatsApp Business (Meta) — https://SEU-SITE/api/whatsapp
   GET : verificação do webhook (hub.challenge)
   POST: valida a assinatura, responde 200 de imediato e passa a mensagem
         ao processamento (whatsapp-processar.mjs), que corre logo a seguir no mesmo servidor. */
import { assinaturaValida } from "../../agente/whatsapp-api.mjs";
import processar from "./whatsapp-processar.mjs";


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
  // responde já à Meta e processa a seguir, no mesmo servidor (o agente pode demorar mais do que a Meta espera)
  setImmediate(() => {
    processar(new Request(url, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": assinatura }, body: bruto }))
      .catch((e) => console.error("[whatsapp] erro ao processar a mensagem", e));
  });
  return new Response("ok", { status: 200 });
};
