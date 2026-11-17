/* Envio de e-mails (códigos da área do cliente) pelo SMTP de uma conta de e-mail do cPanel.
   Variáveis: SMTP_HOST (ex.: mail.ecomulti.ao), SMTP_PORTA (465), SMTP_UTILIZADOR (ex.: nao-responder@ecomulti.ao),
              SMTP_SENHA e, opcional, SMTP_REMETENTE (ex.: "ECOMULTI <nao-responder@ecomulti.ao>"). */

export const emailConfigurado = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_UTILIZADOR && process.env.SMTP_SENHA);

let transporte = null;
/* só para testes: substitui o envio real (recebe a mensagem) */
let substituto = null;
export function usarTransporteDeTeste(fn) { substituto = fn; }
/* desenvolvimento (npm run local): sem SMTP, os e-mails aparecem na consola em vez de serem enviados */
const consola = () => process.env.EMAIL_CONSOLA === "1" && !emailConfigurado();
export const envioDisponivel = () => Boolean(substituto) || emailConfigurado() || consola();

async function obterTransporte() {
  if (!transporte) {
    const nodemailer = (await import("nodemailer")).default;
    const porta = Number(process.env.SMTP_PORTA || 465);
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: porta, secure: porta === 465,
      auth: { user: process.env.SMTP_UTILIZADOR, pass: process.env.SMTP_SENHA },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000
    });
  }
  return transporte;
}

export async function enviarEmail({ para, assunto, texto, html }) {
  const msg = { from: process.env.SMTP_REMETENTE || `ECOMULTI <${process.env.SMTP_UTILIZADOR}>`, to: para, subject: assunto, text: texto, html };
  if (substituto) return substituto(msg);
  if (consola()) { console.log(`\n[e-mail para ${para}] ${assunto}\n${texto}\n`); return { consola: true }; }
  if (!emailConfigurado()) throw new Error("envio de e-mail não configurado (SMTP_HOST, SMTP_UTILIZADOR, SMTP_SENHA)");
  return (await obterTransporte()).sendMail(msg);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* e-mail com um código de 6 dígitos (confirmar conta / recuperar senha) */
export function emailCodigo({ nome, codigo, motivo }) {
  const titulo = motivo === "recuperar" ? "Recuperar a senha" : "Confirmar o seu e-mail";
  const frase = motivo === "recuperar"
    ? "Recebemos um pedido para definir uma nova senha na sua área de cliente ECOMULTI."
    : "Obrigado por criar a sua conta na área de cliente ECOMULTI.";
  const texto = `Olá${nome ? " " + nome : ""},\n\n${frase}\n\nO seu código é: ${codigo}\n\nO código é válido durante 30 minutos. ` +
    `Se não foi você que fez este pedido, ignore este e-mail.\n\nECOMULTI — www.ecomulti.ao`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#2b3555">
    <h2 style="color:#0a1747">${esc(titulo)}</h2><p>Olá${nome ? " " + esc(nome) : ""},</p><p>${esc(frase)}</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#2a50d8;margin:24px 0">${esc(codigo)}</p>
    <p>O código é válido durante 30 minutos. Se não foi você que fez este pedido, ignore este e-mail.</p>
    <p style="color:#5f6a8a;font-size:13px">ECOMULTI — <a href="https://www.ecomulti.ao">www.ecomulti.ao</a></p></div>`;
  return { assunto: `ECOMULTI — ${titulo}: ${codigo}`, texto, html };
}
