/* =====================================================================
   ECOMULTI — verificação de domínios
   .com/.net/.org → RDAP oficial (Verisign / PIR)
   .ao/.co.ao     → DNS público (Cloudflare). É indicativo: a confirmação
                    final é sempre feita junto do registador oficial.
   ===================================================================== */
(function () {
  "use strict";
  const { preco, kz, Orcamento, toast } = window.EcoApp;

  const EXTENSOES = [".ao", ".co.ao", ".it.ao", ".edu.ao", ".org.ao", ".com", ".net", ".org"];
  const RDAP = {
    ".com": "https://rdap.verisign.com/com/v1/domain/",
    ".net": "https://rdap.verisign.com/net/v1/domain/",
    ".org": "https://rdap.publicinterestregistry.org/rdap/domain/"
  };
  const ESTADOS = {
    loading: "A verificar…",
    free: "Disponível",
    probable: "Provavelmente disponível",
    taken: "Já registado",
    unknown: "Confirmamos por si",
    error: "Confirmamos por si"
  };
  const cache = new Map();

  const normalizar = (raw) => String(raw || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
    .replace(/\.(co\.ao|it\.ao|edu\.ao|org\.ao|ao|com|net|org)$/, "")
    .replace(/\s+/g, "");
  const valido = (n) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(n);
  const precoExt = (ext) => preco("dominio" + ext);

  function pedido(url, headers) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    return fetch(url, { headers, signal: c.signal }).finally(() => clearTimeout(t));
  }
  async function viaRdap(dom, ext) {
    const r = await pedido(RDAP[ext] + encodeURIComponent(dom), { accept: "application/rdap+json" });
    if (r.status === 404) return "free";
    if (r.ok) return "taken";
    throw new Error("rdap");
  }
  async function viaDns(dom) {
    const r = await pedido(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(dom)}&type=NS`, { accept: "application/dns-json" });
    if (!r.ok) throw new Error("dns");
    const j = await r.json();
    if (j.Status === 3) return "probable";
    if (j.Answer && j.Answer.length) return "taken";
    return "unknown";
  }
  async function verificar(nome, ext) {
    const dom = nome + ext;
    if (cache.has(dom)) return cache.get(dom);
    let estado;
    try {
      if (RDAP[ext]) { try { estado = await viaRdap(dom, ext); } catch { estado = await viaDns(dom); } }
      else estado = await viaDns(dom);
    } catch { return "error"; }
    cache.set(dom, estado);
    return estado;
  }

  function adicionar(dominio, ext) {
    Orcamento.adicionar({
      servico: "dominio", servicoLabel: "Registo de domínio", icon: "globe",
      plano: dominio, detalhes: ["Registo por 1 ano", "Disponibilidade confirmada pela ECOMULTI antes do registo"],
      total: precoExt(ext)
    });
    toast(`${dominio} adicionado ao orçamento.`, { href: "orcamento-ecomulti.html", text: "Ver orçamento →" });
  }

  /* -------- UI: liga um formulário de pesquisa a uma caixa de resultados -------- */
  function ligar({ form, nomeInput, extSelect, resultado, mostrarLinkTodas = true, auto = true }) {
    if (!form) return;
    let timer, ultimaPesquisa = 0;

    async function pesquisar() {
      const nome = normalizar(nomeInput.value);
      resultado.hidden = false;
      if (!nome) { resultado.hidden = true; resultado.replaceChildren(); return; }
      if (!valido(nome)) {
        resultado.innerHTML = '<div class="dr-msg">Use apenas letras, números e hífen — sem espaços, acentos ou símbolos, e sem hífen no início ou no fim.</div>';
        return;
      }
      try { sessionStorage.setItem("ecomulti_ultimo_dominio", nome); } catch {}
      const id = ++ultimaPesquisa;
      const escolhida = extSelect ? extSelect.value : ".ao";
      const ordem = [escolhida, ...EXTENSOES.filter((e) => e !== escolhida)];

      const lista = document.createElement("div");
      lista.className = "dr-list";
      const linhas = ordem.map((ext, i) => {
        const row = document.createElement("div");
        row.className = "dr-row" + (i === 0 ? " main" : "");
        row.style.setProperty("--d", i * 0.05 + "s");
        row.dataset.state = "loading";
        row.innerHTML =
          '<div class="dr-meta"><span class="dr-name"></span><span class="dr-price"></span></div>' +
          '<span class="dr-status"><span class="dr-dot"></span><span class="st"></span></span>' +
          '<button type="button" class="btn btn-sm btn-primary dr-action" hidden>Adicionar</button>';
        row.querySelector(".dr-name").textContent = nome + ext;
        row.querySelector(".dr-price").textContent = kz(precoExt(ext)) + " / ano";
        row.querySelector(".st").textContent = ESTADOS.loading;
        lista.append(row);
        return { row, ext };
      });
      const nota = document.createElement("p");
      nota.className = "dr-note";
      nota.innerHTML = "Verificação automática e indicativa: confirmamos sempre junto do registador oficial antes de registar." +
        (mostrarLinkTodas ? ` <a href="dominios.html?nome=${encodeURIComponent(nome)}">Ver preços e detalhes →</a>` : "");
      resultado.replaceChildren(lista, nota);

      await Promise.all(linhas.map(async ({ row, ext }) => {
        const estado = await verificar(nome, ext);
        if (id !== ultimaPesquisa) return;
        row.dataset.state = estado;
        row.querySelector(".st").textContent = ESTADOS[estado];
        const btn = row.querySelector(".dr-action");
        if (estado !== "taken") {
          btn.hidden = false;
          btn.onclick = () => { adicionar(nome + ext, ext); btn.textContent = "Adicionado ✓"; btn.classList.replace("btn-primary", "btn-outline"); };
        }
      }));
    }

    form.addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(timer); pesquisar(); });
    if (auto) nomeInput.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(pesquisar, 750); });
    if (extSelect) extSelect.addEventListener("change", () => { if (nomeInput.value.trim()) pesquisar(); });
    return { pesquisar };
  }

  window.Dominios = { EXTENSOES, normalizar, valido, verificar, ligar, adicionar, precoExt };
})();
