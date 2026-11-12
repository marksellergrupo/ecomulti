/* =====================================================================
   ECOMULTI — Assistente de atendimento (chat do site)
   · Modo IA: conversa com o agente em /api/agente (Claude), em streaming.
   · Modo guiado: se a IA não estiver disponível (sem chave, sem servidor,
     limite atingido ou erro), o mesmo chat continua com botões e passos
     fixos — o cliente nunca fica sem resposta.
   Precisa de app.js (window.EcoApp). Carrega dominio.js quando é preciso.
   ===================================================================== */
(function () {
  "use strict";
  if (!window.EcoApp || window.__ecoAgente) return;
  window.__ecoAgente = true;

  const { preco, kz, Orcamento, linkWhatsApp, linkEmail, toast } = window.EcoApp;
  const CFG = window.ECOMULTI || {};
  const EMP = CFG.empresa || {};
  const ENDPOINT = (CFG.agente && CFG.agente.endpoint) || "/api/agente";
  const BASE = (document.currentScript && document.currentScript.src.replace(/assets\/js\/agente\.js.*$/, "")) || "";
  const K = { sessao: "ecomulti_agente_sessao", log: "ecomulti_agente_log", modo: "ecomulti_agente_modo", visto: "ecomulti_agente_ola" };

  const ls = {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
  };
  function idSessao() {
    let id = ls.get(K.sessao, "");
    if (!/^[a-z0-9-]{16,64}$/i.test(id)) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
      ls.set(K.sessao, id);
    }
    return id;
  }

  /* ---------------- texto → HTML seguro (negrito, links, quebras) ---------------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function md(t) {
    let h = esc(t);
    h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/(^|[\s(])((?:https?:\/\/|wa\.me\/)[^\s<)]+[^\s<).,;:!?])/g, (m, a, u) =>
      `${a}<a href="${u.startsWith("http") ? u : "https://" + u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//, "")}</a>`);
    h = h.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1<strong>$2</strong>");
    h = h.replace(/^\s*[-•]\s+/gm, "• ");
    return h.replace(/\n/g, "<br>");
  }
  const ico = (id) => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  /* ---------------- estrutura ---------------- */
  let painel, msgs, chips, form, campo, enviarBtn, lancador, estadoTxt;
  let modo = ss.get(K.modo) || "";  // "ia" | "guiado" | "" (por descobrir)
  let ocupado = false;
  let log = ls.get(K.log, []);
  let guia = { passo: "menu" };

  function construir() {
    lancador = document.createElement("button");
    lancador.type = "button";
    lancador.className = "ag-lancador";
    lancador.setAttribute("aria-label", "Abrir o assistente ECOMULTI");
    lancador.setAttribute("aria-expanded", "false");
    lancador.innerHTML = `${ico("chat")}<span class="ag-ponto" aria-hidden="true"></span>`;

    const dica = document.createElement("button");
    dica.type = "button";
    dica.className = "ag-dica";
    dica.innerHTML = `<strong>Olá! 👋</strong> Precisa de ajuda a escolher? Fale comigo.`;
    dica.addEventListener("click", () => abrir());

    painel = document.createElement("div");
    painel.className = "ag-painel";
    painel.setAttribute("role", "dialog");
    painel.setAttribute("aria-label", "Assistente ECOMULTI");
    painel.hidden = true;
    painel.innerHTML =
      `<header class="ag-topo">
         <img src="${BASE}assets/img/consultor.webp" alt="" width="40" height="40">
         <div class="ag-quem"><strong>Assistente ECOMULTI</strong><span class="ag-estado"><i></i><span>Online · responde na hora</span></span></div>
         <button type="button" class="ag-btn-ico" data-ag="recomecar" aria-label="Recomeçar conversa" title="Recomeçar conversa">${ico("back")}</button>
         <button type="button" class="ag-btn-ico" data-ag="fechar" aria-label="Fechar o assistente">${ico("x")}</button>
       </header>
       <div class="ag-msgs" role="log" aria-live="polite"></div>
       <div class="ag-chips"></div>
       <form class="ag-form" autocomplete="off">
         <textarea rows="1" maxlength="1200" placeholder="Escreva a sua mensagem…" aria-label="Mensagem"></textarea>
         <button type="submit" class="ag-enviar" aria-label="Enviar">${ico("arrow")}</button>
       </form>
       <p class="ag-nota">Assistente automático · pode pedir para falar com uma pessoa · <a href="${BASE}privacidade.html">Privacidade</a></p>`;

    document.body.append(lancador, dica, painel);
    document.body.classList.add("com-agente");
    msgs = painel.querySelector(".ag-msgs");
    chips = painel.querySelector(".ag-chips");
    form = painel.querySelector(".ag-form");
    campo = form.querySelector("textarea");
    enviarBtn = form.querySelector(".ag-enviar");
    estadoTxt = painel.querySelector(".ag-estado span");

    lancador.addEventListener("click", () => (painel.hidden ? abrir() : fechar()));
    painel.querySelector('[data-ag="fechar"]').addEventListener("click", fechar);
    painel.querySelector('[data-ag="recomecar"]').addEventListener("click", recomecar);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !painel.hidden) fechar(); });
    form.addEventListener("submit", (e) => { e.preventDefault(); submeter(); });
    campo.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submeter(); } });
    campo.addEventListener("input", () => { campo.style.height = "auto"; campo.style.height = Math.min(campo.scrollHeight, 120) + "px"; });
    chips.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) escolher(b.dataset.v, b.textContent.trim()); });
    msgs.addEventListener("click", aoClicarCartao);

    // convite discreto, uma vez por sessão
    if (!ss.get(K.visto)) setTimeout(() => { if (painel.hidden) { dica.classList.add("on"); ss.set(K.visto, "1"); setTimeout(() => dica.classList.remove("on"), 9000); } }, 7000);
    lancador.addEventListener("click", () => dica.classList.remove("on"));
  }

  function abrir() {
    painel.hidden = false;
    document.body.classList.add("ag-aberto");
    lancador.setAttribute("aria-expanded", "true");
    lancador.classList.add("lido");
    if (!msgs.childElementCount) iniciar();
    setTimeout(() => { if (matchMedia("(min-width: 641px)").matches) campo.focus(); }, 60);
    rolar();
  }
  function fechar() {
    painel.hidden = true;
    document.body.classList.remove("ag-aberto");
    lancador.setAttribute("aria-expanded", "false");
    lancador.focus();
  }

  async function descobrirModo() {
    if (modo) return modo;
    if (location.protocol === "file:") return (modo = "guiado");
    try {
      const r = await fetch(ENDPOINT, { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined });
      const j = await r.json();
      modo = j && j.ativo ? "ia" : "guiado";
    } catch { modo = "guiado"; }
    ss.set(K.modo, modo);
    return modo;
  }
  function mostrarModo() {
    estadoTxt.textContent = modo === "ia" ? "Online · responde na hora" : "Atendimento guiado";
    campo.placeholder = modo === "ia" ? "Escreva a sua mensagem…" : "Escreva ou escolha uma opção…";
  }

  async function iniciar() {
    if (log.length) { log.forEach(desenharEntrada); await descobrirModo(); mostrarModo(); mostrarChips(modo === "ia" ? [] : MENU_GUIADO, true); return; }
    await descobrirModo(); mostrarModo();
    bot(`Olá! 👋 Sou o assistente da **${EMP.nome || "ECOMULTI"}**. Ajudo a escolher e a pedir domínio, site, hospedagem, e-mail profissional, VPS ou automação com IA.\n\nO que procura hoje?`);
    mostrarChips(modo === "ia" ? MENU_IA : MENU_GUIADO);
  }
  function recomecar() {
    log = []; ls.set(K.log, log);
    ls.set(K.sessao, ""); guia = { passo: "menu" };
    msgs.replaceChildren(); chips.replaceChildren();
    iniciar();
  }

  /* ---------------- mensagens ---------------- */
  function guardar(entrada) { log.push(entrada); if (log.length > 80) log = log.slice(-80); ls.set(K.log, log); }
  function desenharEntrada(e) {
    if (e.de === "cartao") return desenharCartao(e.cartao);
    const d = document.createElement("div");
    d.className = "ag-msg " + (e.de === "eu" ? "eu" : "bot");
    d.innerHTML = e.de === "eu" ? esc(e.txt).replace(/\n/g, "<br>") : md(e.txt);
    msgs.append(d);
    rolar();
    return d;
  }
  const bot = (txt) => { guardar({ de: "bot", txt }); return desenharEntrada({ de: "bot", txt }); };
  const eu = (txt) => { guardar({ de: "eu", txt }); return desenharEntrada({ de: "eu", txt }); };
  const cartao = (c) => { guardar({ de: "cartao", cartao: c }); desenharCartao(c); };
  function rolar() { requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; }); }
  function aEscrever() {
    const d = document.createElement("div");
    d.className = "ag-msg bot ag-dots";
    d.innerHTML = "<i></i><i></i><i></i>";
    d.setAttribute("aria-label", "A escrever");
    msgs.append(d); rolar();
    return d;
  }
  function mostrarChips(lista, fixo) {
    chips.replaceChildren();
    (lista || []).forEach(([t, v]) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ag-chip"; b.dataset.v = v; b.textContent = t;
      chips.append(b);
    });
    chips.hidden = !chips.childElementCount;
    if (!fixo) rolar();
  }
  function bloquear(sim) { ocupado = sim; enviarBtn.disabled = sim; chips.classList.toggle("off", sim); }

  /* ---------------- cartões (orçamento, pedido, humano, domínios) ---------------- */
  function desenharCartao(c) {
    const d = document.createElement("div");
    d.className = "ag-cartao";
    if (c.tipo === "orcamento") {
      d.innerHTML = `<div class="ag-c-tit">${ico("cart")} Orçamento actualizado</div>` +
        c.itens.map((i) => `<div class="ag-c-lin"><span>${esc(i.servicoLabel)} — ${esc(i.plano)}</span><b>${i.total ? esc(kz(i.total)) : "sob consulta"}</b></div>`).join("") +
        `<div class="ag-c-lin tot"><span>Total estimado (c/ IVA)</span><b>${esc(c.total_estimado || "")}</b></div>` +
        `<a class="btn btn-sm btn-outline" href="${BASE}orcamento-ecomulti.html">Ver orçamento</a>`;
    } else if (c.tipo === "pedido") {
      d.innerHTML = `<div class="ag-c-tit ok">${ico("check")} Pedido ${esc(c.numero)} registado</div>` +
        `<p>Último passo: envie o pedido à nossa equipa para receber a factura proforma.</p>` +
        `<a class="btn btn-sm btn-whatsapp" href="${esc(linkWhatsApp(c.texto))}" target="_blank" rel="noopener">${ico("whatsapp")} Enviar pedido pelo WhatsApp</a>` +
        `<a class="ag-c-link" href="${esc(linkEmail("Pedido " + c.numero, c.texto))}">ou enviar por e-mail</a>`;
    } else if (c.tipo === "humano") {
      d.innerHTML = `<div class="ag-c-tit">${ico("people")} Falar com a equipa</div>` +
        `<p>${esc(EMP.horario ? "Atendimento: " + EMP.horario + "." : "Respondemos o mais depressa possível.")}</p>` +
        `<a class="btn btn-sm btn-whatsapp" href="${esc(linkWhatsApp(c.texto || "Olá ECOMULTI! Vim do assistente do site."))}" target="_blank" rel="noopener">${ico("whatsapp")} Falar no WhatsApp</a>`;
    } else if (c.tipo === "dominios") {
      d.innerHTML = `<div class="ag-c-tit">${ico("globe")} ${esc(c.nome)}</div>` +
        c.linhas.map((l) => `<div class="ag-c-lin dom" data-estado="${esc(l.estado)}"><span>${esc(l.dominio)}<small>${esc(l.rotulo)} · ${esc(kz(l.preco))}/ano</small></span>` +
          (l.estado === "taken" ? "<em>Registado</em>" : `<button type="button" class="btn btn-sm btn-primary" data-add-dom="${esc(l.dominio)}" data-ext="${esc(l.ext)}">Adicionar</button>`) + `</div>`).join("") +
        `<p class="ag-c-nota">Verificação indicativa — confirmamos sempre antes de registar.</p>`;
    } else if (c.tipo === "finalizar") {
      d.innerHTML = `<div class="ag-c-tit">${ico("cart")} O seu orçamento</div>` +
        c.itens.map((i) => `<div class="ag-c-lin"><span>${esc(i.servicoLabel || i.servico)} — ${esc(i.plano)}</span><b>${esc(kz(i.total))}</b></div>`).join("") +
        `<div class="ag-c-lin tot"><span>Subtotal (sem IVA)</span><b>${esc(kz(c.total))}</b></div>` +
        `<a class="btn btn-sm btn-primary" href="${BASE}orcamento-ecomulti.html">Rever e enviar pedido ${ico("arrow")}</a>`;
    }
    msgs.append(d); rolar();
  }
  function aoClicarCartao(e) {
    const b = e.target.closest("[data-add-dom]");
    if (!b || !window.Dominios) return;
    window.Dominios.adicionar(b.dataset.addDom, b.dataset.ext);
    b.textContent = "Adicionado ✓"; b.disabled = true; b.classList.replace("btn-primary", "btn-outline");
    if (modo !== "ia") { bot("Boa escolha! Quer juntar mais alguma coisa?"); mostrarChips(DEPOIS_DE_ADICIONAR); }
  }

  /* orçamento definido pelo agente → carrinho do site */
  function sincronizarCarrinho(itens) {
    Orcamento.gravar(Orcamento.ler().filter((i) => i.origem !== "agente"));
    itens.forEach((i) => Orcamento.adicionar({ ...i, origem: "agente" }));
  }

  /* ---------------- entrada do utilizador ---------------- */
  function submeter() {
    const t = campo.value.trim();
    if (!t || ocupado) return;
    campo.value = ""; campo.style.height = "auto";
    tratar(t, t);
  }
  function escolher(v, rotulo) {
    if (ocupado) return;
    if (v.startsWith("g:")) { eu(rotulo); mostrarChips([]); guiado(v); return; }
    tratar(v, rotulo);
  }
  async function tratar(texto, mostrar) {
    eu(mostrar);
    mostrarChips([]);
    await descobrirModo(); mostrarModo();
    if (modo === "ia") return conversarIA(texto);
    guiadoTexto(texto);
  }

  /* ---------------- modo IA (streaming NDJSON) ---------------- */
  async function conversarIA(texto) {
    bloquear(true);
    const dots = aEscrever();
    let bolha = null, acumulado = "";
    const fimBolha = () => { if (bolha && acumulado.trim()) guardar({ de: "bot", txt: acumulado.trim() }); bolha = null; acumulado = ""; };
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessao: idSessao(), mensagem: texto, pagina: location.pathname.replace(/^.*\//, "/") })
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        dots.remove();
        if (j.modo === "humano") { bot("Esta conversa já vai longa — a nossa equipa continua consigo no WhatsApp. 🙂"); cartao({ tipo: "humano" }); return; }
        modo = "guiado"; ss.set(K.modo, modo); mostrarModo();
        return guiadoTexto(texto);
      }
      const leitor = r.body.getReader(), dec = new TextDecoder();
      let buf = "", terminou = false;
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let n;
        while ((n = buf.indexOf("\n")) >= 0) {
          const linha = buf.slice(0, n).trim(); buf = buf.slice(n + 1);
          if (!linha) continue;
          let ev; try { ev = JSON.parse(linha); } catch { continue; }
          if (ev.t === "txt") {
            if (dots.isConnected) dots.remove();
            if (!bolha) { bolha = document.createElement("div"); bolha.className = "ag-msg bot"; msgs.append(bolha); }
            acumulado += ev.d;
            bolha.innerHTML = md(acumulado.trim());
            rolar();
          } else if (ev.t === "accao") {
            fimBolha();
            if (ev.tipo === "orcamento") { sincronizarCarrinho(ev.itens || []); cartao({ tipo: "orcamento", itens: ev.itens || [], total_estimado: ev.total_estimado }); }
            else if (ev.tipo === "pedido") {
              cartao({ tipo: "pedido", numero: ev.numero, texto: ev.texto });
              try { localStorage.setItem("ecomulti_ultimo_pedido", JSON.stringify({ pedido: ev.numero, data: new Date().toISOString(), itens: Orcamento.ler() })); } catch {}
            } else if (ev.tipo === "humano") cartao({ tipo: "humano", texto: ev.texto });
          } else if (ev.t === "erro") throw new Error("agente");
          else if (ev.t === "fim") terminou = true;
        }
      }
      fimBolha();
      if (dots.isConnected) dots.remove();
      if (!terminou) throw new Error("ligação interrompida");
    } catch (e) {
      if (dots.isConnected) dots.remove();
      fimBolha();
      bot("Desculpe, tive um problema técnico a responder. Pode tentar de novo, ou falar já com a nossa equipa:");
      cartao({ tipo: "humano", texto: "Olá ECOMULTI! Estava a falar com o assistente do site e preciso de ajuda: " + texto });
    } finally {
      bloquear(false);
    }
  }

  /* ---------------- modo guiado (sem IA) ---------------- */
  const MENU_IA = [
    ["🌐 Registar domínio", "Quero registar um domínio"], ["💻 Criar website", "Quero criar um website"],
    ["🗄️ Hospedagem", "Preciso de hospedagem para o meu site"], ["✉️ E-mail profissional", "Quero e-mail profissional"],
    ["⚡ VPS / IA", "Tenho interesse em servidor VPS ou automação com IA"], ["👤 Falar com uma pessoa", "Quero falar com uma pessoa"]
  ];
  const MENU_GUIADO = [
    ["🌐 Registar domínio", "g:dominio"], ["💻 Criar website", "g:website"], ["🗄️ Hospedagem", "g:hospedagem"],
    ["✉️ E-mail profissional", "g:email"], ["⚡ VPS / IA", "g:vps"], ["👤 Falar com uma pessoa", "g:humano"]
  ];
  const DEPOIS_DE_ADICIONAR = [["🗄️ Juntar hospedagem", "g:hospedagem"], ["✉️ Juntar e-mail", "g:email"], ["🌐 Juntar domínio", "g:dominio"], ["✅ Finalizar pedido", "g:finalizar"], ["☰ Menu", "g:menu"]];
  const PLANOS = {
    hospedagem: { rotulo: "Hospedagem", icon: "server", planos: { starter: ["Starter", "hospedagem.starter", "1 site, 5 e-mails, 5 GB"], business: ["Business", "hospedagem.business", "até 5 sites, 20 e-mails, backups diários"], premium: ["Premium", "hospedagem.premium", "até 15 sites, 50 e-mails, 10 GB"] } },
    email: { rotulo: "E-mail profissional", icon: "mail", planos: { essencial: ["Essencial", "email.essencial", "1 conta, 10 GB"], profissional: ["Profissional", "email.profissional", "até 5 contas, 10 GB cada"], empresarial: ["Empresarial", "email.empresarial", "até 15 contas, 10 GB cada"] } }
  };
  const WEB = { landing: ["Landing Page", "desenvolvimento.landing", 7, "1 página para apresentar uma oferta"], institucional: ["Site Institucional", "desenvolvimento.institucional", 15, "até 8 páginas, o mais popular"], loja: ["Loja Online", "desenvolvimento.loja", 30, "catálogo, carrinho e encomendas"] };

  function carregarDominios() {
    if (window.Dominios) return Promise.resolve();
    return new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = BASE + "assets/js/dominio.js"; s.onload = ok; s.onerror = falha;
      document.head.append(s);
    });
  }

  function guiado(v) {
    const p = v.split(":");
    switch (p[1]) {
      case "menu": guia = { passo: "menu" }; bot("Em que mais posso ajudar?"); return mostrarChips(MENU_GUIADO);
      case "dominio":
        guia = { passo: "dom_nome" };
        return bot("Que nome quer para o seu domínio? Escreva só o nome, por exemplo **minhaempresa** — eu verifico .ao, .co.ao, .it.ao, .edu.ao, .org.ao, .com, .net e .org.");
      case "website":
        guia = { passo: "menu" };
        bot("Temos três pacotes, todos adaptados ao telemóvel e com acompanhamento após o lançamento. Qual se parece mais com o que precisa?");
        return mostrarChips(Object.entries(WEB).map(([k, w]) => [`${w[0]} · ${kz(preco(w[1]))}`, "g:web:" + k]).concat([["Não sei, quero ajuda", "g:humano"]]));
      case "web": {
        const w = WEB[p[2]];
        Orcamento.adicionar({ servico: "desenvolvimento", servicoLabel: "Website", icon: "code", plano: w[0], substitui: "desenvolvimento", detalhes: [`Entrega estimada ≈ ${w[2]} dias`], total: preco(w[1]) });
        toast(`${w[0]} adicionado ao orçamento.`, { href: BASE + "orcamento-ecomulti.html", text: "Ver orçamento →" });
        bot(`Adicionei o **${w[0]}** (${kz(preco(w[1]))}, ${w[3]}) ao seu orçamento. Pode juntar páginas e extras na [calculadora de websites](${BASE}desenvolvimento-ecomulti.html#calculadora).\n\nPara publicar o site precisa também de domínio e hospedagem.`);
        return mostrarChips(DEPOIS_DE_ADICIONAR);
      }
      case "hospedagem": case "email": {
        const s = PLANOS[p[1]];
        guia = { passo: "menu", servico: p[1] };
        bot(p[1] === "hospedagem" ? "Escolha o plano de hospedagem (todos com SSL e painel de gestão):" : "Escolha o pacote de e-mail profissional:");
        return mostrarChips(Object.entries(s.planos).map(([k, x]) => [`${x[0]} · ${kz(preco(x[1]))}/mês — ${x[2]}`, `g:plano:${p[1]}:${k}`]));
      }
      case "plano": {
        guia = { passo: "menu", servico: p[2], plano: p[3] };
        bot(`Por quanto tempo? Subscrições mais longas têm desconto.`);
        return mostrarChips([["1 ano", "g:anos:1"], [`2 anos (−${preco("regra.desconto_2anos")}%)`, "g:anos:2"], [`3 anos (−${preco("regra.desconto_3anos")}%)`, "g:anos:3"]]);
      }
      case "anos": {
        guia.anos = Number(p[2]); guia.passo = "sub_dom";
        const ultimo = (() => { try { return sessionStorage.getItem("ecomulti_ultimo_dominio"); } catch { return null; } })();
        bot(`Para que domínio é${guia.servico === "email" ? " o e-mail" : " a hospedagem"}? (ex.: minhaempresa.ao)` + (ultimo ? `\nSe for o que pesquisou: **${ultimo}.ao**` : ""));
        return;
      }
      case "vps":
        guia = { passo: "vps_desc" };
        return bot("Conte-me em poucas palavras o que precisa — por exemplo: servidor para um sistema de gestão, site com muito tráfego, chatbot de atendimento, automatizar pedidos… A equipa prepara uma proposta à medida.");
      case "humano":
        guia = { passo: "menu" };
        bot("Claro! A nossa equipa continua consigo no WhatsApp.");
        cartao({ tipo: "humano" });
        return mostrarChips(MENU_GUIADO);
      case "finalizar": {
        guia = { passo: "menu" };
        const itens = Orcamento.ler();
        if (!itens.length) { bot("O seu orçamento ainda está vazio. Escolha um serviço para começar:"); return mostrarChips(MENU_GUIADO); }
        bot("Está quase! Reveja o orçamento, preencha os seus dados e envie o pedido — recebe depois a factura proforma.");
        cartao({ tipo: "finalizar", itens, total: Orcamento.total() });
        return mostrarChips([["☰ Juntar mais serviços", "g:menu"]]);
      }
    }
  }

  async function guiadoTexto(t) {
    if (guia.passo === "dom_nome") {
      try { await carregarDominios(); } catch { bot("Não consegui abrir a pesquisa de domínios. Tente na página [Domínios](" + BASE + "dominios.html)."); return; }
      const D = window.Dominios, nome = D.normalizar(t);
      if (!D.valido(nome)) return bot("Use só letras, números e hífen — sem espaços, acentos ou símbolos. Tente outra vez:");
      bloquear(true);
      const dots = aEscrever();
      const linhas = await Promise.all(D.EXTENSOES.map(async (ext) => {
        const estado = await D.verificar(nome, ext);
        const rot = { free: "Disponível", probable: "Provavelmente disponível", taken: "Já registado" }[estado] || "Confirmamos por si";
        return { dominio: nome + ext, ext, estado, rotulo: rot, preco: D.precoExt(ext) };
      }));
      dots.remove(); bloquear(false);
      guia = { passo: "dom_nome" };
      cartao({ tipo: "dominios", nome: "Resultados para " + nome, linhas });
      bot("Carregue em **Adicionar** no domínio que quer, ou escreva outro nome para pesquisar.");
      return mostrarChips([["✅ Finalizar pedido", "g:finalizar"], ["☰ Menu", "g:menu"]]);
    }
    if (guia.passo === "sub_dom") {
      let d = t.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      if (!d.includes(".")) d += ".ao";
      if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d)) return bot("Esse domínio não parece válido. Escreva, por exemplo, **minhaempresa.ao**:");
      const s = PLANOS[guia.servico], pl = s.planos[guia.plano], anos = guia.anos || 1;
      const mensal = preco(pl[1]), subtotal = mensal * 12 * anos;
      const pct = { 1: 0, 2: preco("regra.desconto_2anos"), 3: preco("regra.desconto_3anos") }[anos] || 0;
      const total = subtotal - Math.round((subtotal * pct) / 100);
      Orcamento.adicionar({
        servico: guia.servico, servicoLabel: s.rotulo, icon: s.icon, plano: pl[0], substitui: guia.servico + ":" + d,
        detalhes: [`Domínio: ${d}`, `${anos} ${anos === 1 ? "ano" : "anos"} (${anos * 12} meses) × ${kz(mensal)}/mês`, pct ? `Desconto de ${pct}% incluído` : null].filter(Boolean),
        total
      });
      toast(`${s.rotulo} ${pl[0]} adicionado ao orçamento.`, { href: BASE + "orcamento-ecomulti.html", text: "Ver orçamento →" });
      guia = { passo: "menu" };
      bot(`Adicionei **${s.rotulo} ${pl[0]}** para ${d}: ${kz(total)} por ${anos} ${anos === 1 ? "ano" : "anos"}${pct ? ` (já com ${pct}% de desconto)` : ""}.\n\nAinda não tem o domínio registado? Posso verificá-lo agora.`);
      return mostrarChips(DEPOIS_DE_ADICIONAR);
    }
    if (guia.passo === "vps_desc") {
      guia = { passo: "menu" };
      bot("Obrigado! Envie este pedido à nossa equipa — respondemos com uma proposta personalizada.");
      cartao({ tipo: "humano", texto: `Olá ECOMULTI! Tenho interesse em VPS / automação com IA: ${t}` });
      return mostrarChips(MENU_GUIADO);
    }
    // texto livre no menu: encaminhar por palavras-chave
    const x = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const rota = /dominio|\.ao\b|\.com\b|registar|nome/.test(x) ? "g:dominio"
      : /hosped|aloja|servidor partilhado/.test(x) ? "g:hospedagem"
      : /e-?mail|correio/.test(x) ? "g:email"
      : /site|loja|pagina|landing|website/.test(x) ? "g:website"
      : /vps|servidor|\bia\b|intelig|automa|chatbot|bot/.test(x) ? "g:vps"
      : /pessoa|humano|atendente|ligar|telefone|falar|reclam|suporte|ajuda/.test(x) ? "g:humano"
      : /finaliz|pedido|orcamento|pagar|comprar/.test(x) ? "g:finalizar" : null;
    if (rota) return guiado(rota);
    bot("Para o ajudar mais depressa, escolha uma das opções abaixo — ou fale com uma pessoa da equipa.");
    mostrarChips(MENU_GUIADO);
  }

  /* ---------------- CSS + arranque ---------------- */
  function arrancar() {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = BASE + "assets/css/agente.css";
    css.onload = construir;
    css.onerror = construir;
    document.head.append(css);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
