/* =====================================================================
   ECOMULTI — página de venda (loja.html)
   Carrossel de serviços no topo; os três planos por baixo trocam com o slide.
   Os preços vêm de config.js / api/catalogo.php (EcoApp.preco), como no resto do site.
   Ligação directa a um serviço: loja.html#sites, #hospedagem, #email, #vps
   ===================================================================== */
(function () {
  "use strict";

  /* tipo de preço: "mensal" = preço por mês, faturado anualmente (compra = 12 meses)
                    "mes"    = preço por mês, pago mensalmente (compra = 1 mês)
                    "unico"  = pagamento único
     chave: null → "Sob consulta" (o botão abre o WhatsApp) */
  const SERVICOS = [
    {
      id: "sites", servico: "desenvolvimento", rotulo: "Website", icon: "code",
      eyebrow: "Websites profissionais", titulo: "Venda de Sites",
      texto: "Sites rápidos, seguros e prontos para telemóvel, feitos pela nossa equipa em Angola.",
      img: "assets/img/promo/venda-sites.jpg", alt: "Venda de sites ECOMULTI, a partir de 120.000 Kz",
      desde: "desenvolvimento.landing", desdeTpl: "{}",
      planos: [
        { tier: "Para começar", nome: "Landing Page", desc: "Uma página forte para apresentar uma oferta ou captar contactos.",
          chave: "desenvolvimento.landing", tipo: "unico", nota: "Pagamento único · entrega em ~7 dias",
          itens: ["1 página optimizada", "Design responsivo", "Formulário de contacto", "Botão de WhatsApp"] },
        { tier: "Para empresas", nome: "Site Institucional", desc: "Uma presença digital completa e profissional.", destaque: true,
          chave: "desenvolvimento.institucional", tipo: "unico", nota: "Pagamento único · entrega em ~15 dias",
          itens: ["Até 8 páginas", "Design personalizado", "Formulários e mapa de localização", "SEO básico"] },
        { tier: "Para vender", nome: "Loja Online", desc: "Venda os seus produtos na Internet com gestão simples.",
          chave: "desenvolvimento.loja", tipo: "unico", nota: "Pagamento único · entrega em ~30 dias",
          itens: ["Catálogo e carrinho de compras", "Painel de encomendas", "Pagamentos locais", "Design responsivo e SEO"] }
      ]
    },
    {
      id: "hospedagem", servico: "hospedagem", rotulo: "Hospedagem", icon: "server",
      eyebrow: "Alojamento web", titulo: "Hospedagem com SSL",
      texto: "Alojamento em SSD com certificado SSL, e-mails com o seu domínio e cópias de segurança.",
      img: "assets/img/promo/alojamento-email.jpg", alt: "Planos de alojamento web e e-mails corporativos ECOMULTI",
      desde: "hospedagem.starter", desdeTpl: "{}/mês",
      planos: [
        { tier: "Para começar", nome: "Starter", desc: "Ideal para pequenos sites e projectos pessoais.",
          chave: "hospedagem.starter", tipo: "mensal", nota: "Faturado anualmente",
          itens: ["5 GB de armazenamento SSD", "1 website", "5 contas de e-mail", "Certificado SSL"] },
        { tier: "Para empresas", nome: "Business", desc: "Para empresas que querem uma presença digital profissional.", destaque: true,
          chave: "hospedagem.business", tipo: "mensal", nota: "Faturado anualmente",
          itens: ["10 GB de armazenamento SSD", "Até 5 websites", "20 contas de e-mail", "Cópias de segurança diárias"] },
        { tier: "Mais recursos", nome: "Premium", desc: "Para projectos com maiores necessidades de recursos.",
          chave: "hospedagem.premium", tipo: "mensal", nota: "Faturado anualmente",
          itens: ["10 GB de armazenamento SSD", "Até 15 websites", "50 contas de e-mail", "Suporte prioritário"] }
      ]
    },
    {
      id: "email", servico: "email", rotulo: "E-mail profissional", icon: "mail",
      eyebrow: "E-mail corporativo", titulo: "E-mail com o seu domínio",
      texto: "Endereços como geral@suaempresa.ao, com webmail, filtro de spam e acesso no telemóvel.",
      img: "assets/img/promo/alojamento-email.jpg", alt: "Planos de e-mails corporativos ECOMULTI",
      desde: "email.essencial", desdeTpl: "{}/mês",
      planos: [
        { tier: "Para começar", nome: "Essencial", desc: "Para profissionais e pequenos negócios.",
          chave: "email.essencial", tipo: "mensal", nota: "Faturado anualmente",
          itens: ["1 conta de e-mail", "10 GB de armazenamento", "Endereço com domínio próprio", "Acesso por webmail"] },
        { tier: "Para equipas", nome: "Profissional", desc: "Para empresas com vários endereços.", destaque: true,
          chave: "email.profissional", tipo: "mensal", nota: "Faturado anualmente",
          itens: ["Até 5 contas de e-mail", "10 GB por conta", "Contas por colaborador ou departamento", "Filtro de spam reforçado"] },
        { tier: "Para empresas", nome: "Empresarial", desc: "Para equipas maiores, com mais capacidade.",
          chave: "email.empresarial", tipo: "mensal", nota: "Faturado anualmente",
          itens: ["Até 15 contas de e-mail", "10 GB por conta", "Endereços por departamento", "Suporte prioritário"] }
      ]
    },
    {
      id: "vps", servico: "vps", rotulo: "Servidor VPS", icon: "cpu",
      eyebrow: "Infraestrutura", titulo: "Venda de VPS",
      texto: "Mais desempenho, segurança e controlo para o seu negócio, com recursos reservados só para si.",
      img: "assets/img/promo/venda-vps.jpg", alt: "Venda de VPS ECOMULTI, a partir de 35.000 Kz por mês",
      desde: "vps.desde", desdeTpl: "{}/mês",
      planos: [
        { tier: "Para começar", nome: "VPS Start", desc: "Um servidor virtual para sistemas de gestão e aplicações próprias.", destaque: true,
          chave: "vps.desde", tipo: "mes", nota: "Pagamento mensal",
          itens: ["CPU, memória e disco dedicados", "Segurança reforçada", "Recursos escaláveis", "Suporte especializado"] },
        { tier: "Sem preocupações", nome: "VPS Gerido", desc: "Nós tratamos da instalação, das actualizações e da segurança.",
          chave: null, nota: "Proposta à medida",
          itens: ["Gestão feita pela nossa equipa", "Monitorização e cópias de segurança", "Escala à medida que cresce", "Suporte prioritário"] },
        { tier: "Inteligência Artificial", nome: "Automação com IA", desc: "Ferramentas que tratam do trabalho repetitivo da sua equipa.",
          chave: "automacao.desde", tipo: "consulta", nota: "Valor final após análise do projecto",
          itens: ["Apoio ao atendimento de clientes", "Organização de contactos e pedidos", "Processos internos mais rápidos", "Integração com os seus sistemas"] }
      ]
    }
  ];

  function iniciar() {
    const { preco, kz, Orcamento, toast, linkWhatsApp, $, $$ } = window.EcoApp;
    const raiz = $("[data-loja]");
    if (!raiz) return;
    const trilho = $(".loja-trilho", raiz), pontos = $(".loja-pontos", raiz);
    const planosEl = $("#lojaPlanos"), tituloPlanos = $("#lojaPlanosTitulo"), notaPlanos = $("#lojaPlanosNota");
    const reduzir = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let atual = 0, temporizador = null;

    const precoTexto = (p) => {
      if (!p.chave) return { valor: "Sob consulta", sufixo: "" };
      const v = kz(preco(p.chave));
      if (p.tipo === "consulta") return { valor: v, sufixo: "", antes: "a partir de" };
      return { valor: v, sufixo: p.tipo === "unico" ? "" : "/mês" };
    };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    /* ---- slides ---- */
    trilho.innerHTML = SERVICOS.map((s, i) => `
      <article class="loja-slide" id="slide-${s.id}" role="group" aria-roledescription="slide" aria-label="${i + 1} de ${SERVICOS.length}: ${esc(s.titulo)}" ${i ? 'aria-hidden="true"' : ""}>
        <div class="loja-slide-texto">
          <span class="eyebrow">${esc(s.eyebrow)}</span>
          <h2>${esc(s.titulo)}</h2>
          <p>${esc(s.texto)}</p>
          <p class="loja-desde">a partir de <strong>${esc(s.desdeTpl.replace("{}", kz(preco(s.desde))))}</strong></p>
          <a class="btn btn-accent loja-comprar" href="#planos" data-ir-planos ${i ? 'tabindex="-1"' : ""}>Comprar <svg class="icon"><use href="#i-cart"/></svg></a>
        </div>
        <div class="loja-slide-img"><img src="${s.img}" alt="${esc(s.alt)}" width="1080" height="1350" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}></div>
      </article>`).join("");
    pontos.innerHTML = SERVICOS.map((s, i) =>
      `<button type="button" role="tab" aria-label="${esc(s.titulo)}" aria-selected="${i === 0}" data-ir="${i}"></button>`).join("");

    /* ---- planos ---- */
    function desenharPlanos(s) {
      tituloPlanos.textContent = `Planos de ${s.rotulo === "Website" ? "Websites" : s.rotulo}`;
      notaPlanos.textContent = s.id === "hospedagem" || s.id === "email"
        ? "Valores sem IVA. A compra fica no orçamento por 12 meses; pode mudar o período antes de enviar o pedido."
        : "Valores sem IVA. Pode rever tudo no orçamento antes de enviar o pedido.";
      planosEl.innerHTML = s.planos.map((p, i) => {
        const t = precoTexto(p);
        const botao = p.chave && p.tipo !== "consulta"
          ? `<button class="btn ${p.destaque ? "btn-primary" : "btn-outline"}" type="button" data-comprar="${i}">Comprar ${esc(p.nome)}</button>`
          : `<a class="btn ${p.destaque ? "btn-primary" : "btn-outline"}" href="${linkWhatsApp(`Olá ECOMULTI! Gostaria de uma proposta para ${s.rotulo}: ${p.nome}.`)}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-whatsapp"/></svg> Pedir proposta</a>`;
        return `
        <article class="plan${p.destaque ? " featured" : ""}">
          ${p.destaque ? '<span class="ribbon">Mais popular</span>' : ""}
          <span class="tier">${esc(p.tier)}</span>
          <h3>${esc(p.nome)}</h3>
          <p class="desc">${esc(p.desc)}</p>
          <div class="price">${t.antes ? `<span class="loja-antes">${t.antes}</span>` : ""}<strong>${esc(t.valor)}</strong>${t.sufixo ? `<span>${t.sufixo}</span>` : ""}</div>
          <p class="billing">${esc(p.nota)}</p>
          <ul>${p.itens.map((x) => `<li><svg class="icon"><use href="#i-tick"/></svg> ${esc(x)}</li>`).join("")}</ul>
          ${botao}
        </article>`;
      }).join("");
      if (!reduzir) { planosEl.classList.remove("loja-entrar"); void planosEl.offsetWidth; planosEl.classList.add("loja-entrar"); }
    }

    planosEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-comprar]");
      if (!b) return;
      const s = SERVICOS[atual], p = s.planos[Number(b.dataset.comprar)];
      const mensal = preco(p.chave);
      const total = p.tipo === "mensal" ? mensal * 12 : mensal;
      const detalhes = p.tipo === "mensal" ? [`1 ano (12 meses) × ${kz(mensal)}/mês`]
        : p.tipo === "mes" ? [`1 mês × ${kz(mensal)}/mês`] : ["Pagamento único"];
      if (s.id === "hospedagem") detalhes.unshift("Domínio: a indicar no pedido");
      Orcamento.adicionar({
        servico: s.servico, servicoLabel: s.rotulo, icon: s.icon, plano: p.nome,
        substitui: s.id === "hospedagem" ? "hospedagem:geral" : undefined,
        detalhes, total
      });
      toast(`${s.rotulo} ${p.nome} adicionado ao orçamento.`, { href: "orcamento-ecomulti.html", text: "Finalizar compra →" });
    });

    /* ---- navegação do carrossel ---- */
    function ir(i, { foco = false, hash = true } = {}) {
      atual = (i + SERVICOS.length) % SERVICOS.length;
      trilho.style.transform = `translateX(-${atual * 100}%)`;
      $$(".loja-slide", trilho).forEach((el, k) => {
        const ativo = k === atual;
        el.setAttribute("aria-hidden", String(!ativo));
        $$("a,button", el).forEach((x) => (ativo ? x.removeAttribute("tabindex") : x.setAttribute("tabindex", "-1")));
      });
      $$("button", pontos).forEach((b, k) => b.setAttribute("aria-selected", String(k === atual)));
      desenharPlanos(SERVICOS[atual]);
      if (hash) history.replaceState(null, "", "#" + SERVICOS[atual].id);
      if (foco) $(".loja-slide-texto h2", $$(".loja-slide", trilho)[atual]).focus?.();
    }
    const parar = () => { clearInterval(temporizador); temporizador = null; };
    const andar = () => { if (reduzir) return; parar(); temporizador = setInterval(() => ir(atual + 1), 7000); };

    $(".loja-seta.ant", raiz).addEventListener("click", () => { ir(atual - 1); andar(); });
    $(".loja-seta.prox", raiz).addEventListener("click", () => { ir(atual + 1); andar(); });
    pontos.addEventListener("click", (e) => { const b = e.target.closest("[data-ir]"); if (b) { ir(Number(b.dataset.ir)); andar(); } });
    raiz.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { ir(atual - 1); andar(); }
      if (e.key === "ArrowRight") { ir(atual + 1); andar(); }
    });
    raiz.addEventListener("mouseenter", parar);
    raiz.addEventListener("mouseleave", andar);
    raiz.addEventListener("focusin", parar);

    // deslizar com o dedo
    let x0 = null;
    trilho.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; parar(); }, { passive: true });
    trilho.addEventListener("touchend", (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) ir(atual + (dx < 0 ? 1 : -1));
      andar();
    });

    raiz.addEventListener("click", (e) => {
      if (!e.target.closest("[data-ir-planos]")) return;
      e.preventDefault(); parar();
      $("#planos").scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "start" });
    });

    const inicial = SERVICOS.findIndex((s) => "#" + s.id === location.hash);
    ir(inicial >= 0 ? inicial : 0, { hash: inicial >= 0 });
    addEventListener("hashchange", () => { const k = SERVICOS.findIndex((s) => "#" + s.id === location.hash); if (k >= 0 && k !== atual) ir(k, { hash: false }); });
    andar();
  }

  document.addEventListener("eco:pronto", iniciar);
})();
