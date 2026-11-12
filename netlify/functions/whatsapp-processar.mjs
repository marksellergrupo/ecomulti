/* Função em segundo plano (até 15 min): responde às mensagens do WhatsApp com o agente.
   Só é chamada pela função whatsapp.mjs, com a assinatura original da Meta. */
import { executarTurno, agenteActivo } from "../../agente/nucleo.mjs";
import { lerConversa, gravarConversa, guardarPedido, marcarVisto, trancar, contarUsoDiario } from "../../agente/armazem.mjs";
import { assinaturaValida, enviarTexto, marcarLida, avisarEquipa } from "../../agente/whatsapp-api.mjs";
import { EMPRESA } from "../../agente/catalogo.mjs";

export const config = { background: true };

const PAUSA_HUMANO_H = Number(process.env.WHATSAPP_PAUSA_HUMANO_HORAS || 0); // >0 só se a equipa responde neste mesmo número
const LIMITE_DIARIO = Number(process.env.AGENTE_LIMITE_DIARIO || 600);
const LIMITE_CONVERSA = Number(process.env.AGENTE_LIMITE_CONVERSA_WA || 80);
const SITE = process.env.SITE_URL || "https://www.ecomulti.ao";
const HUMANO = `wa.me/${EMPRESA.whatsapp}`;

const MENU_SEM_IA =
  `Olá! 👋 Obrigado por contactar a *${EMPRESA.nome}*.\n\n` +
  `Pode ver preços e montar o seu orçamento no site: ${SITE}\n` +
  `• Domínios: ${SITE}/dominios.html\n• Hospedagem: ${SITE}/hospedagem-ecomulti.html\n` +
  `• E-mail profissional: ${SITE}/email-corporativo-ecomulti.html\n• Websites: ${SITE}/desenvolvimento-ecomulti.html\n\n` +
  `Para falar com a nossa equipa: ${HUMANO}`;

export default async (req) => {
  const bruto = await req.text();
  if (!assinaturaValida(bruto, req.headers.get("x-hub-signature-256") || "")) return;
  let dados;
  try { dados = JSON.parse(bruto); } catch { return; }
  for (const entrada of dados.entry || []) {
    for (const alteracao of entrada.changes || []) {
      const v = alteracao.value || {};
      for (const m of v.messages || []) {
        await tratar(m, v.contacts || []).catch((e) => console.error("[whatsapp-processar]", e));
      }
    }
  }
};

async function tratar(m, contactos) {
  if (!(await marcarVisto(m.id))) return;                       // a Meta pode reenviar a mesma mensagem
  if (Date.now() / 1000 - Number(m.timestamp || 0) > 3600) return; // ignora mensagens muito antigas
  const de = m.from;
  marcarLida(m.id);

  if (m.type !== "text" || !m.text?.body) {
    await enviarTexto(de, "Por agora só consigo ler mensagens de texto 🙂 Pode escrever a sua pergunta, por favor?");
    return;
  }
  if (!agenteActivo()) { await enviarTexto(de, MENU_SEM_IA); return; }

  const id = "wa:" + de;
  const libertar = await trancar(id);
  const texto = m.text.body.slice(0, 1500);
  try {
    const estado = await lerConversa(id);
    if (estado.humano && PAUSA_HUMANO_H > 0) {
      if (Date.now() - estado.humano.desde < PAUSA_HUMANO_H * 3600e3) return; // a equipa está a atender
      estado.humano = null;
    }
    if (estado.turnos >= LIMITE_CONVERSA || (await contarUsoDiario()) > LIMITE_DIARIO) {
      await enviarTexto(de, `Obrigado pela mensagem! Para continuar, fale directamente com a nossa equipa: ${HUMANO}`);
      return;
    }
    const nome = contactos.find((c) => c.wa_id === de)?.profile?.name;
    const prefixo = estado.turnos === 0 ? `[Contexto: primeiro contacto pelo WhatsApp. Nome no perfil: ${nome || "desconhecido"}. Telefone: +${de}]\n` : "";
    const resposta = await executarTurno(prefixo + texto, {
      estado, canal: "whatsapp", sessao: id, contacto: de, pausaHumano: PAUSA_HUMANO_H > 0,
      guardarPedido, avisarEquipa
    });
    await gravarConversa(id, estado);
    await enviarTexto(de, resposta || "Desculpe, não percebi bem. Pode explicar de outra forma?");
  } catch (e) {
    console.error("[whatsapp-processar] falha no agente", e);
    await enviarTexto(de, `Desculpe, tive um problema técnico. A nossa equipa vai responder-lhe em breve — ou fale já connosco: ${HUMANO}`).catch(() => {});
    await avisarEquipa({ tipo: "humano", motivo: "erro_tecnico", texto: `O assistente falhou ao responder a: "${texto.slice(0, 300)}"`, canal: "whatsapp", whatsapp: de }).catch(() => {});
  } finally {
    await libertar();
  }
}
