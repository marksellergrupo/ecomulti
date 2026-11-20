/* =====================================================================
   ECOMULTI — lógica partilhada por todas as páginas
   ===================================================================== */
(function () {
  "use strict";

  const CFG = window.ECOMULTI || { empresa: {}, precos: {}, fiscal: {} };
  const EMP = CFG.empresa;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------------------------------------------------------------
     PREÇOS
     Usa api/catalogo.php (window.precoDe) quando existe no servidor;
     senão usa a tabela de config.js. Valores absurdos (ex.: 10 Kz)
     vindos da API são ignorados para não mostrar preços errados.
     --------------------------------------------------------------- */
  function preco(chave) {
    const local = CFG.precos[chave];
    if (typeof window.precoDe === "function") {
      try {
        const remoto = Number(window.precoDe(chave));
        const ehPct = chave.startsWith("regra.") && chave !== "regra.pagina_extra";
        if (Number.isFinite(remoto) && (ehPct || remoto >= 100)) return remoto;
      } catch (e) { /* chave não existe na API */ }
    }
    return local;
  }
  const kz = (v) => new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 0 }).format(Math.round(v || 0)).replace(/\s/g, ".") + " Kz";

  // <span data-price="hospedagem.starter"></span>
  // <span data-price="dominio.net,dominio.com" data-tpl="desde {}"></span>  → mostra o menor
  // <span data-price="regra.desconto_2anos" data-pct></span>
  function preencherPrecos(root = document) {
    $$("[data-price]", root).forEach((el) => {
      const chaves = el.dataset.price.split(",").map((s) => s.trim());
      const valores = chaves.map(preco).filter((v) => v != null);
      if (!valores.length) return;
      const v = Math.min(...valores);
      const txt = "pct" in el.dataset ? v + "%" : kz(v);
      el.textContent = (el.dataset.tpl || "{}").replace("{}", txt);
    });
  }

  /* ---------------------------------------------------------------
     ORÇAMENTO (carrinho) — guardado no navegador
     --------------------------------------------------------------- */
  const CHAVE = "ecomulti_orcamento";
  const Orcamento = {
    ler() {
      try { return JSON.parse(localStorage.getItem(CHAVE) || "[]"); } catch { return []; }
    },
    gravar(lista) {
      try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch {}
      actualizarContador();
    },
    adicionar(item) {
      const lista = this.ler();
      const assin = (i) => JSON.stringify([i.servico, i.plano, i.detalhes]);
      // serviços exclusivos (ex.: só um plano de hospedagem por domínio) substituem o anterior
      const semDup = lista.filter((i) => assin(i) !== assin(item) && !(item.substitui && i.substitui === item.substitui));
      item.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      semDup.push(item);
      this.gravar(semDup);
      return item;
    },
    remover(id) { this.gravar(this.ler().filter((i) => i.id !== id)); },
    limpar() { this.gravar([]); },
    total() { return this.ler().reduce((s, i) => s + (Number(i.total) || 0), 0); }
  };
  function actualizarContador() {
    const n = Orcamento.ler().length;
    $$(".cart-count").forEach((el) => { el.textContent = n || ""; el.dataset.n = n; });
  }

  /* ---------------------------------------------------------------
     ENVIO DE PEDIDOS (WhatsApp ou e-mail)
     --------------------------------------------------------------- */
  function linkWhatsApp(texto) {
    return "https://wa.me/" + EMP.whatsapp + (texto ? "?text=" + encodeURIComponent(texto) : "");
  }
  function linkEmail(assunto, texto) {
    return "mailto:" + EMP.email + "?subject=" + encodeURIComponent(assunto || "Pedido pelo site") + "&body=" + encodeURIComponent(texto || "");
  }
  /* Envia a mensagem directamente para a caixa da ECOMULTI (servidor → SMTP).
     Devolve true se foi enviada; false se o servidor não a pôde enviar. */
  async function enviarPorEmail({ assunto, texto, nome, contacto }) {
    const url = (CFG.contacto || {}).endpoint;
    if (!url) return false;
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ assunto, texto, nome, contacto, pagina: location.pathname.split("/").pop() || "index.html" })
      });
      return r.ok;
    } catch { return false; }
  }
  /* canal "email": envia pelo servidor; só se falhar abre o programa de e-mail (mailto) como alternativa.
     Devolve uma promessa: "enviado" | "aberto" (WhatsApp ou programa de e-mail aberto). */
  async function enviar(canal, texto, assunto, remetente = {}) {
    if (canal === "email" || !EMP.whatsapp) {
      if (await enviarPorEmail({ assunto, texto, ...remetente })) return "enviado";
      window.location.href = linkEmail(assunto, texto);
      return "aberto";
    } else {
      const w = window.open(linkWhatsApp(texto), "_blank", "noopener");
      if (!w) window.location.href = linkWhatsApp(texto);
      return "aberto";
    }
  }

  /* ---------------------------------------------------------------
     TOAST
     --------------------------------------------------------------- */
  let toastEl, toastT;
  function toast(msg, link) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      document.body.append(toastEl);
    }
    toastEl.innerHTML = '<svg class="icon"><use href="#i-check"/></svg><span></span>';
    toastEl.querySelector("span").textContent = msg;
    if (link) {
      const a = document.createElement("a");
      a.href = link.href; a.textContent = link.text;
      toastEl.append(a);
    }
    toastEl.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("on"), 3800);
  }

  /* ---------------------------------------------------------------
     DADOS DA EMPRESA no HTML
     data-cfg="email|whatsapp|telefone|morada|nif|horario"
     --------------------------------------------------------------- */
  function preencherEmpresa() {
    $$("[data-cfg]").forEach((el) => {
      const k = el.dataset.cfg;
      const v = { email: EMP.email, telefone: EMP.telefoneVisivel, morada: EMP.morada, nif: EMP.nif, horario: EMP.horario }[k];
      const alvo = el.closest("[data-cfg-wrap]") || el;
      if (!v) { alvo.hidden = true; return; }
      el.textContent = (k === "nif" ? "NIF " : "") + v;
    });
    $$("a[data-wa]").forEach((a) => { a.href = linkWhatsApp(a.dataset.wa || ""); a.target = "_blank"; a.rel = "noopener"; });
    $$("a[data-mail]").forEach((a) => { a.href = "mailto:" + EMP.email; });
    const redes = $(".socials");
    if (redes) {
      const r = EMP.redes || {};
      let html = "";
      ["facebook", "instagram", "linkedin"].forEach((n) => {
        if (r[n]) html += `<a href="${r[n]}" target="_blank" rel="noopener" aria-label="${n}"><svg class="icon"><use href="#i-${n}"/></svg></a>`;
      });
      redes.innerHTML = html;
      redes.hidden = !html;
    }
    $$("[data-ano]").forEach((el) => (el.textContent = new Date().getFullYear()));
  }

  /* ---------------------------------------------------------------
     INTERFACE GERAL
     --------------------------------------------------------------- */
  function iniciarInterface() {
    // menu móvel
    const toggle = $("#menuToggle"), menu = $("#menu");
    if (toggle && menu) {
      const fechar = () => {
        menu.classList.remove("open"); document.body.classList.remove("menu-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.innerHTML = '<svg class="icon"><use href="#i-menu"/></svg>';
      };
      toggle.addEventListener("click", () => {
        const aberto = menu.classList.toggle("open");
        document.body.classList.toggle("menu-open", aberto);
        toggle.setAttribute("aria-expanded", String(aberto));
        toggle.innerHTML = `<svg class="icon"><use href="#i-${aberto ? "x" : "menu"}"/></svg>`;
      });
      $$("a", menu).forEach((a) => a.addEventListener("click", fechar));
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
      window.addEventListener("resize", () => { if (innerWidth > 960) fechar(); });
    }

    // sombra do topo + botão voltar ao topo
    const topbar = $(".topbar"), toTop = $("#toTop");
    const onScroll = () => {
      if (topbar) topbar.classList.toggle("scrolled", scrollY > 8);
      if (toTop) toTop.classList.toggle("show", scrollY > 700);
    };
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
    if (toTop) toTop.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));

    // animações ao rolar
    const alvos = $$(".section-head, .svc-card, .plan, .step, .value, .mv-card, .faq, .trust-grid, .panel, .ext-card, .brand-panel, .feature-list li, .wizard, .guide");
    if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const io = new IntersectionObserver((ents) => ents.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target); en.target.classList.add("in");
      }), { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });
      const cont = new Map();
      alvos.forEach((el) => {
        const n = cont.get(el.parentElement) || 0; cont.set(el.parentElement, n + 1);
        el.style.setProperty("--d", Math.min(n, 4) * 0.07 + "s");
        el.classList.add("reveal"); io.observe(el);
      });
    }

    // FAQ: abrir uma de cada vez dentro do mesmo grupo
    $$(".faq-list").forEach((g) => g.addEventListener("toggle", (e) => {
      if (e.target.open) $$("details", g).forEach((d) => { if (d !== e.target) d.open = false; });
    }, true));

    // barra inferior (telemóvel) das calculadoras
    const bar = $(".mobile-bar"), calc = $("[data-calc]"), resumo = $(".summary");
    if (bar && calc && "IntersectionObserver" in window) {
      let calcVis = false, resVis = false;
      const upd = () => {
        const show = calcVis && !resVis;
        bar.classList.toggle("show", show);
        document.body.classList.toggle("has-bar", show);
      };
      new IntersectionObserver(([e]) => { calcVis = e.isIntersecting; upd(); }, { threshold: 0.05 }).observe(calc);
      if (resumo) new IntersectionObserver(([e]) => { resVis = e.isIntersecting; upd(); }, { threshold: 0.35 }).observe(resumo);
    }
  }

  /* ---------------------------------------------------------------
     FORMULÁRIOS DE CONTACTO  <form data-contact="Assunto">
     Campos: nome, contacto, servico, mensagem, consentimento
     Botões: type=submit (WhatsApp) e [data-send="email"]
     --------------------------------------------------------------- */
  function iniciarFormularios() {
    $$("form[data-contact]").forEach((form) => {
      const msg = $(".form-msg", form);
      let canal = "whatsapp";
      $$("[data-send]", form).forEach((b) => b.addEventListener("click", () => { canal = b.dataset.send; }));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const nome = (f.get("nome") || "").toString().trim();
        const contacto = (f.get("contacto") || "").toString().trim();
        const erros = [];
        $$(".invalid", form).forEach((el) => el.classList.remove("invalid"));
        if (nome.length < 2) { erros.push("nome"); form.elements.nome.classList.add("invalid"); }
        const contactoOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto) || contacto.replace(/\D/g, "").length >= 9;
        if (!contactoOk) { erros.push("contacto"); form.elements.contacto.classList.add("invalid"); }
        if (form.elements.consentimento && !form.elements.consentimento.checked) erros.push("consentimento");
        if (erros.length) {
          msg.className = "form-msg err";
          msg.textContent = erros.includes("consentimento") && erros.length === 1
            ? "Confirme que aceita a política de privacidade para podermos responder."
            : "Indique o seu nome e um e-mail ou telefone válido.";
          const primeiro = $(".invalid", form); if (primeiro) primeiro.focus();
          canal = "whatsapp";
          return;
        }
        const servico = (f.get("servico") || "").toString();
        const texto =
          `Olá ECOMULTI! Sou ${nome}.\n` +
          (servico ? `Serviço de interesse: ${servico}\n` : "") +
          `Contacto: ${contacto}\n` +
          (f.get("mensagem") ? `\n${f.get("mensagem")}` : "") +
          `\n\n(Enviado a partir de ${location.pathname.split("/").pop() || "index.html"})`;
        const assunto = `${form.dataset.contact || "Pedido de contacto"}${servico ? " - " + servico : ""}`;
        const usado = canal;
        canal = "whatsapp";
        if (usado !== "email" && EMP.whatsapp) {
          enviar(usado, texto, assunto);
          msg.className = "form-msg ok";
          msg.textContent = "A abrir o WhatsApp com a mensagem preenchida. Só falta carregar em Enviar.";
          return;
        }
        const botoes = $$("button", form);
        botoes.forEach((b) => (b.disabled = true));
        msg.className = "form-msg";
        msg.textContent = "A enviar a sua mensagem…";
        enviar("email", texto, assunto, { nome, contacto }).then((r) => {
          botoes.forEach((b) => (b.disabled = false));
          msg.className = "form-msg ok";
          if (r === "enviado") {
            msg.textContent = "Mensagem enviada! Recebemos o seu pedido e respondemos em breve.";
            form.reset();
          } else {
            msg.textContent = "Não conseguimos enviar directamente. Abrimos o seu programa de e-mail com a mensagem preenchida; só falta carregar em Enviar.";
          }
        });
      });
    });

    // links "Pedir proposta" que pré-seleccionam o serviço no formulário
    $$("[data-servico]").forEach((el) => el.addEventListener("click", () => {
      const sel = $("form[data-contact] select[name=servico]");
      if (sel) {
        const opt = [...sel.options].find((o) => o.value === el.dataset.servico || o.text === el.dataset.servico);
        if (opt) sel.value = opt.value;
      }
    }));
  }

  /* ---------------------------------------------------------------
     CALCULADORA DE SUBSCRIÇÃO (hospedagem / e-mail)
     --------------------------------------------------------------- */
  function calculadoraSubscricao(o) {
    const sel = $(o.select), anosInputs = $$(`input[name="${o.anosName}"]`);
    const out = (id) => $(id);
    const descontos = { 1: 0, 2: preco("regra.desconto_2anos"), 3: preco("regra.desconto_3anos") };

    function estado() {
      const plano = o.planos[sel.value];
      const anos = Number((anosInputs.find((i) => i.checked) || {}).value || 1);
      const mensal = preco(plano.chave);
      const subtotal = mensal * anos * 12;
      const pct = descontos[anos] || 0;
      const desconto = Math.round((subtotal * pct) / 100);
      return { plano, anos, mensal, subtotal, pct, desconto, total: subtotal - desconto };
    }
    function render() {
      const s = estado();
      out("#rPlano").textContent = s.plano.nome;
      out("#rDuracao").textContent = `${s.anos} ${s.anos === 1 ? "ano" : "anos"} (${s.anos * 12} meses)`;
      out("#rMensal").textContent = kz(s.mensal) + "/mês";
      out("#rSubtotal").textContent = kz(s.subtotal);
      out("#rDesconto").textContent = s.desconto ? `− ${kz(s.desconto)} (${s.pct}%)` : "—";
      out("#rTotal").textContent = kz(s.total);
      const eco = out("#rPoupa");
      eco.hidden = !s.desconto; eco.textContent = s.desconto ? `Poupa ${kz(s.desconto)}` : "";
      $$("[data-bar-total]").forEach((el) => (el.textContent = kz(s.total)));
      $$("[data-bar-label]").forEach((el) => (el.textContent = `${o.rotulo} ${s.plano.nome} · ${s.anos} ${s.anos === 1 ? "ano" : "anos"}`));
      // mostra o equivalente mensal nos botões de duração
      $$("[data-anos-eq]").forEach((el) => {
        const a = Number(el.dataset.anosEq), p = descontos[a] || 0;
        el.textContent = p ? `−${p}%` : "";
        el.hidden = !p;
      });
    }
    sel.addEventListener("change", render);
    anosInputs.forEach((i) => i.addEventListener("change", render));
    $$("[data-escolher]").forEach((b) => b.addEventListener("click", () => {
      sel.value = b.dataset.escolher; render();
      $("#calculadora").scrollIntoView({ behavior: "smooth" });
    }));

    const dom = o.dominio ? $(o.dominio) : null, domHint = dom ? $(o.dominioHint) : null;
    const hintOriginal = domHint ? domHint.innerHTML : "";
    if (dom) dom.addEventListener("input", () => { domHint.innerHTML = hintOriginal; domHint.classList.remove("error"); dom.classList.remove("invalid"); });

    $$("[data-adicionar]").forEach((btn) => btn.addEventListener("click", () => {
      let dominio = "";
      if (dom) {
        dominio = dom.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
        if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(dominio)) {
          domHint.textContent = "Indique um domínio válido, por exemplo minhaempresa.ao.";
          domHint.classList.add("error"); dom.classList.add("invalid");
          $("#calculadora").scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => dom.focus({ preventScroll: true }), 400);
          return;
        }
      }
      const s = estado();
      Orcamento.adicionar({
        servico: o.servico, servicoLabel: o.rotulo, icon: o.icon,
        plano: s.plano.nome,
        substitui: o.servico + ":" + (dominio || "geral"),
        detalhes: [
          dominio ? `Domínio: ${dominio}` : null,
          `${s.anos} ${s.anos === 1 ? "ano" : "anos"} (${s.anos * 12} meses) × ${kz(s.mensal)}/mês`,
          s.pct ? `Desconto de ${s.pct}% incluído` : null
        ].filter(Boolean),
        total: s.total
      });
      toast(`${o.rotulo} ${s.plano.nome} adicionado ao orçamento.`, { href: "orcamento-ecomulti.html", text: "Ver orçamento →" });
    }));
    render();
  }

  /* ---------------------------------------------------------------
     ARRANQUE
     --------------------------------------------------------------- */
  window.EcoApp = { preco, kz, Orcamento, enviar, linkWhatsApp, linkEmail, toast, preencherPrecos, calculadoraSubscricao, $, $$ };

  /* ---------------------------------------------------------------
     SUBMENUS do menu principal (abrem ao passar o rato; no telemóvel
     aparecem logo por baixo). Cada um leva ao WhatsApp.
     --------------------------------------------------------------- */
  const SUBMENUS = {
    "email-corporativo-ecomulti": ["Ilimitado sob consulta", "Olá ECOMULTI! Gostaria de consultar o plano de e-mail ilimitado."],
    "desenvolvimento-ecomulti": ["Sites ilimitados sob consulta", "Olá ECOMULTI! Gostaria de consultar o plano de sites ilimitados."]
  };
  function adicionarSubmenus() {
    $$("#menu > a").forEach((a) => {
      // aceita "pagina.html", "/pagina" e "/pagina.html" (alguns servidores servem os links sem .html)
      const pagina = (a.getAttribute("href") || "").split(/[?#]/)[0].replace(/^\/+/, "").replace(/\.html$/, "");
      const sub = SUBMENUS[pagina];
      if (!sub) return;
      const item = document.createElement("div");
      item.className = "nav-item";
      a.replaceWith(item);
      const caixa = document.createElement("div");
      caixa.className = "nav-sub";
      const link = document.createElement("a");
      link.dataset.wa = sub[1];
      link.innerHTML = '<svg class="icon"><use href="#i-whatsapp"/></svg>';
      link.append(" " + sub[0]);
      caixa.append(link);
      item.append(a, caixa);
    });
  }

  /* ---------------------------------------------------------------
     CARROSSEL DE LOGÓTIPOS (<div data-marquee>): repete os logótipos até
     encher o ecrã e anda sem parar; pára ao passar o rato.
     --------------------------------------------------------------- */
  function iniciarCarrosseis() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    $$("[data-marquee]").forEach((m) => {
      const track = $(".marquee-track", m), grupo = $(".marquee-group", m);
      if (!track || !grupo) return;
      const originais = [...grupo.children];
      const montar = () => {
        // limpa repetições anteriores
        [...grupo.children].slice(originais.length).forEach((n) => n.remove());
        $$(".marquee-group[aria-hidden]", track).forEach((g) => g.remove());
        m.classList.remove("is-ready");
        const largura = originais.reduce((s, li) => s + li.getBoundingClientRect().width + parseFloat(getComputedStyle(li).marginRight || 0), 0);
        if (!largura) return;
        const copias = Math.max(1, Math.ceil(m.clientWidth / largura));
        for (let i = 1; i < copias; i++) originais.forEach((li) => { const c = li.cloneNode(true); c.setAttribute("aria-hidden", "true"); grupo.append(c); });
        const clone = grupo.cloneNode(true);
        clone.setAttribute("aria-hidden", "true");
        track.append(clone);
        m.style.setProperty("--dur", Math.round((largura * copias) / 55) + "s");   // ~55 px por segundo
        m.classList.add("is-ready");
      };
      montar();   // os cartões têm largura fixa: não é preciso esperar pelas imagens
      let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(montar, 250); });
    });
  }

  function arrancar() {
    adicionarSubmenus();
    iniciarCarrosseis();
    preencherPrecos();
    preencherEmpresa();
    actualizarContador();
    iniciarInterface();
    iniciarFormularios();
    document.dispatchEvent(new Event("eco:pronto"));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
  addEventListener("storage", (e) => { if (e.key === CHAVE) actualizarContador(); });
})();
