/* Limpeza diária (função agendada do Netlify):
   apaga conversas sem actividade há mais de 7 dias e registos técnicos antigos.
   Os pedidos e avisos ficam (a equipa precisa deles); apague-os quando já não forem precisos. */
import { getStore } from "@netlify/blobs";

export const config = { schedule: "@daily" };

async function limparLoja(nome, maxIdadeMs, campoData) {
  const loja = getStore({ name: nome, consistency: "strong" });
  const { blobs } = await loja.list();
  let apagados = 0;
  for (const { key } of blobs) {
    const v = await loja.get(key, { type: "json" }).catch(() => null);
    const t = v ? Number(v[campoData] || 0) : 0;
    if (Date.now() - t > maxIdadeMs) { await loja.delete(key); apagados++; }
  }
  return apagados;
}

export default async () => {
  const dia = 864e5;
  const r = {
    conversas: await limparLoja("agente-conversas", 7 * dia, "actualizado"),
    vistos: await limparLoja("agente-wa-vistos", 2 * dia, "t"),
    trincos: await limparLoja("agente-trincos", dia, "t")
  };
  console.log("[limpar]", r);
};
