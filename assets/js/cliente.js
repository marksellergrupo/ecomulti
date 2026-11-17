/* =====================================================================
   ECOMULTI — Área do cliente (cliente.html)
   Entrar / criar conta (com confirmação do e-mail por código) / recuperar a senha
   e lista das subscrições com as datas de renovação. Tudo é verificado no servidor (/api/cliente).
   ===================================================================== */
(function () {
  "use strict";
  const CFG = window.ECOMULTI || {};
  const API = (CFG.cliente && CFG.cliente.endpoint) || "/api/cliente";
  const KS = "ecomulti_cliente";
  const app = document.getElementById("cliApp");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dLonga = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-AO", { day: "numeric", month: "long", year: "numeric" }) : "—");

  /* sessão guardada só neste navegador; expira com o token (12 h) */
  let sessao = null;
  try { sessao = JSON.parse(localStorage.getItem(KS) || "null"); } catch {}
  if (sessao && !(sessao.expira > Date.now())) sessao = null;
  const guardarSessao = (r) => { sessao = { token: r.token, expira: r.expira, nome: r.cliente.nome, email: r.cliente.email }; try { localStorage.setItem(KS, JSON.stringify(sessao)); } catch {} };
  const sair = () => { sessao = null; try { localStorage.removeItem(KS); } catch {} ; ver("entrar"); };

  async function chamar(acao, dados = {}) {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json", ...(sessao ? { authorization: "Bearer " + sessao.token } : {}) }, body: JSON.stringify({ acao, ...dados }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && sessao && !["entrar", "confirmar", "redefinir"].includes(acao)) { sair(); throw new Error("A sessão terminou. Entre novamente."); }
    if (!r.ok) throw new Error(j.erro || "Não foi possível ligar ao servidor. Tente novamente.");
    return j;
  }

  /* estado partilhado entre passos (nunca guardado em disco) */
  const passo = { email: "", senha: "", aviso: "" };

  const titulo = (t, s) => { document.getElementById("cliTitulo").textContent = t; document.getElementById("cliSub").textContent = s; };
  const campo = (id, rotulo, tipo, extra = "") => `<div class="field"><label for="${id}">${rotulo}</label><input id="${id}" name="${id}" type="${tipo}" ${extra}></div>`;
  const caixa = (corpo) => `<div class="cli-caixa panel">${corpo}</div>`;
  const msg = (texto, tipo = "err") => texto ? `<p class="cli-msg ${tipo}" role="${tipo === "err" ? "alert" : "status"}">${esc(texto)}</p>` : "";

  const VISTAS = {
    entrar() {
      titulo("Área do cliente", "Veja os seus domínios, hospedagem e e-mail, e quando renovam.");
      return caixa(`<h2>Entrar</h2>${msg(passo.aviso, "ok")}
        <form data-f="entrar" novalidate>
          ${campo("email", "E-mail", "email", `autocomplete="email" required value="${esc(passo.email)}"`)}
          ${campo("senha", "Senha", "password", 'autocomplete="current-password" required')}
          <p class="cli-msg err" data-erro hidden></p>
          <button class="btn btn-primary btn-block" type="submit">Entrar</button>
        </form>
        <div class="cli-links"><a href="#" data-ir="recuperar">Esqueci-me da senha</a><span>Ainda não tem conta? <a href="#" data-ir="registar">Criar conta</a></span></div>`);
    },
    registar() {
      titulo("Criar conta", "Use o mesmo e-mail com que fez as suas compras na ECOMULTI.");
      return caixa(`<h2>Criar conta</h2>
        <form data-f="registar" novalidate>
          ${campo("nome", "Nome", "text", 'autocomplete="name" required maxlength="120"')}
          ${campo("email", "E-mail", "email", `autocomplete="email" required value="${esc(passo.email)}"`)}
          ${campo("senha", "Senha (mínimo 8 caracteres)", "password", 'autocomplete="new-password" required minlength="8"')}
          ${campo("senha2", "Repetir a senha", "password", 'autocomplete="new-password" required minlength="8"')}
          <p class="cli-msg err" data-erro hidden></p>
          <button class="btn btn-primary btn-block" type="submit">Criar conta</button>
        </form>
        <p class="cli-nota">Vamos enviar um código de 6 dígitos para confirmar o seu e-mail.</p>
        <div class="cli-links"><span>Já tem conta? <a href="#" data-ir="entrar">Entrar</a></span></div>`);
    },
    confirmar() {
      titulo("Confirmar e-mail", "Falta só confirmar que o e-mail é seu.");
      return caixa(`<h2>Confirmar e-mail</h2>${msg(passo.aviso || `Enviámos um código de 6 dígitos para ${passo.email}. Veja também a pasta de spam.`, "ok")}
        <form data-f="confirmar" novalidate>
          ${campo("codigo", "Código de 6 dígitos", "text", 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" required class="cli-codigo"')}
          ${passo.senha ? "" : campo("senha", "A senha que escolheu ao criar a conta", "password", 'autocomplete="current-password" required')}
          <p class="cli-msg err" data-erro hidden></p>
          <button class="btn btn-primary btn-block" type="submit">Confirmar</button>
        </form>
        <div class="cli-links"><a href="#" data-acao="reenviar-confirmar">Enviar novo código</a><a href="#" data-ir="entrar">Voltar</a></div>`);
    },
    recuperar() {
      titulo("Recuperar a senha", "Enviamos um código para o seu e-mail.");
      return caixa(`<h2>Recuperar a senha</h2>
        <form data-f="recuperar" novalidate>
          ${campo("email", "E-mail da conta", "email", `autocomplete="email" required value="${esc(passo.email)}"`)}
          <p class="cli-msg err" data-erro hidden></p>
          <button class="btn btn-primary btn-block" type="submit">Enviar código</button>
        </form>
        <div class="cli-links"><a href="#" data-ir="entrar">Voltar</a></div>`);
    },
    redefinir() {
      titulo("Nova senha", "Indique o código que recebeu e a nova senha.");
      return caixa(`<h2>Nova senha</h2>${msg(passo.aviso, "ok")}
        <form data-f="redefinir" novalidate>
          ${campo("codigo", "Código de 6 dígitos", "text", 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" required class="cli-codigo"')}
          ${campo("senha", "Nova senha (mínimo 8 caracteres)", "password", 'autocomplete="new-password" required minlength="8"')}
          ${campo("senha2", "Repetir a nova senha", "password", 'autocomplete="new-password" required minlength="8"')}
          <p class="cli-msg err" data-erro hidden></p>
          <button class="btn btn-primary btn-block" type="submit">Guardar nova senha</button>
        </form>
        <div class="cli-links"><a href="#" data-acao="reenviar-recuperar">Enviar novo código</a><a href="#" data-ir="entrar">Voltar</a></div>`);
    },
    painel() {
      titulo(`Olá, ${sessao.nome.split(" ")[0]}`, "As suas subscrições e datas de renovação.");
      return `<div class="cli-topo"><span class="cli-quem"><svg class="icon"><use href="#i-people"/></svg> ${esc(sessao.email)}</span><button class="btn btn-outline btn-sm" type="button" data-acao="sair">Terminar sessão</button></div>
        <div id="cliSubs"><p class="cli-carregar">A carregar as suas subscrições…</p></div>`;
    }
  };

  const SITUACAO = {
    activa: ["ok", "Activa"], a_expirar: ["aviso", "Renova em breve"], expirada: ["err", "Expirada"], unico: ["neutro", "Pagamento único"]
  };
  const ICONE = (s) => /dom\S{0,2}nio/i.test(s) ? "globe" : /hosped|aloj|servidor|vps/i.test(s) ? "server" : /e-?mail/i.test(s) ? "mail" : "code";

  async function carregarSubs() {
    const alvo = document.getElementById("cliSubs");
    try {
      const { subscricoes } = await chamar("subscricoes");
      if (!subscricoes.length) {
        alvo.innerHTML = `<div class="panel cli-vazio"><span class="ico"><svg class="icon"><use href="#i-file"/></svg></span>
          <h2>Ainda não há subscrições nesta conta</h2>
          <p>Os serviços aparecem aqui depois de o pagamento ser confirmado, desde que a compra tenha sido feita com o e-mail <strong>${esc(sessao.email)}</strong>.</p>
          <p>Fez a compra com outro e-mail? <a href="#" data-wa="Olá ECOMULTI! Tenho conta na área de cliente com o e-mail ${esc(sessao.email)}, mas não vejo os meus serviços.">Fale connosco</a> e associamos os serviços à sua conta.</p></div>`;
      } else {
        const atencao = subscricoes.filter((s) => s.situacao === "a_expirar" || s.situacao === "expirada");
        alvo.innerHTML = (atencao.length ? `<div class="notice cli-alerta"><svg class="icon"><use href="#i-clock"/></svg><span><strong>${atencao.length === 1 ? "1 serviço precisa" : atencao.length + " serviços precisam"} de renovação.</strong> Fale connosco para renovar sem interrupções.</span></div>` : "") +
          `<ul class="cli-subs">${subscricoes.map((s) => {
            const [cls, rot] = SITUACAO[s.situacao] || ["neutro", s.situacao];
            const quando = s.situacao === "unico" ? `Pago em ${dLonga(s.inicio)}`
              : s.situacao === "expirada" ? `Expirou em ${dLonga(s.renovacao)}`
              : `Renova em ${dLonga(s.renovacao)}${s.dias != null && s.dias <= 60 ? ` · faltam ${s.dias} ${s.dias === 1 ? "dia" : "dias"}` : ""}`;
            return `<li class="cli-sub ${cls}"><span class="ico"><svg class="icon"><use href="#i-${ICONE(s.servico)}"/></svg></span>
              <div class="cli-sub-info"><h3>${esc(s.servico)}</h3>${s.dominio ? `<p class="cli-dom">${esc(s.dominio)}</p>` : ""}<p class="cli-quando">${quando}</p></div>
              <span class="cli-badge ${cls}">${rot}</span></li>`;
          }).join("")}</ul>
          <p class="cli-nota">Algum dado não está certo, ou quer renovar? <a href="#" data-wa="Olá ECOMULTI! Sou cliente (${esc(sessao.email)}) e tenho uma questão sobre as minhas subscrições.">Fale connosco no WhatsApp</a>.</p>`;
      }
      if (window.EcoApp && EcoApp.linkWhatsApp) alvo.querySelectorAll("a[data-wa]").forEach((a) => { a.href = EcoApp.linkWhatsApp(a.dataset.wa); a.target = "_blank"; a.rel = "noopener"; });
    } catch (e) {
      if (sessao) alvo.innerHTML = `<div class="panel">${msg(e.message)}<button class="btn btn-outline btn-sm" type="button" data-acao="recarregar">Tentar de novo</button></div>`;
    }
  }

  function ver(nome) {
    if (nome === "painel" && !sessao) nome = "entrar";
    app.innerHTML = VISTAS[nome]();
    if (nome === "painel") carregarSubs();
    const p = app.querySelector("input:not([value]), input[value='']") || app.querySelector("input");
    if (p) p.focus({ preventScroll: true });
    passo.aviso = "";
  }

  /* formulários */
  const ACCOES = {
    async entrar(f) {
      passo.email = f.email.value.trim();
      const r = await chamar("entrar", { email: passo.email, senha: f.senha.value });
      if (r.confirmar) { passo.senha = f.senha.value; passo.aviso = r.mensagem; return ver("confirmar"); }
      guardarSessao(r); ver("painel");
    },
    async registar(f) {
      if (f.senha.value !== f.senha2.value) throw new Error("As senhas não são iguais.");
      if (f.senha.value.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
      passo.email = f.email.value.trim();
      await chamar("registar", { nome: f.nome.value, email: passo.email, senha: f.senha.value });
      passo.senha = f.senha.value; ver("confirmar");
    },
    async confirmar(f) {
      const r = await chamar("confirmar", { email: passo.email, codigo: f.codigo.value, senha: passo.senha || f.senha.value });
      passo.senha = ""; guardarSessao(r); ver("painel");
    },
    async recuperar(f) {
      passo.email = f.email.value.trim();
      const r = await chamar("recuperar", { email: passo.email });
      passo.aviso = r.mensagem; ver("redefinir");
    },
    async redefinir(f) {
      if (f.senha.value !== f.senha2.value) throw new Error("As senhas não são iguais.");
      const r = await chamar("redefinir", { email: passo.email, codigo: f.codigo.value, senha: f.senha.value });
      guardarSessao(r); ver("painel");
    }
  };

  app.addEventListener("submit", async (e) => {
    const f = e.target.closest("form[data-f]"); if (!f) return;
    e.preventDefault();
    const b = f.querySelector("[type=submit]"), er = f.querySelector("[data-erro]");
    er.hidden = true; b.disabled = true;
    try { await ACCOES[f.dataset.f](f); }
    catch (x) { er.textContent = x.message; er.hidden = false; }
    finally { if (b.isConnected) b.disabled = false; }
  });

  app.addEventListener("click", async (e) => {
    const ir = e.target.closest("[data-ir]"), ac = e.target.closest("[data-acao]");
    if (ir) { e.preventDefault(); const em = app.querySelector("#email"); if (em) passo.email = em.value.trim(); return ver(ir.dataset.ir); }
    if (!ac) return;
    e.preventDefault();
    const a = ac.dataset.acao;
    if (a === "sair") return sair();
    if (a === "recarregar") return ver("painel");
    if (a === "reenviar-confirmar" || a === "reenviar-recuperar") {
      try {
        const r = await chamar(a === "reenviar-confirmar" ? "reenviar" : "recuperar", { email: passo.email, motivo: a === "reenviar-confirmar" ? "confirmar" : "recuperar" });
        passo.aviso = r.mensagem + " (pode demorar 1 minuto.)"; ver(a === "reenviar-confirmar" ? "confirmar" : "redefinir");
      } catch (x) { alert(x.message); }
    }
  });

  ver(sessao ? "painel" : "entrar");
})();
