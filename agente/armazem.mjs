/* Armazenamento (Netlify Blobs): conversas, pedidos e avisos à equipa.
   Fora do Netlify (testes locais) usa memória. */
import { getStore } from "@netlify/blobs";
import { estadoNovo } from "./nucleo.mjs";

const memoria = new Map();
function lojaMemoria(nome) {
  const k = (c) => nome + "/" + c;
  return {
    async get(c) { return memoria.has(k(c)) ? structuredClone(memoria.get(k(c))) : null; },
    async setJSON(c, v, o = {}) { if (o.onlyIfNew && memoria.has(k(c))) return { modified: false }; memoria.set(k(c), structuredClone(v)); return { modified: true }; },
    async delete(c) { memoria.delete(k(c)); },
    async list({ prefix = "" } = {}) { return { blobs: [...memoria.keys()].filter((x) => x.startsWith(k(prefix))).map((x) => ({ key: x.slice(nome.length + 1) })) }; }
  };
}
function loja(nome) {
  try { return getStore({ name: nome, consistency: "strong" }); }
  catch { return lojaMemoria(nome); }
}
const ler = (l, c) => l.get(c, { type: "json" });

/* -------- conversas -------- */
const DIAS_CONVERSA = 7;
export async function lerConversa(id) {
  const e = await ler(loja("agente-conversas"), id);
  if (!e || Date.now() - (e.actualizado || 0) > DIAS_CONVERSA * 864e5) return estadoNovo();
  return e;
}
export async function gravarConversa(id, estado) {
  estado.actualizado = Date.now();
  await loja("agente-conversas").setJSON(id, estado);
}

/* -------- pedidos e avisos (para o painel da equipa) -------- */
const chaveTempo = () => new Date().toISOString().replace(/[:.]/g, "-");
export async function guardarPedido(p) {
  await loja("agente-pedidos").setJSON(`${chaveTempo()}_${p.numero}`, p);
}
export async function registarAviso(a) {
  await loja("agente-avisos").setJSON(`${chaveTempo()}_${Math.random().toString(36).slice(2, 7)}`, { ...a, data: new Date().toISOString() });
}
export async function listar(nomeLoja, limite = 100) {
  const l = loja(nomeLoja);
  const { blobs } = await l.list();
  const chaves = blobs.map((b) => b.key).sort().reverse().slice(0, limite);
  return (await Promise.all(chaves.map((c) => ler(l, c)))).filter(Boolean);
}

/* -------- limites de uso (protecção de custos) -------- */
export async function contarUsoDiario() {
  const l = loja("agente-uso");
  const dia = new Date().toISOString().slice(0, 10);
  const atual = (await ler(l, dia)) || { n: 0 };
  atual.n++;
  await l.setJSON(dia, atual);
  return atual.n;
}

/* -------- WhatsApp: mensagens já processadas e trinco por cliente -------- */
export async function marcarVisto(idMensagem) {
  const r = await loja("agente-wa-vistos").setJSON(idMensagem, { t: Date.now() }, { onlyIfNew: true });
  return r.modified !== false; // false = já tinha sido processada
}
export async function trancar(chave, maxEsperaMs = 90_000) {
  const l = loja("agente-trincos");
  const fim = Date.now() + maxEsperaMs;
  while (Date.now() < fim) {
    const r = await l.setJSON(chave, { t: Date.now() }, { onlyIfNew: true });
    if (r.modified !== false) return () => l.delete(chave);
    const atual = await ler(l, chave);
    if (atual && Date.now() - atual.t > 5 * 60_000) await l.delete(chave); // trinco esquecido
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  return () => {}; // segue mesmo assim, para não perder a mensagem
}

/* -------- armazenamento genérico (blog, newsletter) -------- */
export async function obterItem(nomeLoja, chave) { return ler(loja(nomeLoja), chave); }
export async function gravarItem(nomeLoja, chave, valor) { await loja(nomeLoja).setJSON(chave, valor); }
export async function apagarItem(nomeLoja, chave) { await loja(nomeLoja).delete(chave); }
export async function listarTudo(nomeLoja) {
  const l = loja(nomeLoja);
  const { blobs } = await l.list();
  return (await Promise.all(blobs.map((b) => ler(l, b.key)))).filter(Boolean);
}
