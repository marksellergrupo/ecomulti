<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Painel do assistente | ECOMULTI</title>
  <link rel="icon" href="assets/img/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/css/style.css">
  <style>
    body { background: var(--bg-soft); }
    .pn { max-width: 1000px; margin: 0 auto; padding: 28px 16px 60px; }
    .pn-topo { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
    .pn-topo img { height: 40px; width: auto; }
    .pn h1 { font-size: 1.4rem; margin: 0; color: var(--ink); }
    .pn-entrar { max-width: 420px; margin: 60px auto; background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 24px; box-shadow: var(--shadow); }
    .pn-entrar input { width: 100%; padding: 12px; border: 1px solid var(--line-strong); border-radius: 10px; font: inherit; margin: 10px 0 14px; }
    .pn-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
    .pn-tabs button { border: 1px solid var(--line-strong); background: #fff; border-radius: 999px; padding: 8px 14px; font: inherit; font-weight: 700; cursor: pointer; }
    .pn-tabs button[aria-pressed="true"] { background: var(--blue); color: #fff; border-color: var(--blue); }
    .pn-item { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin-bottom: 10px; }
    .pn-item header { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-weight: 800; color: var(--ink); }
    .pn-item small { color: var(--muted); font-weight: 600; }
    .pn-item pre { white-space: pre-wrap; font: inherit; font-size: 0.9rem; color: var(--text); margin: 10px 0; background: var(--bg-soft); padding: 12px; border-radius: 10px; }
    .pn-acc { display: flex; gap: 8px; flex-wrap: wrap; }
    .pn-vazio { color: var(--muted); padding: 30px 0; text-align: center; }
    .pn-erro { color: var(--err); font-weight: 700; }
  </style>
</head>
<body>
  <main class="pn">
    <div class="pn-topo">
      <img src="assets/img/logo-ecomulti.png" alt="ECOMULTI" width="520" height="158">
      <h1>Painel do assistente</h1>
      <button class="btn btn-sm btn-outline" id="sair" hidden type="button">Sair</button>
    </div>

    <form class="pn-entrar" id="entrar">
      <label for="chave"><strong>Chave de acesso</strong></label>
      <input id="chave" type="password" autocomplete="current-password" required minlength="12">
      <button class="btn btn-primary btn-block" type="submit">Entrar</button>
      <p class="pn-erro" id="erro" role="alert"></p>
    </form>

    <section id="dados" hidden>
      <div class="pn-tabs">
        <button type="button" data-tab="pedidos" aria-pressed="true">Pedidos</button>
        <button type="button" data-tab="avisos" aria-pressed="false">Avisos e atendimento humano</button>
        <button type="button" id="actualizar" class="btn-sm">↻ Actualizar</button>
      </div>
      <div id="lista"></div>
    </section>
  </main>

  <script>
  (function () {
    const $ = (s) => document.querySelector(s);
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const data = (d) => new Date(d).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
    let chave = sessionStorage.getItem("ecomulti_painel") || "", tab = "pedidos", dados = null;

    async function carregar() {
      const r = await fetch("/api/painel", { headers: { authorization: "Bearer " + chave } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { sessionStorage.removeItem("ecomulti_painel"); $("#erro").textContent = j.erro || "Erro " + r.status; mostrar(false); return; }
      dados = j; sessionStorage.setItem("ecomulti_painel", chave); mostrar(true); desenhar();
    }
    function mostrar(ok) { $("#entrar").hidden = ok; $("#dados").hidden = !ok; $("#sair").hidden = !ok; }
    function wa(n) { return n ? "https://wa.me/" + String(n).replace(/\D/g, "") : ""; }
    function desenhar() {
      const L = $("#lista");
      const itens = dados[tab] || [];
      if (!itens.length) { L.innerHTML = '<p class="pn-vazio">Ainda não há registos.</p>'; return; }
      L.innerHTML = itens.map((x) => tab === "pedidos"
        ? `<article class="pn-item"><header><span>${esc(x.numero)} — ${esc(x.cliente && x.cliente.nome)}</span><small>${esc(data(x.data))} · ${esc(x.canal)}</small></header>
           <pre>${esc(x.texto)}</pre>
           <div class="pn-acc">${x.cliente && x.cliente.telefone ? `<a class="btn btn-sm btn-whatsapp" target="_blank" rel="noopener" href="${esc(wa(x.cliente.telefone))}">WhatsApp do cliente</a>` : ""}
           ${x.cliente && x.cliente.email ? `<a class="btn btn-sm btn-outline" href="mailto:${esc(x.cliente.email)}?subject=${encodeURIComponent("Pedido " + x.numero)}">E-mail</a>` : ""}</div></article>`
        : `<article class="pn-item"><header><span>${x.tipo === "pedido" ? "Novo pedido " + esc(x.numero) : "Atendimento humano — " + esc(x.motivo)}</span><small>${esc(data(x.data))} · ${esc(x.canal)}</small></header>
           <pre>${esc(x.texto)}</pre>
           ${x.whatsapp || x.contacto ? `<div class="pn-acc"><a class="btn btn-sm btn-whatsapp" target="_blank" rel="noopener" href="${esc(wa(x.whatsapp || x.contacto))}">Responder no WhatsApp</a></div>` : ""}</article>`).join("");
    }
    $("#entrar").addEventListener("submit", (e) => { e.preventDefault(); $("#erro").textContent = ""; chave = $("#chave").value.trim(); carregar(); });
    $("#sair").addEventListener("click", () => { sessionStorage.removeItem("ecomulti_painel"); chave = ""; mostrar(false); });
    $("#actualizar").addEventListener("click", carregar);
    document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
      tab = b.dataset.tab; document.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); desenhar();
    }));
    if (chave) carregar();
  })();
  </script>
</body>
</html>
