/* ============================================================
   dominio-checker.js
   Motor partilhado de verificação de domínios.
   Usa RDAP (para .com/.net/.org) e DNS-over-HTTPS (Cloudflare)
   como fallback. Expõe window.DominioChecker.

   Uso:
     DominioChecker.verificar("minhaempresa", ".ao")
       → Promise<"free" | "probable" | "taken" | "unknown" | "error">
     DominioChecker.verificarVarias("minhaempresa", [".ao", ".com"])
       → Promise<[{ ext, dominio, estado }, ...]>
     DominioChecker.ultimoNome()      → string | null
     DominioChecker.guardarUltimoNome("minhaempresa")
     DominioChecker.precoDe(".ao")    → number (Kz)
   ============================================================ */
(function () {
  "use strict";

  const EXTENSOES = [".ao", ".co.ao", ".com", ".net", ".org"];
  const GENERICAS = new Set([".com", ".net", ".org"]);

  // Preços actuais: vêm do api/catalogo.php, carregado antes deste ficheiro
  const PRECOS = Object.fromEntries(EXTENSOES.map((ext) => [ext, window.precoDe("dominio" + ext)]));

  const RDAP = {
    ".com": "https://rdap.verisign.com/com/v1/domain/",
    ".net": "https://rdap.verisign.com/net/v1/domain/",
    ".org": "https://rdap.publicinterestregistry.org/rdap/domain/"
  };

  const ESTADOS = {
    free:     "Disponível",
    probable: "Provavelmente disponível",
    taken:    "Indisponível",
    unknown:  "Sem confirmação automática",
    error:    "Não foi possível verificar agora"
  };

  const cache = new Map();
  const SESSION_KEY = "ecomulti_ultimo_dominio";

  /* ---------- Helpers ---------- */
  function normalizarNome(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/\s+/g, "");
  }

  function nomeValido(nome) {
    return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(nome);
  }

  function pedido(url, headers) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    return fetch(url, { headers, signal: c.signal }).finally(() => clearTimeout(t));
  }

  /* ---------- RDAP ---------- */
  async function viaRdap(dominio, ext) {
    const base = RDAP[ext];
    if (!base) throw new Error("rdap-sem-suporte");
    const r = await pedido(base + encodeURIComponent(dominio), {
      accept: "application/rdap+json"
    });
    if (r.status === 404) return "free";
    if (r.ok) return "taken";
    throw new Error("rdap-erro");
  }

  /* ---------- DNS-over-HTTPS (Cloudflare) ---------- */
  async function viaDns(dominio) {
    const r = await pedido(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(dominio)}&type=NS`,
      { accept: "application/dns-json" }
    );
    if (!r.ok) throw new Error("dns-erro");
    const j = await r.json();
    if (j.Status === 3) return "probable";      // NXDOMAIN
    if (j.Answer && j.Answer.length) return "taken";
    return "unknown";
  }

  /* ---------- Verificação individual ---------- */
  async function verificar(nome, ext) {
    nome = normalizarNome(nome);
    if (!nome || !nomeValido(nome)) return "error";

    const dominio = nome + ext;
    if (cache.has(dominio)) return cache.get(dominio);

    let estado;
    try {
      if (GENERICAS.has(ext)) {
        try { estado = await viaRdap(dominio, ext); }
        catch { estado = await viaDns(dominio); }
      } else {
        estado = await viaDns(dominio);
      }
    } catch {
      return "error";
    }
    cache.set(dominio, estado);
    return estado;
  }

  /* ---------- Verificação em lote ---------- */
  async function verificarVarias(nome, listaExt) {
    const exts = Array.isArray(listaExt) && listaExt.length ? listaExt : EXTENSOES;
    return Promise.all(
      exts.map(async (ext) => ({
        ext,
        dominio: nome + ext,
        estado: await verificar(nome, ext),
        preco: PRECOS[ext] || 0
      }))
    );
  }

  /* ---------- Session storage (último nome) ---------- */
  function guardarUltimoNome(nome) {
    try { sessionStorage.setItem(SESSION_KEY, nome); } catch {}
  }
  function ultimoNome() {
    try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
  }

  function precoDe(ext) {
    return PRECOS[ext] || 0;
  }

  /* ---------- API pública ---------- */
  window.DominioChecker = {
    EXTENSOES,
    ESTADOS,
    PRECOS,
    normalizarNome,
    nomeValido,
    verificar,
    verificarVarias,
    guardarUltimoNome,
    ultimoNome,
    precoDe
  };
})();