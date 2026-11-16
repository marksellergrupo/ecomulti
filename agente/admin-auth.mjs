/* Autenticação do dashboard administrativo.
   - O utilizador fica guardado (base de dados MySQL, tabela app_dados) com a senha em hash (scrypt + sal); nunca em texto simples.
   - Na primeira utilização cria-se o utilizador inicial (ADMIN_EMAIL / ADMIN_SENHA, se definidos nas variáveis da aplicação Node no cPanel;
     caso contrário, os valores iniciais indicados pela empresa). A senha deve ser alterada no dashboard (Conta).
   - A sessão é um token assinado (HMAC) com validade de 8 horas; mudar a senha invalida todas as sessões. */
import { scrypt, randomBytes, timingSafeEqual, createHmac, createHash } from "node:crypto";
import { promisify } from "node:util";
import { obterItem, gravarItem } from "./armazem.mjs";

const scryptP = promisify(scrypt);
const LOJA = "admin-config";
const DURACAO_MS = 8 * 3600 * 1000;
const b64 = (b) => Buffer.from(b).toString("base64url");

const EMAIL_INICIAL = "ecomulti.ao@gmail.com";
const SENHA_INICIAL = "admin@ecomult";

async function segredo() {
  if (process.env.ADMIN_SEGREDO && process.env.ADMIN_SEGREDO.length >= 16) return process.env.ADMIN_SEGREDO;
  let s = await obterItem(LOJA, "segredo");
  if (!s) { s = { v: randomBytes(32).toString("hex") }; await gravarItem(LOJA, "segredo", s); }
  return s.v;
}

async function hashSenha(senha, sal) {
  const d = await scryptP(String(senha), sal, 64);
  return d.toString("hex");
}
const igual = (a, b) => { const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex"); return x.length === y.length && timingSafeEqual(x, y); };

export async function utilizador() {
  let u = await obterItem(LOJA, "utilizador");
  if (!u) {
    const email = (process.env.ADMIN_EMAIL || EMAIL_INICIAL).trim().toLowerCase();
    const sal = randomBytes(16).toString("hex");
    u = { email, sal, hash: await hashSenha(process.env.ADMIN_SENHA || SENHA_INICIAL, sal), versao: 1, senhaInicial: !process.env.ADMIN_SENHA, criadoEm: new Date().toISOString() };
    await gravarItem(LOJA, "utilizador", u);
  }
  return u;
}

/* devolve o utilizador se o e-mail e a senha estiverem certos; senão null (tempo de resposta semelhante nos dois casos) */
export async function verificarLogin(email, senha) {
  const u = await utilizador();
  const h = await hashSenha(senha, u.sal);
  const okSenha = igual(h, u.hash);
  const okEmail = String(email || "").trim().toLowerCase() === u.email;
  return okSenha && okEmail ? u : null;
}

export async function emitirToken(u) {
  const x = Date.now() + DURACAO_MS;
  const corpo = b64(JSON.stringify({ e: u.email, x, v: u.versao }));
  const sig = createHmac("sha256", await segredo()).update(corpo).digest("base64url");
  return { token: corpo + "." + sig, expira: x };
}

export async function validarToken(token) {
  try {
    const [corpo, sig] = String(token).split(".");
    if (!corpo || !sig) return null;
    const esperado = createHmac("sha256", await segredo()).update(corpo).digest();
    const dada = Buffer.from(sig, "base64url");
    if (dada.length !== esperado.length || !timingSafeEqual(dada, esperado)) return null;
    const p = JSON.parse(Buffer.from(corpo, "base64url").toString());
    if (!p.x || p.x < Date.now()) return null;
    const u = await utilizador();
    if (p.e !== u.email || p.v !== u.versao) return null;
    return { email: u.email, senhaInicial: !!u.senhaInicial };
  } catch { return null; }
}

export async function alterarSenha(nova) {
  const u = await utilizador();
  const sal = randomBytes(16).toString("hex");
  const novo = { ...u, sal, hash: await hashSenha(nova, sal), versao: (u.versao || 1) + 1, senhaInicial: false, senhaAlteradaEm: new Date().toISOString() };
  await gravarItem(LOJA, "utilizador", novo);
  return novo;
}

/* limite de tentativas falhadas por IP: 5 em 15 minutos */
const JANELA_MS = 15 * 60 * 1000, MAX_FALHAS = 5;
const chaveIp = (ip) => "ip-" + createHash("sha256").update(String(ip)).digest("hex").slice(0, 24);
export async function bloqueado(ip) {
  const r = await obterItem("admin-tentativas", chaveIp(ip));
  return !!r && r.n >= MAX_FALHAS && Date.now() - r.desde < JANELA_MS;
}
export async function registarFalha(ip) {
  const k = chaveIp(ip), r = await obterItem("admin-tentativas", k);
  const novo = !r || Date.now() - r.desde >= JANELA_MS ? { n: 1, desde: Date.now() } : { n: r.n + 1, desde: r.desde };
  await gravarItem("admin-tentativas", k, novo);
}
export async function limparFalhas(ip) { await gravarItem("admin-tentativas", chaveIp(ip), { n: 0, desde: Date.now() }); }
