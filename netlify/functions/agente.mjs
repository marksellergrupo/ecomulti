/* POST /api/agente  — chat do site (resposta em streaming, NDJSON)
   GET  /api/agente  — diz ao widget se o modo IA está activo        */
import { executarTurno, agenteActivo } from "../../agente/nucleo.mjs";
import { lerConversa, gravarConversa, guardarPedido, contarUsoDiario } from "../../agente/armazem.mjs";
import { avisarEquipa } from "../../agente/whatsapp-api.mjs";

export const config = { path: "/api/agente" };

const LIMITE_DIARIO = Number(process.env.AGENTE_LIMITE_DIARIO || 600);   // mensagens/dia (todas as conversas)
const LIMITE_CONVERSA = Number(process.env.AGENTE_LIMITE_CONVERSA || 40); // mensagens por conversa
const PAGINAS = { "/": "Início", "/index.html": "Início", "/dominios.html": "Domínios", "/hospedagem-ecomulti.html": "Hospedagem",
  "/email-corporativo-ecomulti.html": "E-mail profissional", "/desenvolvimento-ecomulti.html": "Websites", "/orcamento-ecomulti.html": "Orçamento" };

function cabecalhosCors(req) {
  const origem = req.headers.get("origin");
  const permitidas = (process.env.AGENTE_ORIGENS || "https://www.ecomulti.ao,https://ecomulti.ao").split(",").map((s) => s.trim());
  const mesma = origem && new URL(req.url).origin === origem;
  if (!origem || mesma || !permitidas.includes(origem)) return {};
  return { "access-control-allow-origin": origem, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" };
}
const json = (corpo, estado, extra) => new Response(JSON.stringify(corpo), { status: estado, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

export default async (req) => {
  const cors = cabecalhosCors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method === "GET") return json({ ativo: agenteActivo() }, 200, cors);
  if (req.method !== "POST") return json({ erro: "método" }, 405, cors);

  let dados;
  try { dados = await req.json(); } catch { return json({ erro: "json" }, 400, cors); }
  const sessao = String(dados.sessao || "");
  const mensagem = String(dados.mensagem || "").trim();
  if (!/^[a-z0-9-]{16,64}$/i.test(sessao) || !mensagem || mensagem.length > 1200) return json({ erro: "pedido inválido" }, 400, cors);
  if (!agenteActivo()) return json({ modo: "guiado" }, 503, cors);

  const id = "site:" + sessao;
  const estado = await lerConversa(id);
  if (estado.turnos >= LIMITE_CONVERSA) return json({ modo: "humano", erro: "limite da conversa" }, 429, cors);
  if ((await contarUsoDiario()) > LIMITE_DIARIO) return json({ modo: "guiado", erro: "limite diário" }, 429, cors);

  let texto = mensagem;
  const pagina = PAGINAS[String(dados.pagina || "")];
  if (estado.turnos === 0 && pagina) texto = `[Contexto: o cliente abriu o chat na página "${pagina}" do site]\n${mensagem}`;

  const enc = new TextEncoder();
  const corpo = new ReadableStream({
    async start(controlador) {
      const enviar = (o) => { try { controlador.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch {} };
      try {
        await executarTurno(texto, {
          estado, canal: "site", sessao: id,
          aoTexto: (d) => enviar({ t: "txt", d }),
          aoAccao: (a) => enviar({ t: "accao", ...a }),
          guardarPedido, avisarEquipa
        });
        await gravarConversa(id, estado);
        enviar({ t: "fim" });
      } catch (e) {
        console.error("[agente]", e);
        enviar({ t: "erro" });
      } finally {
        controlador.close();
      }
    }
  });
  return new Response(corpo, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no", ...cors } });
};
