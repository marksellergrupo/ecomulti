/* Utilitários HTTP partilhados pelas funções do blog, da newsletter e do dashboard. */
import { timingSafeEqual, createHash, randomInt } from "node:crypto";
import { validarToken } from "./admin-auth.mjs";

export const json = (corpo, estado = 200, extra = {}) =>
  new Response(JSON.stringify(corpo), { status: estado, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

/* CORS: só é preciso se o site e a API estiverem em domínios diferentes. Origens em BLOG_ORIGENS (ou AGENTE_ORIGENS). */
export function cabecalhosCors(req, metodos = "GET,POST,DELETE,OPTIONS") {
  const origem = req.headers.get("origin");
  const permitidas = (process.env.BLOG_ORIGENS || process.env.AGENTE_ORIGENS || "https://www.ecomulti.ao,https://ecomulti.ao").split(",").map((s) => s.trim());
  const mesma = origem && new URL(req.url).origin === origem;
  if (!origem || mesma || !permitidas.includes(origem)) return {};
  return { "access-control-allow-origin": origem, "access-control-allow-methods": metodos, "access-control-allow-headers": "content-type, authorization", vary: "origin" };
}

const igual = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/* true se o pedido traz uma sessão válida do dashboard (login) ou a chave PAINEL_CHAVE */
export async function autorizado(req) {
  const dada = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!dada) return false;
  if (await validarToken(dada)) return true;
  const chave = process.env.PAINEL_CHAVE;
  return !!chave && chave.length >= 12 && igual(dada, chave);
}
export const semChave = () => !process.env.PAINEL_CHAVE || process.env.PAINEL_CHAVE.length < 12;
export const negar = (cors) => new Promise((ok) => setTimeout(ok, 600)).then(() => json({ erro: "Sessão expirada ou sem permissão. Entre novamente." }, 401, cors));

export const hash = (s) => createHash("sha256").update(s).digest("hex");
/* IP do cliente: definido pelo servidor (servidor/app.mjs) a partir do servidor web; o cliente não o consegue falsificar */
export const ipDe = (req) => (req.headers.get("x-ip-cliente") || (req.headers.get("x-forwarded-for") || "").split(",").pop() || "desconhecido").trim();

/* número de pedido/venda: ECO-AAMMDD-XXXX (data de Luanda) */
export function novoNumero(agora = new Date()) {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Luanda", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora).split("-");
  return `ECO-${a.slice(2)}${m}${d}-${randomInt(1000, 10000)}`;
}
