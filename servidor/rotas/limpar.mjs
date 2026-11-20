/* Limpeza diária (corre dentro do servidor, uma vez por dia — ver servidor/app.mjs):
   apaga conversas sem actividade há mais de 7 dias e registos técnicos antigos.
   Os pedidos e avisos ficam (a equipa precisa deles); apague-os quando já não forem precisos. */
import { limparAntigos } from "../../agente/armazem.mjs";

export default async function limpar() {
  const dia = 864e5;
  const r = {
    conversas: await limparAntigos("agente-conversas", 7 * dia, "actualizado"),
    vistos: await limparAntigos("agente-wa-vistos", 2 * dia, "t"),
    trincos: await limparAntigos("agente-trincos", dia, "t"),
    contactos: await limparAntigos("contacto-limite", dia, "t")
  };
  console.log("[limpar]", r);
  return r;
}
