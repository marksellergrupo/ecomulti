/* API da área do cliente:  POST /api/cliente   corpo: { acao: "...", ...dados }
   Públicas: registar, confirmar, reenviar, entrar, recuperar, redefinir.
   Com sessão (Authorization: Bearer <token>): sessao, subscricoes. */
import { json, cabecalhosCors, ipDe } from "../../agente/util-http.mjs";
import { registar, confirmar, reenviar, entrar, recuperar, redefinir, validarSessao, dadosPublicos, ErroCliente } from "../../agente/cliente-auth.mjs";
import { listarDoCliente } from "../../agente/subscricoes.mjs";
import { envioDisponivel } from "../../agente/email.mjs";

const PUBLICAS = { registar, confirmar, reenviar, entrar, recuperar, redefinir };
const PRECISAM_EMAIL = new Set(["registar", "reenviar", "recuperar", "entrar"]);

export default async (req) => {
  const cors = cabecalhosCors(req, "POST,OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ erro: "método" }, 405, cors);
  let d; try { d = await req.json(); } catch { return json({ erro: "json" }, 400, cors); }
  const acao = String(d?.acao || "");

  try {
    if (PUBLICAS[acao]) {
      if (PRECISAM_EMAIL.has(acao) && !envioDisponivel()) {
        return json({ erro: "A área de cliente está temporariamente indisponível. Contacte-nos por WhatsApp." }, 503, cors);
      }
      return json(await PUBLICAS[acao](d, ipDe(req)), 200, cors);
    }
    const conta = await validarSessao((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
    if (!conta) return json({ erro: "A sessão terminou. Entre novamente." }, 401, cors);
    if (acao === "sessao") return json({ ok: true, cliente: dadosPublicos(conta) }, 200, cors);
    if (acao === "subscricoes") return json({ ok: true, subscricoes: await listarDoCliente(conta.email) }, 200, cors);
    return json({ erro: "acção desconhecida" }, 400, cors);
  } catch (e) {
    if (e instanceof ErroCliente) return json({ erro: e.message }, e.estado, cors);
    console.error("[cliente]", e);
    return json({ erro: "Não foi possível concluir o pedido. Tente novamente dentro de momentos." }, 500, cors);
  }
};
