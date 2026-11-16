/* API de revenda da 20i (https://api.20i.com).
   Autenticação: cabeçalho "Authorization: Bearer <General API Key em base64>".
   A 20i só aceita pedidos de IPs autorizados no My20i.

   Dois modos:
   • Directo (testes no seu computador): VINTEI_API_KEY.
   • Produção (servidor Node na AngoWeb): os pedidos passam pelo proxy PHP na AngoWeb
     (ferramentas/proxy-20i/proxy-20i.php), que tem IP fixo e guarda a chave da 20i.
     VINTEI_URL = endereço do proxy terminado em "?p=" e VINTEI_PROXY_CHAVE = segredo partilhado. */

const chave = () => (process.env.VINTEI_API_KEY || "").trim();
const chaveProxy = () => (process.env.VINTEI_PROXY_CHAVE || "").trim();
export const vinteiConfigurado = () => Boolean(chave() || (process.env.VINTEI_URL && chaveProxy()));

const base = () => (process.env.VINTEI_URL || "https://api.20i.com").replace(/\/+$/, "");

export async function pedir20i(caminho, { metodo = "GET", corpo, timeout = 10000 } = {}) {
  if (!vinteiConfigurado()) throw new Error("20i: defina VINTEI_API_KEY, ou VINTEI_URL + VINTEI_PROXY_CHAVE");
  const auth = {};
  if (chave()) auth.authorization = `Bearer ${Buffer.from(chave()).toString("base64")}`;
  if (chaveProxy()) auth["x-proxy-chave"] = chaveProxy();
  const r = await fetch(base() + caminho, {
    method: metodo,
    headers: { ...auth, accept: "application/json", ...(corpo ? { "content-type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(timeout)
  });
  const texto = await r.text();
  let j; try { j = texto ? JSON.parse(texto) : null; } catch { j = texto; }
  if (!r.ok) {
    const msg = (j && typeof j === "object" && (j.error?.message || j.message || j.error)) || (r.status === 401 ? "chave inválida ou IP não autorizado" : "erro");
    const e = new Error(`20i ${r.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
    e.estado = r.status;
    throw e;
  }
  return j;
}

/* Dados da conta de revenda — útil para testar a ligação (chave + IP autorizado). */
export const contaRevenda = () => pedir20i("/reseller");

/* Tipos de pacote de alojamento da conta de revenda (os planos criados no My20i). */
export async function tiposPacote() {
  const r = await pedir20i("/reseller/*/packageTypes");
  const lista = Array.isArray(r) ? r : Array.isArray(r?.result) ? r.result : r && typeof r === "object" ? Object.values(r) : [];
  return lista
    .filter((t) => t && (t.id != null))
    .map((t) => ({ id: String(t.id), nome: String(t.label || t.name || "Pacote " + t.id), plataforma: String(t.platform || t.type || "") }));
}

/* Cria um pacote de alojamento na 20i. Devolve o ID do pacote criado. */
export async function criarHospedagem({ tipo, dominio }) {
  const r = await pedir20i("/reseller/*/addWeb", { metodo: "POST", corpo: { type: tipo, domain_name: dominio, extra_domain_names: [] }, timeout: 30000 });
  const id = r && typeof r === "object" ? (r.result ?? r.id ?? r.package_id) : r;
  if (id == null || id === false || typeof id === "object") throw new Error("20i: resposta sem o número do pacote (" + JSON.stringify(r).slice(0, 200) + ")");
  return { pacoteId: String(id) };
}

/* Disponibilidade de um domínio pela pesquisa da 20i.
   Devolve "free", "taken" ou null (resposta sem informação sobre esse domínio). */
export async function disponibilidade20i(dominio) {
  const dom = String(dominio).toLowerCase();
  const r = await pedir20i(`/domain-search/${encodeURIComponent(dom)}`, { timeout: 8000 });
  const lista = Array.isArray(r) ? r : Array.isArray(r?.results) ? r.results : r ? [r] : [];
  const item = lista.find((x) => x && String(x.name || x.domain || "").toLowerCase() === dom);
  if (!item) return null;
  if (item.available === true || item.can === "register") return "free";
  if (item.available === false || /transfer|renew|taken|unavailable/i.test(String(item.can || ""))) return "taken";
  return null;
}
