/* =====================================================================
   ECOMULTI — Blog
   Serve três sítios, conforme os elementos existentes na página:
     #blogApp               listagem (blog.html): pesquisa, categorias, destaque, "mostrar mais"
     #artigoApp             artigo (artigo.html?slug=...): índice, progresso, partilha, relacionados
     [data-blog-latest="3"] últimas notícias (página inicial)
   Os artigos vêm de blog/posts.json (exemplos / cópia de segurança) e da API /api/blog
   (gerida em blog-admin.html). A API tem prioridade; artigos "rascunho"/"arquivado" ficam ocultos.
   ===================================================================== */
(function () {
  "use strict";
  const CFG = window.ECOMULTI || {};
  const EMP = CFG.empresa || {};
  const BLOG = CFG.blog || {};
  const ENDPOINT = BLOG.endpoint || "/api/blog";
  const FICHEIRO = BLOG.ficheiro || "blog/posts.json";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const slugify = (s) => sem(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

  /* ---------------------------------------------------------------
     DADOS
     --------------------------------------------------------------- */
  async function buscar(url, ms = 5000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; } finally { clearTimeout(t); }
  }
  const hoje = () => new Date().toISOString().slice(0, 10);

  /* devolve os artigos publicados (data <= hoje), do mais recente para o mais antigo */
  async function carregarPosts(opcoes = {}) {
    const [est, api] = await Promise.all([buscar(FICHEIRO), buscar(ENDPOINT)]);
    const mapa = new Map();
    ((est && est.posts) || []).forEach((p) => p && p.slug && mapa.set(p.slug, { ...p, fonte: "ficheiro" }));
    ((api && api.posts) || []).forEach((p) => p && p.slug && mapa.set(p.slug, { ...p, fonte: "api" }));
    let lista = [...mapa.values()];
    if (!opcoes.todos) lista = lista.filter((p) => p.estado === "publicado" && p.titulo && (p.data || "") <= hoje());
    return lista.sort((a, b) => (b.data || "").localeCompare(a.data || "") || a.titulo.localeCompare(b.titulo));
  }

  /* ---------------------------------------------------------------
     FORMATAÇÃO
     --------------------------------------------------------------- */
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  function dataLonga(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : "";
  }
  const minutos = (p) => Math.max(1, Math.round(String((p.conteudo || "") + " " + (p.resumo || "")).split(/\s+/).filter(Boolean).length / 200));

  /* categorias conhecidas: ícone e tom (hue) da capa; as outras recebem um tom calculado */
  const CATEGORIAS = {
    "Notícias da empresa": { icon: "rocket", h: 225 }, "Domínios": { icon: "globe", h: 200 }, "Hospedagem": { icon: "server", h: 250 },
    "E-mail": { icon: "mail", h: 215 }, "Websites": { icon: "code", h: 235 }, "Automação e IA": { icon: "spark", h: 190 },
    "Dicas": { icon: "card", h: 18 }, "VPS": { icon: "cpu", h: 205 }
  };
  function estiloCat(nome) {
    if (CATEGORIAS[nome]) return CATEGORIAS[nome];
    let h = 0; for (const c of String(nome)) h = (h * 31 + c.charCodeAt(0)) % 360;
    return { icon: "file", h };
  }
  const urlArtigo = (p) => "artigo.html?slug=" + encodeURIComponent(p.slug);

  function capa(p, classe = "") {
    const c = estiloCat(p.categoria);
    const img = p.imagem ? `<img src="${esc(p.imagem)}" alt="" loading="lazy" onerror="this.remove()">` : "";
    return `<div class="b-cover ${classe}" style="--h:${c.h}" aria-hidden="true">${img}<svg class="icon b-cover-ico"><use href="#i-${c.icon}"/></svg><span class="b-cover-cat">${esc(p.categoria)}</span></div>`;
  }
  function cartao(p, i = 0, grande = false) {
    return `<article class="b-card${grande ? " b-card-hero" : ""}" style="--d:${Math.min(i, 8) * 0.05}s">
      <a class="b-card-link" href="${urlArtigo(p)}" aria-label="${esc(p.titulo)}"></a>
      ${capa(p)}
      <div class="b-card-body">
        <span class="b-pill" style="--h:${estiloCat(p.categoria).h}">${esc(p.categoria)}</span>
        <h3>${esc(p.titulo)}</h3>
        <p>${esc(p.resumo)}</p>
        <div class="b-meta"><span>${esc(dataLonga(p.data))}</span><span aria-hidden="true">·</span><span>${minutos(p)} min de leitura</span></div>
      </div>
    </article>`;
  }

  /* ---------------------------------------------------------------
     MARKDOWN SIMPLES (seguro: o HTML é sempre escapado primeiro)
     ## título · ### subtítulo · - lista · 1. lista numerada · > citação · --- linha
     **negrito** · *itálico* · [texto](endereço) · ![descrição](imagem)
     --------------------------------------------------------------- */
  const urlSegura = (u) => /^(https?:\/\/|mailto:|#|\/|[\w./-]+\.html(#[\w-]*)?$|index\.html#)/i.test(u) && !/^\s*javascript:/i.test(u);
  const imgSegura = (u) => /^(https:\/\/|assets\/img\/)/.test(u);
  function inline(t) {
    return esc(t)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => imgSegura(u.replace(/&amp;/g, "&")) ? `<img src="${u}" alt="${alt}" loading="lazy">` : m)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, u) => {
        if (!urlSegura(u.replace(/&amp;/g, "&"))) return txt;
        const ext = /^https?:/i.test(u);
        return `<a href="${u}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${txt}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }
  function renderMd(md) {
    const linhas = String(md || "").replace(/\r/g, "").split("\n");
    const out = [], toc = [], usados = new Set();
    let par = [], lista = null;
    const fechaPar = () => { if (par.length) { out.push(`<p>${inline(par.join(" "))}</p>`); par = []; } };
    const fechaLista = () => { if (lista) { out.push(`<${lista.t}>${lista.i.map((x) => `<li>${inline(x)}</li>`).join("")}</${lista.t}>`); lista = null; } };
    for (const l of linhas) {
      const t = l.trim();
      let m;
      if (!t) { fechaPar(); fechaLista(); continue; }
      if ((m = /^(#{2,3})\s+(.+)$/.exec(t))) {
        fechaPar(); fechaLista();
        let id = slugify(m[2]) || "secao", k = 2; const base = id;
        while (usados.has(id)) id = base + "-" + k++;
        usados.add(id);
        const nivel = m[1].length;
        toc.push({ id, texto: m[2].replace(/[*`]/g, ""), nivel });
        out.push(`<h${nivel} id="${id}">${inline(m[2])}</h${nivel}>`);
      } else if (/^(-{3,}|\*{3,})$/.test(t)) { fechaPar(); fechaLista(); out.push("<hr>"); }
      else if ((m = /^>\s?(.*)$/.exec(t))) { fechaPar(); fechaLista(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
      else if ((m = /^[-*]\s+(.+)$/.exec(t))) { fechaPar(); if (!lista || lista.t !== "ul") { fechaLista(); lista = { t: "ul", i: [] }; } lista.i.push(m[1]); }
      else if ((m = /^\d+[.)]\s+(.+)$/.exec(t))) { fechaPar(); if (!lista || lista.t !== "ol") { fechaLista(); lista = { t: "ol", i: [] }; } lista.i.push(m[1]); }
      else if (/^!\[[^\]]*\]\([^)\s]+\)$/.test(t)) { fechaPar(); fechaLista(); out.push(`<figure>${inline(t)}</figure>`); }
      else { fechaLista(); par.push(t); }
    }
    fechaPar(); fechaLista();
    return { html: out.join("\n"), toc };
  }

  function metaTag(sel, attr, valor) {
    let el = $(sel);
    if (!el) { el = document.createElement("meta"); const m = /\[(name|property)="([^"]+)"\]/.exec(sel); if (m) el.setAttribute(m[1], m[2]); document.head.append(el); }
    el.setAttribute(attr, valor);
  }

  /* ---------------------------------------------------------------
     LISTAGEM
     --------------------------------------------------------------- */
  const POR_PAGINA = 9;
  async function iniciarListagem(raiz) {
    const grelha = $("#blogGrelha"), chips = $("#blogCats"), busca = $("#blogBusca"), contador = $("#blogContador"), mais = $("#blogMais"), destaque = $("#blogDestaque"), vazio = $("#blogVazio");
    const q0 = new URLSearchParams(location.search);
    const estado = { q: q0.get("q") || "", cat: q0.get("cat") || "", pag: 1 };
    busca.value = estado.q;

    const posts = await carregarPosts();
    raiz.removeAttribute("aria-busy");
    if (!posts.length) {
      grelha.innerHTML = ""; vazio.hidden = false;
      vazio.querySelector("h3").textContent = "Ainda não há artigos publicados";
      vazio.querySelector("p").textContent = "Volte em breve — estamos a preparar novidades.";
      vazio.querySelector("button").hidden = true; chips.hidden = true; contador.textContent = "";
      return;
    }
    const cats = [...posts.reduce((m, p) => m.set(p.categoria, (m.get(p.categoria) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
    chips.innerHTML = `<button type="button" class="b-chip" data-cat="" aria-pressed="false">Todos <b>${posts.length}</b></button>` +
      cats.map(([c, n]) => `<button type="button" class="b-chip" data-cat="${esc(c)}" aria-pressed="false">${esc(c)} <b>${n}</b></button>`).join("");
    if (estado.cat && !cats.some(([c]) => c === estado.cat)) estado.cat = "";

    function filtrados() {
      const termo = sem(estado.q).trim();
      return posts.filter((p) => (!estado.cat || p.categoria === estado.cat) &&
        (!termo || sem([p.titulo, p.resumo, p.categoria, (p.tags || []).join(" "), p.conteudo].join(" ")).includes(termo)));
    }
    function desenhar() {
      const lista = filtrados();
      $$(".b-chip", chips).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === estado.cat)));
      const filtrando = !!(estado.q.trim() || estado.cat);
      // destaque só quando não há filtros
      let resto = lista;
      destaque.innerHTML = "";
      if (!filtrando) {
        const d = posts.find((p) => p.destaque) || posts[0];
        destaque.innerHTML = cartao(d, 0, true);
        resto = lista.filter((p) => p !== d);
      }
      const visiveis = resto.slice(0, estado.pag * POR_PAGINA);
      grelha.innerHTML = visiveis.map((p, i) => cartao(p, i)).join("");
      mais.hidden = visiveis.length >= resto.length;
      mais.textContent = `Mostrar mais artigos (${resto.length - visiveis.length})`;
      vazio.hidden = lista.length > 0;
      contador.textContent = filtrando ? `${lista.length} ${lista.length === 1 ? "artigo encontrado" : "artigos encontrados"}` : `${posts.length} ${posts.length === 1 ? "artigo" : "artigos"}`;
      const p = new URLSearchParams(); if (estado.q.trim()) p.set("q", estado.q.trim()); if (estado.cat) p.set("cat", estado.cat);
      history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""));
    }
    chips.addEventListener("click", (e) => { const b = e.target.closest(".b-chip"); if (!b) return; estado.cat = b.dataset.cat; estado.pag = 1; desenhar(); });
    let t; busca.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { estado.q = busca.value; estado.pag = 1; desenhar(); }, 120); });
    mais.addEventListener("click", () => { estado.pag++; desenhar(); });
    vazio.querySelector("button").addEventListener("click", () => { estado.q = ""; estado.cat = ""; busca.value = ""; estado.pag = 1; desenhar(); busca.focus(); });
    document.addEventListener("keydown", (e) => { if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); busca.focus(); } });
    desenhar();
  }

  /* ---------------------------------------------------------------
     ARTIGO
     --------------------------------------------------------------- */
  const GOSTOU = "ecomulti_blog_util";
  function lerUteis() { try { return JSON.parse(localStorage.getItem(GOSTOU) || "{}"); } catch { return {}; } }
  function gravarUtil(slug, v) { try { const o = lerUteis(); o[slug] = v; localStorage.setItem(GOSTOU, JSON.stringify(o)); } catch {} }

  async function iniciarArtigo(raiz) {
    const slug = new URLSearchParams(location.search).get("slug") || "";
    const posts = await carregarPosts();
    const p = posts.find((x) => x.slug === slug);
    raiz.removeAttribute("aria-busy");
    if (!p) {
      raiz.innerHTML = `<div class="container b-notfound"><div class="cart-empty"><span class="ico"><svg class="icon"><use href="#i-search"/></svg></span><h2>Artigo não encontrado</h2><p>Este artigo pode ter sido movido ou já não está disponível.</p><a class="btn btn-primary" href="blog.html">Ver todos os artigos</a></div></div>`;
      document.title = "Artigo não encontrado | Blog ECOMULTI"; metaTag('meta[name="robots"]', "content", "noindex");
      return;
    }
    const { html, toc } = renderMd(p.conteudo);
    const base = location.origin + location.pathname.replace(/[^/]*$/, "");
    const link = base + "artigo.html?slug=" + encodeURIComponent(p.slug);

    /* SEO / partilha */
    document.title = p.titulo + " | Blog ECOMULTI";
    metaTag('meta[name="description"]', "content", p.resumo || p.titulo);
    metaTag('meta[property="og:title"]', "content", p.titulo);
    metaTag('meta[property="og:description"]', "content", p.resumo || "");
    metaTag('meta[property="og:url"]', "content", link);
    metaTag('meta[property="og:type"]', "content", "article");
    if (p.imagem && /^https:/.test(p.imagem)) metaTag('meta[property="og:image"]', "content", p.imagem);
    let canon = $('link[rel="canonical"]'); if (!canon) { canon = document.createElement("link"); canon.rel = "canonical"; document.head.append(canon); } canon.href = link;
    const ld = document.createElement("script"); ld.type = "application/ld+json";
    ld.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "BlogPosting", headline: p.titulo, description: p.resumo, datePublished: p.data, dateModified: p.actualizado || p.data, author: { "@type": "Organization", name: p.autor || "ECOMULTI" }, publisher: { "@type": "Organization", name: "ECOMULTI", logo: { "@type": "ImageObject", url: "https://www.ecomulti.ao/assets/img/logo-ecomulti.png" } }, mainEntityOfPage: link, inLanguage: "pt-AO" });
    document.head.append(ld);

    const textoWa = `${p.titulo} — ${link}`;
    const partilha = `
      <div class="b-share" role="group" aria-label="Partilhar este artigo">
        <span class="b-share-t">Partilhar</span>
        <a class="b-share-b wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(textoWa)}" aria-label="Partilhar no WhatsApp"><svg class="icon"><use href="#i-whatsapp"/></svg><span>WhatsApp</span></a>
        <a class="b-share-b" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}" aria-label="Partilhar no Facebook"><svg class="icon"><use href="#i-facebook"/></svg><span>Facebook</span></a>
        <a class="b-share-b" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}" aria-label="Partilhar no LinkedIn"><svg class="icon"><use href="#i-linkedin"/></svg><span>LinkedIn</span></a>
        <button class="b-share-b" type="button" data-copiar aria-label="Copiar ligação"><svg class="icon"><use href="#i-file"/></svg><span>Copiar link</span></button>
      </div>`;

    const relacionados = posts.filter((x) => x.slug !== p.slug)
      .map((x) => ({ x, s: (x.categoria === p.categoria ? 3 : 0) + (x.tags || []).filter((t) => (p.tags || []).includes(t)).length }))
      .sort((a, b) => b.s - a.s || (b.x.data || "").localeCompare(a.x.data || "")).slice(0, 3).map((o) => o.x);

    raiz.innerHTML = `
      <section class="hero page-hero b-art-hero">
        <div class="container">
          <nav class="crumbs" aria-label="Caminho"><a href="index.html">Início</a><span aria-hidden="true">/</span><a href="blog.html">Blog</a><span aria-hidden="true">/</span><a href="blog.html?cat=${encodeURIComponent(p.categoria)}">${esc(p.categoria)}</a></nav>
          <span class="b-pill on-dark" style="--h:${estiloCat(p.categoria).h}">${esc(p.categoria)}</span>
          <h1>${esc(p.titulo)}</h1>
          <p class="lead">${esc(p.resumo)}</p>
          <div class="b-meta on-dark"><span>Por ${esc(p.autor || "Equipa ECOMULTI")}</span><span aria-hidden="true">·</span><time datetime="${esc(p.data)}">${esc(dataLonga(p.data))}</time><span aria-hidden="true">·</span><span>${minutos(p)} min de leitura</span></div>
        </div>
      </section>
      <section class="b-art-sec">
        <div class="container b-art-grid">
          <article class="b-art" id="artigoCorpo">
            ${p.imagem ? `<figure class="b-art-img"><img src="${esc(p.imagem)}" alt="" onerror="this.parentNode.remove()"></figure>` : ""}
            <div class="b-prose">${html}</div>
            ${(p.tags || []).length ? `<div class="b-tags" aria-label="Etiquetas">${p.tags.map((t) => `<a href="blog.html?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join("")}</div>` : ""}
            ${partilha}
            <div class="b-util" id="bUtil">
              <strong>Este artigo foi útil?</strong>
              <div><button type="button" data-v="sim">👍 Sim</button><button type="button" data-v="nao">👎 Não</button></div>
              <p class="b-util-msg" role="status" aria-live="polite"></p>
            </div>
          </article>
          <aside class="b-aside">
            ${toc.length > 1 ? `<nav class="b-toc" aria-label="Neste artigo"><h4>Neste artigo</h4><ol>${toc.map((h) => `<li class="n${h.nivel}"><a href="#${h.id}">${esc(h.texto)}</a></li>`).join("")}</ol></nav>` : ""}
            <div class="b-aside-nl nl-card">
              <h3>Receba as novidades</h3>
              <p class="sub">Novos artigos e avisos directamente no seu e-mail.</p>
              <div data-newsletter="artigo" data-compact></div>
            </div>
            <a class="b-aside-wa" data-wa="Olá ECOMULTI! Li o artigo “${esc(p.titulo)}” e gostaria de falar convosco." href="#"><svg class="icon"><use href="#i-whatsapp"/></svg><span><strong>Ficou com dúvidas?</strong><small>Fale com a nossa equipa</small></span></a>
          </aside>
        </div>
      </section>
      ${relacionados.length ? `<section class="section-soft b-rel"><div class="container"><div class="section-head"><span class="eyebrow">Continue a ler</span><h2>Artigos relacionados</h2></div><div class="b-grid">${relacionados.map((x, i) => cartao(x, i)).join("")}</div></div></section>` : ""}`;

    /* ligações do WhatsApp (data-wa) e newsletter criadas depois do arranque da página */
    $$("a[data-wa]", raiz).forEach((a) => { if (EMP.whatsapp) { a.href = "https://wa.me/" + EMP.whatsapp + "?text=" + encodeURIComponent(a.dataset.wa); a.target = "_blank"; a.rel = "noopener"; } else a.remove(); });
    document.dispatchEvent(new Event("eco:newsletter"));

    /* copiar link / partilha nativa no telemóvel */
    const copiar = $("[data-copiar]", raiz);
    copiar.addEventListener("click", async () => {
      try { if (navigator.share && matchMedia("(pointer:coarse)").matches) { await navigator.share({ title: p.titulo, text: p.resumo, url: link }); return; } } catch { return; }
      try { await navigator.clipboard.writeText(link); } catch { const t = document.createElement("textarea"); t.value = link; document.body.append(t); t.select(); try { document.execCommand("copy"); } catch {} t.remove(); }
      const s = $("span", copiar); s.textContent = "Link copiado!"; if (window.EcoApp) window.EcoApp.toast("Ligação copiada."); setTimeout(() => (s.textContent = "Copiar link"), 2200);
    });

    /* "foi útil?" */
    const util = $("#bUtil"), msgU = $(".b-util-msg", util), anterior = lerUteis()[p.slug];
    const agradecer = (v) => {
      $$("button", util).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
      msgU.innerHTML = v === "sim" ? "Obrigado! Fico contente por ter ajudado." : 'Obrigado pelo seu feedback. Diga-nos o que faltou <a data-wa-util href="#">por WhatsApp</a> e melhoramos o artigo.';
      const a = $("[data-wa-util]", msgU); if (a) { if (EMP.whatsapp) { a.href = "https://wa.me/" + EMP.whatsapp + "?text=" + encodeURIComponent(`Olá ECOMULTI! Sobre o artigo “${p.titulo}”: `); a.target = "_blank"; a.rel = "noopener"; } }
    };
    if (anterior) agradecer(anterior);
    util.addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (!b) return; gravarUtil(p.slug, b.dataset.v); agradecer(b.dataset.v); });

    /* barra de progresso de leitura + índice com destaque da secção actual */
    const barra = document.createElement("div"); barra.className = "b-progress"; barra.setAttribute("aria-hidden", "true"); barra.innerHTML = "<i></i>"; document.body.append(barra);
    const corpo = $("#artigoCorpo"), fill = $("i", barra);
    const ligacoes = new Map($$(".b-toc a", raiz).map((a) => [a.getAttribute("href").slice(1), a]));
    const titulos = toc.map((h) => document.getElementById(h.id)).filter(Boolean);
    function aoRolar() {
      const r = corpo.getBoundingClientRect(), total = r.height - innerHeight * 0.6;
      fill.style.transform = `scaleX(${Math.min(1, Math.max(0, total > 0 ? -r.top / total : 0))})`;
      let activo = null; for (const h of titulos) { if (h.getBoundingClientRect().top < 140) activo = h.id; }
      ligacoes.forEach((a, id) => a.classList.toggle("on", id === activo));
    }
    addEventListener("scroll", aoRolar, { passive: true }); aoRolar();
  }

  /* ---------------------------------------------------------------
     ÚLTIMAS NOTÍCIAS (página inicial)
     --------------------------------------------------------------- */
  async function iniciarUltimas(el) {
    const n = Number(el.dataset.blogLatest) || 3;
    const posts = (await carregarPosts()).slice(0, n);
    const sec = el.closest("section");
    if (!posts.length) { if (sec) sec.hidden = true; return; }
    el.innerHTML = posts.map((p, i) => cartao(p, i)).join("");
  }

  window.EcoBlog = { carregarPosts, renderMd, dataLonga, minutos, estiloCat, slugify };

  function arrancar() {
    const lista = $("#blogApp"), artigo = $("#artigoApp");
    if (lista) iniciarListagem(lista);
    if (artigo) iniciarArtigo(artigo);
    $$("[data-blog-latest]").forEach(iniciarUltimas);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
