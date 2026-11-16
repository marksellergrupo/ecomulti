/* Armazenamento: conversas, pedidos, avisos, vendas, clientes, blog, newsletter…
   Em produção fica na base MySQL da AngoWeb, numa só tabela (app_dados: loja + chave → JSON),
   criada automaticamente na primeira utilização.
   Variáveis: DB_NOME, DB_UTILIZADOR, DB_SENHA, DB_HOST (localhost), DB_PORTA (3306).
   Sem DB_NOME (testes locais) usa memória. */
import { estadoNovo } from "./nucleo.mjs";
import { gravarPedidoBD, pedidoDoAgente } from "./bd.mjs";

/* ---------------- memória (testes e desenvolvimento) ---------------- */
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

/* ---------------- MySQL ---------------- */
export const mysqlConfigurado = () => Boolean(process.env.DB_NOME);
let piscina = null, tabelaPronta = null;

async function bd() {
  if (!piscina) {
    const mysql = (await import("mysql2/promise")).default;
    piscina = mysql.createPool({
      host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORTA || 3306),
      database: process.env.DB_NOME, user: process.env.DB_UTILIZADOR, password: process.env.DB_SENHA,
      charset: "utf8mb4", connectionLimit: 5, waitForConnections: true
    });
  }
  if (!tabelaPronta) {
    tabelaPronta = piscina.query(`CREATE TABLE IF NOT EXISTS app_dados (
      loja VARCHAR(64) NOT NULL, chave VARCHAR(191) NOT NULL, valor LONGTEXT NOT NULL,
      actualizado TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (loja, chave)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
      .catch((e) => { tabelaPronta = null; throw e; });
  }
  await tabelaPronta;
  return piscina;
}
/* consulta directa (ex.: tabela regras_preco para o catálogo de preços) */
export async function consultaSQL(sql, params = []) { const [l] = await (await bd()).query(sql, params); return l; }
export async function fecharBD() { if (piscina) { await piscina.end(); piscina = null; tabelaPronta = null; } }

const semComodins = (s) => String(s).replace(/[\\%_]/g, (c) => "\\" + c);
function lojaMysql(nome) {
  return {
    async get(c) {
      const [l] = await (await bd()).query("SELECT valor FROM app_dados WHERE loja = ? AND chave = ?", [nome, String(c)]);
      return l.length ? JSON.parse(l[0].valor) : null;
    },
    async setJSON(c, v, o = {}) {
      const p = await bd(), j = JSON.stringify(v);
      if (o.onlyIfNew) {
        const [r] = await p.query("INSERT IGNORE INTO app_dados (loja, chave, valor) VALUES (?, ?, ?)", [nome, String(c), j]);
        return { modified: r.affectedRows === 1 };
      }
      await p.query("INSERT INTO app_dados (loja, chave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [nome, String(c), j]);
      return { modified: true };
    },
    async delete(c) { await (await bd()).query("DELETE FROM app_dados WHERE loja = ? AND chave = ?", [nome, String(c)]); },
    async list({ prefix = "" } = {}) {
      const [l] = await (await bd()).query("SELECT chave FROM app_dados WHERE loja = ? AND chave LIKE ? ORDER BY chave", [nome, semComodins(prefix) + "%"]);
      return { blobs: l.map((x) => ({ key: x.chave })) };
    }
  };
}

function loja(nome) { return mysqlConfigurado() ? lojaMysql(nome) : lojaMemoria(nome); }
const ler = (l, c) => l.get(c);

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
  await gravarPedidoBD(pedidoDoAgente(p));   // cópia nas tabelas encomendas/clientes (se BD_URL estiver definido); nunca falha
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

/* -------- armazenamento genérico (vendas, clientes, blog, newsletter) -------- */
export async function obterItem(nomeLoja, chave) { return ler(loja(nomeLoja), chave); }
export async function gravarItem(nomeLoja, chave, valor) { await loja(nomeLoja).setJSON(chave, valor); }
export async function apagarItem(nomeLoja, chave) { await loja(nomeLoja).delete(chave); }
export async function listarTudo(nomeLoja) {
  const l = loja(nomeLoja);
  const { blobs } = await l.list();
  return (await Promise.all(blobs.map((b) => ler(l, b.key)))).filter(Boolean);
}

/* -------- limpeza (registos técnicos antigos) -------- */
export async function limparAntigos(nomeLoja, maxIdadeMs, campoData) {
  const l = loja(nomeLoja);
  const { blobs } = await l.list();
  let apagados = 0;
  for (const { key } of blobs) {
    const v = await ler(l, key).catch(() => null);
    const t = v ? Number(v[campoData] || 0) : 0;
    if (Date.now() - t > maxIdadeMs) { await l.delete(key); apagados++; }
  }
  return apagados;
}
