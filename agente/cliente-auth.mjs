/* Contas da área do cliente (separadas da conta do painel admin).
   - Senha em hash (scrypt + sal), nunca em texto simples.
   - E-mail confirmado por código de 6 dígitos (válido 30 min, máx. 5 tentativas); o código só é guardado em hash.
   - Sessão: token assinado (HMAC) válido 12 h; mudar a senha invalida as sessões antigas.
   - As respostas nunca revelam se um e-mail já tem conta. */
import { scrypt, randomBytes, randomInt, timingSafeEqual, createHmac, createHash } from "node:crypto";
import { promisify } from "node:util";
import { obterItem, gravarItem, apagarItem } from "./armazem.mjs";
import { enviarEmail, emailCodigo } from "./email.mjs";

const scryptP = promisify(scrypt);
const CONTAS = "cliente-contas", CODIGOS = "cliente-codigos", TENTATIVAS = "cliente-tentativas";
const SESSAO_MS = 12 * 3600 * 1000, CODIGO_MS = 30 * 60 * 1000, MAX_TENTATIVAS_CODIGO = 5, REENVIO_MS = 60 * 1000;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const b64 = (b) => Buffer.from(b).toString("base64url");
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");

export class ErroCliente extends Error { constructor(m, estado = 400) { super(m); this.estado = estado; } }
const erro = (m, e) => new ErroCliente(m, e);

export const normalizarEmail = (e) => String(e || "").trim().toLowerCase().slice(0, 254);
function validarSenha(s) {
  s = String(s || "");
  if (s.length < 8) throw erro("A senha deve ter pelo menos 8 caracteres.");
  if (s.length > 200) throw erro("Senha demasiado longa.");
  return s;
}

async function segredo() {
  if (process.env.CLIENTE_SEGREDO && process.env.CLIENTE_SEGREDO.length >= 16) return process.env.CLIENTE_SEGREDO;
  let s = await obterItem("cliente-config", "segredo");
  if (!s) { s = { v: randomBytes(32).toString("hex") }; await gravarItem("cliente-config", "segredo", s); }
  return s.v;
}
const hashSenha = async (senha, sal) => (await scryptP(String(senha), sal, 64)).toString("hex");
const igualHex = (a, b) => { const x = Buffer.from(String(a), "hex"), y = Buffer.from(String(b), "hex"); return x.length === y.length && x.length > 0 && timingSafeEqual(x, y); };

/* ---------- limites por IP (registo, entrada, códigos) ---------- */
export async function limitar(ip, acao, max, janelaMs) {
  const k = acao + "-" + sha(ip).slice(0, 24), r = await obterItem(TENTATIVAS, k);
  const atual = !r || Date.now() - r.desde >= janelaMs ? { n: 0, desde: Date.now() } : r;
  if (atual.n >= max) throw erro("Demasiadas tentativas. Aguarde alguns minutos e tente novamente.", 429);
  atual.n++;
  await gravarItem(TENTATIVAS, k, atual);
}

/* ---------- códigos de 6 dígitos ---------- */
async function enviarCodigo(conta, motivo) {
  const chave = motivo + ":" + conta.email, antigo = await obterItem(CODIGOS, chave);
  if (antigo && Date.now() - antigo.enviadoEm < REENVIO_MS) return;          // evita enviar vários seguidos
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await gravarItem(CODIGOS, chave, { hash: sha((await segredo()) + chave + codigo), expira: Date.now() + CODIGO_MS, tentativas: 0, enviadoEm: Date.now() });
  const m = emailCodigo({ nome: conta.nome, codigo, motivo });
  await enviarEmail({ para: conta.email, assunto: m.assunto, texto: m.texto, html: m.html });
}
async function verificarCodigo(email, motivo, codigo) {
  const chave = motivo + ":" + email, c = await obterItem(CODIGOS, chave);
  const invalido = () => erro("Código inválido ou expirado. Peça um novo código.");
  if (!c || Date.now() > c.expira || c.tentativas >= MAX_TENTATIVAS_CODIGO) throw invalido();
  const dado = String(codigo || "").replace(/\D/g, "");
  if (dado.length !== 6 || sha((await segredo()) + chave + dado) !== c.hash) {
    c.tentativas++; await gravarItem(CODIGOS, chave, c);
    throw invalido();
  }
  await apagarItem(CODIGOS, chave);
}

/* ---------- sessão ---------- */
async function emitirToken(conta) {
  const corpo = b64(JSON.stringify({ e: conta.email, x: Date.now() + SESSAO_MS, v: conta.versao }));
  return { token: corpo + "." + createHmac("sha256", await segredo()).update(corpo).digest("base64url"), expira: Date.now() + SESSAO_MS };
}
export async function validarSessao(token) {
  try {
    const [corpo, sig] = String(token || "").split(".");
    if (!corpo || !sig) return null;
    const esperado = createHmac("sha256", await segredo()).update(corpo).digest(), dada = Buffer.from(sig, "base64url");
    if (dada.length !== esperado.length || !timingSafeEqual(dada, esperado)) return null;
    const p = JSON.parse(Buffer.from(corpo, "base64url").toString());
    if (!p.x || p.x < Date.now()) return null;
    const c = await obterItem(CONTAS, p.e);
    if (!c || !c.verificado || c.versao !== p.v) return null;
    return c;
  } catch { return null; }
}
const publico = (c) => ({ email: c.email, nome: c.nome });

/* ---------- acções ---------- */
const RESPOSTA_CODIGO = { ok: true, mensagem: "Se os dados estiverem correctos, enviámos um código de 6 dígitos para o seu e-mail." };

export async function registar({ nome, email, senha }, ip) {
  await limitar(ip, "registo", 10, 3600 * 1000);
  email = normalizarEmail(email); nome = String(nome || "").trim().slice(0, 120);
  if (nome.length < 2) throw erro("Indique o seu nome.");
  if (!EMAIL_RE.test(email)) throw erro("Indique um e-mail válido.");
  senha = validarSenha(senha);
  const existente = await obterItem(CONTAS, email);
  if (existente?.verificado) {
    // já tem conta: não revela nada a quem está a registar; avisa o dono por e-mail
    await enviarEmail({ para: email, assunto: "ECOMULTI — Já tem conta na área de cliente",
      texto: `Olá,\n\nAlguém tentou criar uma conta na área de cliente ECOMULTI com este e-mail, mas ele já tem conta.\nSe foi você e não se lembra da senha, use "Esqueci-me da senha" em https://www.ecomulti.ao/cliente.html\n\nECOMULTI` }).catch(() => {});
    return RESPOSTA_CODIGO;
  }
  const sal = randomBytes(16).toString("hex");
  const conta = { email, nome, sal, hash: await hashSenha(senha, sal), versao: 1, verificado: false, criadoEm: existente?.criadoEm || new Date().toISOString() };
  await gravarItem(CONTAS, email, conta);
  await enviarCodigo(conta, "confirmar");
  return RESPOSTA_CODIGO;
}

/* Confirmar exige o código (prova que tem o e-mail) E a senha escolhida no registo:
   assim ninguém activa uma conta com o e-mail de outra pessoa e uma senha que só ele conhece. */
export async function confirmar({ email, codigo, senha }, ip) {
  await limitar(ip, "codigo", 20, 15 * 60 * 1000);
  email = normalizarEmail(email);
  const conta = await obterItem(CONTAS, email);
  const invalido = () => erro("Código ou senha inválidos. Confirme a senha que escolheu ao criar a conta ou peça um novo código.");
  if (!conta || conta.verificado) throw invalido();
  if (!igualHex(await hashSenha(String(senha || ""), conta.sal), conta.hash)) throw invalido();
  await verificarCodigo(email, "confirmar", codigo);
  conta.verificado = true; conta.verificadoEm = new Date().toISOString();
  await gravarItem(CONTAS, email, conta);
  return { ok: true, cliente: publico(conta), ...(await emitirToken(conta)) };
}

export async function reenviar({ email, motivo }, ip) {
  await limitar(ip, "reenvio", 10, 3600 * 1000);
  email = normalizarEmail(email);
  const conta = await obterItem(CONTAS, email);
  if (motivo === "recuperar") { if (conta?.verificado) await enviarCodigo(conta, "recuperar"); }
  else if (conta && !conta.verificado) await enviarCodigo(conta, "confirmar");
  return RESPOSTA_CODIGO;
}

export async function entrar({ email, senha }, ip) {
  await limitar(ip, "entrar", 10, 15 * 60 * 1000);
  email = normalizarEmail(email);
  const conta = await obterItem(CONTAS, email);
  const h = await hashSenha(String(senha || ""), conta?.sal || "sal-ficticio-para-tempo-igual");
  if (!conta || !igualHex(h, conta.hash)) throw erro("E-mail ou senha incorrectos.", 401);
  if (!conta.verificado) {
    await enviarCodigo(conta, "confirmar").catch(() => {});
    return { ok: false, confirmar: true, mensagem: "Confirme primeiro o seu e-mail: enviámos um código de 6 dígitos." };
  }
  return { ok: true, cliente: publico(conta), ...(await emitirToken(conta)) };
}

export async function recuperar({ email }, ip) {
  return reenviar({ email, motivo: "recuperar" }, ip);
}

export async function redefinir({ email, codigo, senha }, ip) {
  await limitar(ip, "codigo", 20, 15 * 60 * 1000);
  email = normalizarEmail(email);
  senha = validarSenha(senha);
  const conta = await obterItem(CONTAS, email);
  if (!conta?.verificado) throw erro("Código inválido ou expirado. Peça um novo código.");
  await verificarCodigo(email, "recuperar", codigo);
  const sal = randomBytes(16).toString("hex");
  Object.assign(conta, { sal, hash: await hashSenha(senha, sal), versao: (conta.versao || 1) + 1, senhaAlteradaEm: new Date().toISOString() });
  await gravarItem(CONTAS, email, conta);
  return { ok: true, cliente: publico(conta), ...(await emitirToken(conta)) };
}

export { publico as dadosPublicos };
