/* =====================================================================
   ECOMULTI — Dashboard administrativo (admin.html)
   Login no servidor (/api/admin) + gestão de vendas, clientes, blog e leads.
   Nenhuma credencial está neste ficheiro: a verificação é feita no servidor.
   ===================================================================== */
(function () {
  "use strict";
  const CFG = window.ECOMULTI || {};
  const API = (CFG.admin && CFG.admin.endpoint) || "/api/admin";
  const API_BLOG = (CFG.blog && CFG.blog.endpoint) || "/api/blog";
  const FICHEIRO = (CFG.blog && CFG.blog.ficheiro) || "blog/posts.json";
  const { renderMd, slugify, dataLonga } = window.EcoBlog;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const kz = (v) => new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 0 }).format(Math.round(v || 0)).replace(/\s/g, ".") + " Kz";
  const dCurta = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-AO", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
  const hoje = () => new Date().toISOString().slice(0, 10);
  const vista = $("#vista"), modal = $("#modal");
  const KT = "ecomulti_admin_token";

  let token = "", utilizador = "";
  try { token = sessionStorage.getItem(KT) || ""; } catch {}

  /* ---------------------------------------------------------------- rede */
  async function chamar(acao, dados = {}) {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify({ acao, ...dados }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && acao !== "login") sair("A sessão expirou. Entre novamente.");
      const e = new Error(j.erro || "Erro " + r.status); e.estado = r.status; throw e;
    }
    return j;
  }
  async function chamarBlog(url, opc = {}) {
    const r = await fetch(url, { ...opc, headers: { "content-type": "application/json", authorization: "Bearer " + token } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401) sair("A sessão expirou. Entre novamente."); throw new Error(j.erro || "Erro " + r.status); }
    return j;
  }

  /* ---------------------------------------------------------- utilitários */
  let toastEl, toastT;
  function aviso(msg, tipo = "ok") {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role", "status"); document.body.append(toastEl); }
    toastEl.innerHTML = '<svg class="icon"><use href="#i-' + (tipo === "ok" ? "check" : "x") + '"/></svg><span></span>';
    $("span", toastEl).textContent = msg; toastEl.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), 3200);
  }
  const carregando = () => (vista.innerHTML = '<p class="adm-vazio">A carregar…</p>');
  const falhou = (e) => (vista.innerHTML = `<p class="adm-vazio" style="color:var(--err)">${esc(e.message)}</p>`);
  function waLink(tel, texto) {
    let d = String(tel || "").replace(/\D/g, ""); if (!d) return "";
    if (d.length === 9) d = "244" + d;
    return "https://wa.me/" + d + (texto ? "?text=" + encodeURIComponent(texto) : "");
  }
  function csv(nome, linhas) {
    const c = (v) => { let s = String(v == null ? "" : v).replace(/"/g, '""'); if (/^[=@\t\r]|^[+\-](?!\d)/.test(s)) s = "'" + s; return `"${s}"`; };
    const blob = new Blob(["﻿" + linhas.map((l) => l.map(c).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome + "-" + hoje() + ".csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function abrir(html, aoSubmeter) {
    modal.innerHTML = html;
    const f = $("form", modal);
    if (f && aoSubmeter) f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = $("[type=submit]", f), er = $("[data-erro]", f);
      if (er) er.textContent = ""; if (b) b.disabled = true;
      try { if ((await aoSubmeter(f)) !== false) modal.close(); }
      catch (x) { if (er) { er.textContent = x.message; } else aviso(x.message, "err"); }
      finally { if (b) b.disabled = false; }
    });
    $$("[data-fechar]", modal).forEach((b) => b.addEventListener("click", () => modal.close()));
    modal.showModal();
    const p = $("input:not([type=hidden]), select, textarea", modal); if (p) p.focus({ preventScroll: true });
  }
  function confirmar(texto, aoConfirmar, rotulo = "Eliminar") {
    abrir(`<form><h2>Confirmar</h2><p>${esc(texto)}</p><p class="adm-msg err" data-erro></p><div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" type="submit" style="background:var(--err);box-shadow:none">${esc(rotulo)}</button></div></form>`, aoConfirmar);
  }
  const ESTADO_VENDA = { em_aberto: "Em aberto", pago: "Paga", cancelado: "Cancelada" };
  function estadoVenda(v) {
    if (v.estado === "em_aberto" && Date.now() - new Date(v.data) > 7 * 864e5) return ["atrasada", "Em aberto · atrasada"];
    return [v.estado, ESTADO_VENDA[v.estado] || v.estado];
  }
  const METODOS = ["Multicaixa Express", "Referência", "Transferência", "Numerário", "Outro"];
  const opcoes = (lista, sel) => lista.map((m) => `<option${m === sel ? " selected" : ""}>${esc(m)}</option>`).join("");

  /* ---------------------------------------------------------------- sessão */
  function mostrarApp(sim) { $("#telaLogin").hidden = sim; $("#telaApp").hidden = !sim; }
  function sair(msg) {
    token = ""; try { sessionStorage.removeItem(KT); } catch {}
    mostrarApp(false); $("#lgErro").textContent = msg || ""; $("#lgSenha").value = "";
    if (modal.open) modal.close();
  }
  $("#verSenha").addEventListener("click", (e) => {
    const i = $("#lgSenha"), v = i.type === "password"; i.type = v ? "text" : "password";
    e.currentTarget.textContent = v ? "Esconder" : "Mostrar"; e.currentTarget.setAttribute("aria-pressed", String(v));
  });
  $("#formLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#lgEmail").value.trim(), senha = $("#lgSenha").value;
    if (!email || !senha) { $("#lgErro").textContent = "Indique o e-mail e a senha."; return; }
    const b = $("#lgBtn"); b.disabled = true; b.textContent = "A entrar…"; $("#lgErro").textContent = "";
    try {
      const j = await chamar("login", { email, senha });
      token = j.token; utilizador = j.email; try { sessionStorage.setItem(KT, token); } catch {}
      $("#lgSenha").value = ""; await arrancar(j.senhaInicial);
    } catch (er) { $("#lgErro").textContent = er.message; }
    finally { b.disabled = false; b.textContent = "Entrar"; }
  });
  $("#btnSair").addEventListener("click", () => sair());

  async function arrancar(senhaInicial) {
    if (senhaInicial === undefined) { const s = await chamar("sessao"); utilizador = s.email; senhaInicial = s.senhaInicial; }
    $("#uEmail").textContent = utilizador; $("#avisoSenha").hidden = !senhaInicial;
    mostrarApp(true); ir(location.hash.slice(1) || "resumo");
    actualizarBadge();
  }
  async function actualizarBadge() {
    try { const r = await chamar("resumo"); const b = $("#nbAberto"); b.hidden = !r.aberto.n; b.textContent = r.aberto.n; } catch {}
  }

  /* ---------------------------------------------------------- navegação */
  const VISTAS = {
    resumo: { titulo: "Resumo", render: vResumo, topo: () => "" },
    vendas: { titulo: "Vendas", render: vVendas, topo: () => '<button class="btn btn-primary btn-sm" data-act="venda-nova">+ Nova venda</button>' },
    clientes: { titulo: "Clientes", render: vClientes, topo: () => '<button class="btn btn-primary btn-sm" data-act="cliente-novo">+ Novo cliente</button>' },
    subscricoes: { titulo: "Subscrições", render: vSubs, topo: () => "" },
    blog: { titulo: "Blog e secções", render: vBlog, topo: () => '<button class="btn btn-primary btn-sm" data-act="artigo-novo">+ Novo artigo</button>' },
    leads: { titulo: "Newsletter e leads", render: vLeads, topo: () => '<button class="btn btn-primary btn-sm" data-act="lead-novo">+ Novo lead</button>' },
    conta: { titulo: "Conta e segurança", render: vConta, topo: () => "" }
  };
  let actual = "";
  function ir(nome) {
    if (!VISTAS[nome]) nome = "resumo";
    actual = nome; if (location.hash.slice(1) !== nome) history.replaceState(null, "", "#" + nome);
    $$(".adm-side nav button").forEach((b) => (b.dataset.v === nome ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    $("#titulo").textContent = VISTAS[nome].titulo; $("#accoesTopo").innerHTML = VISTAS[nome].topo();
    fechaLateral(); carregando();
    Promise.resolve(VISTAS[nome].render()).catch(falhou);
    scrollTo({ top: 0 });
  }
  $(".adm-side nav").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b) ir(b.dataset.v); });
  addEventListener("hashchange", () => { if (!$("#telaApp").hidden && location.hash.slice(1) !== actual) ir(location.hash.slice(1)); });
  const fechaLateral = () => { $("#lateral").classList.remove("open"); $("#scrim").hidden = true; };
  $("#burger").addEventListener("click", () => { $("#lateral").classList.add("open"); $("#scrim").hidden = false; });
  $("#scrim").addEventListener("click", fechaLateral);

  /* cliques: todos os botões com data-act */
  const H = {};
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b || !$("#telaApp").contains(b)) return;
    const fn = H[b.dataset.act]; if (fn) fn(b.dataset.id, b);
  });

  /* ================================================================ RESUMO */
  async function vResumo() {
    const r = await chamar("resumo");
    const max = Math.max(1, ...r.serie.map((s) => s.total));
    const mesNome = (m) => ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][Number(m.slice(5)) - 1];
    vista.innerHTML = `
      <div class="adm-kpis">
        <div class="adm-kpi"><small>Recebido este mês</small><strong>${kz(r.mes.total)}</strong><span>${r.mes.n} ${r.mes.n === 1 ? "venda paga" : "vendas pagas"}</span></div>
        <div class="adm-kpi warn"><small>Em aberto (por pagar)</small><strong>${kz(r.aberto.total)}</strong><span>${r.aberto.n} ${r.aberto.n === 1 ? "venda" : "vendas"}${r.aberto.atrasadas ? ` · <span class="bad">${r.aberto.atrasadas} há mais de 7 dias</span>` : ""}</span></div>
        <div class="adm-kpi"><small>Clientes</small><strong>${r.clientes}</strong><span>${kz(r.pagoTotal)} em ${r.nPagas} vendas pagas</span></div>
        <div class="adm-kpi"><small>Leads / newsletter</small><strong>${r.leads}</strong><span>${r.leadsNovos} novos nos últimos 7 dias</span></div>
      </div>
      <div class="adm-grid2">
        <section class="adm-card"><h2>Vendas pagas — últimos 6 meses</h2>
          <div class="adm-bars" role="img" aria-label="Gráfico de vendas pagas por mês">${r.serie.map((s) => `<div class="adm-bar"><em>${s.total ? kz(s.total).replace(" Kz", "") : ""}</em><i style="height:${Math.max(2, (s.total / max) * 100)}%"></i>${mesNome(s.mes)}</div>`).join("")}</div>
        </section>
        <section class="adm-card"><h2>Últimas vendas</h2>
          ${r.recentes.length ? `<div class="adm-lista">${r.recentes.map((v) => { const [c, t] = estadoVenda(v); return `<a href="#vendas"><span><strong>${esc(v.cliente.nome)}</strong><small>${esc(v.id)} · ${dCurta(v.data)}</small></span><span style="text-align:right"><strong>${kz(v.total)}</strong><small><span class="adm-badge ${c}">${t}</span></small></span></a>`; }).join("")}</div>` : '<p class="adm-vazio">Ainda não há vendas. Clique em “Vendas” → “+ Nova venda”.</p>'}
        </section>
      </div>`;
  }

  /* ================================================================ VENDAS */
  const V = { lista: [], f: "todas", q: "" };
  async function vVendas() {
    V.lista = (await chamar("vendas.listar")).vendas;
    vista.innerHTML = `
      <div class="adm-tools"><div class="adm-pills" id="vFiltros" role="group" aria-label="Filtrar vendas"></div><span class="adm-grow"></span>
        <input type="search" id="vBusca" placeholder="Pesquisar nº, cliente, NIF…" aria-label="Pesquisar vendas" value="${esc(V.q)}"><button class="adm-b" data-act="vendas-csv">Exportar CSV</button></div>
      <div class="adm-scroll"><table class="adm-table"><thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Serviços</th><th>Pagamento</th><th class="n">Total</th><th>Estado</th><th></th></tr></thead><tbody id="vCorpo"></tbody><tfoot id="vRodape"></tfoot></table></div>`;
    $("#vBusca").addEventListener("input", (e) => { V.q = e.target.value; desenharVendas(); });
    $("#vFiltros").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) { V.f = b.dataset.f; desenharVendas(); } });
    desenharVendas();
  }
  const vendasFiltradas = () => {
    const q = V.q.trim().toLowerCase();
    return V.lista.filter((v) => (V.f === "todas" || v.estado === V.f) && (!q || [v.id, v.cliente.nome, v.cliente.nif, v.cliente.email, v.cliente.telefone].join(" ").toLowerCase().includes(q)));
  };
  function desenharVendas() {
    const n = (e) => V.lista.filter((v) => e === "todas" || v.estado === e).length;
    $("#vFiltros").innerHTML = [["todas", "Todas"], ["em_aberto", "Em aberto"], ["pago", "Pagas"], ["cancelado", "Canceladas"]]
      .map(([k, t]) => `<button class="adm-pill" data-f="${k}" aria-pressed="${V.f === k}">${t}<b>${n(k)}</b></button>`).join("");
    const l = vendasFiltradas();
    $("#vCorpo").innerHTML = l.length ? l.map((v) => {
      const [c, t] = estadoVenda(v), it = v.itens || [];
      const wa = waLink(v.cliente.telefone, `Olá ${v.cliente.nome}! Relativamente ao pedido ${v.id} (${kz(v.total)}), ainda aguardamos a confirmação do pagamento. Precisa de ajuda ou dos dados de pagamento? Estamos disponíveis. — ECOMULTI`);
      return `<tr><td><strong>${esc(v.id)}</strong><small>${esc(v.canal || "")}</small></td><td>${dCurta(v.data)}</td>
        <td><strong>${esc(v.cliente.nome)}</strong><small>${esc(v.cliente.telefone || v.cliente.email || "")}</small></td>
        <td>${esc(it[0] ? it[0].descricao : "—")}${it.length > 1 ? `<small>+ ${it.length - 1} ${it.length - 1 === 1 ? "serviço" : "serviços"}</small>` : ""}</td>
        <td>${esc(v.metodo || "—")}</td><td class="n"><strong>${kz(v.total)}</strong></td><td><span class="adm-badge ${c}">${t}</span>${v.pagoEm ? `<small>${dCurta(v.pagoEm)}</small>` : ""}</td>
        <td><div class="adm-acc">
          ${v.estado === "em_aberto" ? `<button class="adm-b ok" data-act="venda-pagar" data-id="${esc(v.id)}">Marcar paga</button>${wa ? `<a class="adm-b wa" href="${esc(wa)}" target="_blank" rel="noopener">Cobrar</a>` : ""}` : `<button class="adm-b" data-act="venda-reabrir" data-id="${esc(v.id)}">Reabrir</button>`}
          ${v.estado === "pago" ? (v.vintei && v.vintei.pacoteId ? `<span class="adm-badge pago" title="Pacote ${esc(v.vintei.pacoteId)} · ${esc(v.vintei.dominio)}">20i ✔</span>` : `<button class="adm-b ok" data-act="venda-20i" data-id="${esc(v.id)}">Activar na 20i</button>`) : ""}
          <button class="adm-b" data-act="venda-ver" data-id="${esc(v.id)}">Ver</button><button class="adm-b" data-act="venda-editar" data-id="${esc(v.id)}">Editar</button><button class="adm-b del" data-act="venda-apagar" data-id="${esc(v.id)}">Eliminar</button></div></td></tr>`;
    }).join("") : '<tr><td colspan="8" class="adm-vazio">Nenhuma venda encontrada.</td></tr>';
    $("#vRodape").innerHTML = l.length ? `<tr><td colspan="5">${l.length} ${l.length === 1 ? "venda" : "vendas"}</td><td class="n">${kz(l.reduce((t, v) => t + v.total, 0))}</td><td colspan="2"></td></tr>` : "";
  }
  const vendaPorId = (id) => V.lista.find((v) => v.id === id);

  H["venda-ver"] = (id) => {
    const v = vendaPorId(id); if (!v) return; const [c, t] = estadoVenda(v), cl = v.cliente;
    abrir(`<div class="adm-md"><h2>Venda ${esc(v.id)}</h2><div class="adm-det"><dl>
      <dt>Estado</dt><dd><span class="adm-badge ${c}">${t}</span></dd><dt>Data</dt><dd>${dCurta(v.data)}</dd>${v.pagoEm ? `<dt>Pago em</dt><dd>${dCurta(v.pagoEm)}</dd>` : ""}
      <dt>Cliente</dt><dd>${esc(cl.nome)} (${esc(cl.tipo)})</dd><dt>Contacto</dt><dd>${esc(cl.telefone || "—")} · ${esc(cl.email || "—")}</dd>${cl.nif ? `<dt>NIF</dt><dd>${esc(cl.nif)}</dd>` : ""}${cl.morada ? `<dt>Morada</dt><dd>${esc(cl.morada)}</dd>` : ""}
      <dt>Pagamento</dt><dd>${esc(v.metodo || "—")}</dd><dt>Origem</dt><dd>${esc(v.canal || "—")}</dd>
      ${v.vintei && v.vintei.pacoteId ? `<dt>20i</dt><dd>Hospedagem activa · pacote <strong>${esc(v.vintei.pacoteId)}</strong> (${esc(v.vintei.tipoNome || v.vintei.tipo)}) · ${esc(v.vintei.dominio)} · ${dCurta(v.vintei.em)}</dd>` : ""}
      ${v.vintei && v.vintei.erro ? `<dt>20i</dt><dd style="color:var(--err)">Última tentativa falhou: ${esc(v.vintei.erro)}</dd>` : ""}</dl>
      <table class="adm-table" style="min-width:0"><thead><tr><th>Serviço</th><th class="n">Valor</th></tr></thead><tbody>${(v.itens || []).map((i) => `<tr><td>${esc(i.descricao)}</td><td class="n">${kz(i.valor)}</td></tr>`).join("") || '<tr><td colspan="2">—</td></tr>'}</tbody><tfoot><tr><td>Total</td><td class="n">${kz(v.total)}</td></tr></tfoot></table>
      ${v.notas ? `<p><strong>Notas:</strong> ${esc(v.notas)}</p>` : ""}</div>
      <div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Fechar</button></div></div>`);
  };
  H["venda-pagar"] = (id) => {
    const v = vendaPorId(id); if (!v) return;
    abrir(`<form><h2>Marcar como paga</h2><p>${esc(v.id)} — ${esc(v.cliente.nome)} · <strong>${kz(v.total)}</strong></p>
      <div class="r2"><label>Forma de pagamento<select name="metodo">${opcoes(METODOS, v.metodo)}</select></label><label>Data do pagamento<input type="date" name="pagoEm" value="${hoje()}"></label></div>
      <p class="adm-msg err" data-erro></p><div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" type="submit">Confirmar pagamento</button></div></form>`,
    async (f) => { await chamar("vendas.estado", { id, estado: "pago", metodo: f.metodo.value, pagoEm: f.pagoEm.value }); aviso("Venda marcada como paga. Cliente registado."); vVendas(); actualizarBadge(); });
  };
  /* ================================================================ SUBSCRIÇÕES (área do cliente) */
  const S = { lista: [], f: "todas", q: "" };
  const SIT = { activa: ["pago", "Activa"], a_expirar: ["em_aberto", "Renova em breve"], expirada: ["cancelado", "Expirada"], unico: ["fx", "Pagamento único"], cancelada: ["fx", "Cancelada"] };
  async function vSubs() {
    S.lista = (await chamar("subs.listar")).subscricoes;
    vista.innerHTML = `
      <p style="color:var(--muted);margin:0 0 14px">Criadas automaticamente quando uma venda é paga (um serviço = uma subscrição). O cliente vê-as na <a href="cliente.html" target="_blank" rel="noopener" style="color:var(--blue);font-weight:700">área do cliente</a> se entrar com o mesmo e-mail da venda.</p>
      <div class="adm-tools"><div class="adm-pills" id="sFiltros" role="group" aria-label="Filtrar subscrições"></div><span class="adm-grow"></span>
        <input type="search" id="sBusca" placeholder="Pesquisar cliente, e-mail, domínio…" aria-label="Pesquisar subscrições" value="${esc(S.q)}"></div>
      <div class="adm-scroll"><table class="adm-table"><thead><tr><th>Serviço</th><th>Cliente</th><th>Início</th><th>Renovação</th><th>Estado</th><th></th></tr></thead><tbody id="sCorpo"></tbody></table></div>`;
    $("#sBusca").addEventListener("input", (e) => { S.q = e.target.value; desenharSubs(); });
    $("#sFiltros").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) { S.f = b.dataset.f; desenharSubs(); } });
    desenharSubs();
  }
  function desenharSubs() {
    const filtro = (s) => S.f === "todas" || s.situacao === S.f || (S.f === "a_expirar" && s.situacao === "expirada");
    const n = (f) => S.lista.filter((s) => f === "todas" || s.situacao === f || (f === "a_expirar" && s.situacao === "expirada")).length;
    $("#sFiltros").innerHTML = [["todas", "Todas"], ["a_expirar", "A renovar / expiradas"], ["activa", "Activas"], ["unico", "Pagamento único"], ["cancelada", "Canceladas"]]
      .map(([k, t]) => `<button class="adm-pill" data-f="${k}" aria-pressed="${S.f === k}">${t}<b>${n(k)}</b></button>`).join("");
    const q = S.q.trim().toLowerCase();
    const l = S.lista.filter((s) => filtro(s) && (!q || [s.servico, s.dominio, s.clienteNome, s.email, s.vendaId].join(" ").toLowerCase().includes(q)));
    $("#sCorpo").innerHTML = l.length ? l.map((s) => {
      const [c, t] = SIT[s.situacao] || ["fx", s.situacao];
      const aviso = s.vendaEstado !== "pago" ? `<small style="color:var(--err)">venda ${esc(s.vendaEstado === "apagada" ? "apagada" : "não paga")} — o cliente não a vê</small>` : (!s.email ? '<small style="color:var(--err)">sem e-mail — o cliente não a vê</small>' : "");
      return `<tr><td><strong>${esc(s.servico)}</strong><small>${esc(s.dominio || "")}</small></td>
        <td><strong>${esc(s.clienteNome || "—")}</strong><small>${esc(s.email || "")}</small>${aviso}</td>
        <td>${dCurta(s.inicio)}</td><td>${s.renovacao ? dCurta(s.renovacao) : "—"}${s.dias != null && s.situacao !== "unico" ? `<small>${s.dias < 0 ? `há ${-s.dias} dias` : `faltam ${s.dias} dias`}</small>` : ""}</td>
        <td><span class="adm-badge ${c}">${t}</span>${s.editada ? "<small>editada</small>" : ""}</td>
        <td><div class="adm-acc"><button class="adm-b" data-act="sub-editar" data-id="${esc(s.id)}">Editar</button></div></td></tr>`;
    }).join("") : '<tr><td colspan="6" class="adm-vazio">Nenhuma subscrição. Aparecem aqui quando uma venda é marcada como paga.</td></tr>';
  }
  H["sub-editar"] = (id) => {
    const s = S.lista.find((x) => x.id === id); if (!s) return;
    abrir(`<form><h2>Editar subscrição</h2><p style="color:var(--muted);margin-top:0">Venda ${esc(s.vendaId)} · ${esc(s.clienteNome || "")}</p>
      <label>Serviço<input type="text" name="servico" maxlength="200" required value="${esc(s.servico)}"></label>
      <div class="r2"><label>Domínio<input type="text" name="dominio" maxlength="253" value="${esc(s.dominio || "")}" placeholder="ex.: empresa.ao"></label>
        <label>E-mail do cliente<input type="email" name="email" maxlength="254" value="${esc(s.email || "")}"></label></div>
      <div class="r2"><label>Tipo<select name="tipo"><option value="recorrente"${s.tipo !== "unico" ? " selected" : ""}>Com renovação</option><option value="unico"${s.tipo === "unico" ? " selected" : ""}>Pagamento único</option></select></label>
        <label>Estado<select name="estado"><option value="activa"${s.estado !== "cancelada" ? " selected" : ""}>Activa</option><option value="cancelada"${s.estado === "cancelada" ? " selected" : ""}>Cancelada (o cliente deixa de a ver)</option></select></label></div>
      <div class="r2"><label>Início<input type="date" name="inicio" value="${esc(s.inicio || "")}"></label><label>Renovação<input type="date" name="renovacao" value="${esc(s.renovacao || "")}"></label></div>
      <p class="adm-msg err" data-erro></p><div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" type="submit">Guardar</button></div></form>`,
    async (f) => {
      await chamar("subs.guardar", { id, servico: f.servico.value, dominio: f.dominio.value, email: f.email.value, tipo: f.tipo.value, estado: f.estado.value, inicio: f.inicio.value, renovacao: f.renovacao.value });
      aviso("Subscrição actualizada."); vSubs();
    });
  };

  /* 20i: criar a hospedagem de uma venda paga */
  const DOMINIO_RE = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:co\.ao|it\.ao|edu\.ao|org\.ao|ao|com|net|org|pt|co\.uk))\b/i;
  H["venda-20i"] = async (id) => {
    const v = vendaPorId(id); if (!v) return;
    let tipos;
    try { tipos = (await chamar("vintei.tipos")).tipos || []; } catch (e) { aviso(e.message, "err"); return; }
    if (!tipos.length) { aviso("A conta 20i não tem tipos de pacote. Crie-os no My20i (Reseller → Package Types).", "err"); return; }
    const texto = (v.itens || []).map((i) => i.descricao).join(" ") + " " + (v.notas || "");
    const dom = (texto.match(DOMINIO_RE) || [])[1] || "";
    const palavras = texto.toLowerCase();
    const sugerido = tipos.find((t) => t.nome.toLowerCase().split(/\W+/).some((p) => p.length > 2 && palavras.includes(p))) || tipos[0];
    abrir(`<form><h2>Activar na 20i</h2><p>${esc(v.id)} — ${esc(v.cliente.nome)} · <strong>${kz(v.total)}</strong></p>
      <label>Pacote de alojamento na 20i<select name="tipo" required>${tipos.map((t) => `<option value="${esc(t.id)}"${t.id === sugerido.id ? " selected" : ""}>${esc(t.nome)}${t.plataforma ? " (" + esc(t.plataforma) + ")" : ""}</option>`).join("")}</select></label>
      <label>Domínio do site<input type="text" name="dominio" required maxlength="253" placeholder="ex.: empresadocliente.ao" value="${esc(dom)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <p style="color:var(--muted);margin:0;font-size:.9rem">Vai ser criado um pacote de alojamento <strong>real</strong> na sua conta 20i. Confirme o pacote e o domínio antes de continuar.</p>
      <p class="adm-msg err" data-erro></p><div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" type="submit">Criar hospedagem na 20i</button></div></form>`,
    async (f) => {
      const b = $("button[type=submit]", f); b.disabled = true; b.textContent = "A criar na 20i…";
      try {
        const tipoNome = f.tipo.options[f.tipo.selectedIndex].text;
        const r = await chamar("vintei.activar", { id, tipo: f.tipo.value, tipoNome, dominio: f.dominio.value });
        aviso(`Hospedagem criada na 20i (pacote ${r.venda.vintei.pacoteId}).`); vVendas();
      } catch (e) { b.disabled = false; b.textContent = "Criar hospedagem na 20i"; throw e; }
    });
  };
  H["venda-reabrir"] = async (id) => { try { await chamar("vendas.estado", { id, estado: "em_aberto" }); aviso("Venda reaberta."); vVendas(); actualizarBadge(); } catch (e) { aviso(e.message, "err"); } };
  H["venda-apagar"] = (id) => confirmar(`Eliminar a venda ${id}? Esta acção não pode ser desfeita.`, async () => { await chamar("vendas.apagar", { id }); aviso("Venda eliminada."); vVendas(); actualizarBadge(); });
  H["venda-nova"] = () => formVenda(null);
  H["venda-editar"] = (id) => formVenda(vendaPorId(id));
  H["vendas-csv"] = () => csv("vendas-ecomulti", [["Nº", "Data", "Cliente", "Tipo", "NIF", "Telefone", "E-mail", "Serviços", "Pagamento", "Total (Kz)", "Estado", "Pago em", "Origem"]]
    .concat(vendasFiltradas().map((v) => [v.id, dCurta(v.data), v.cliente.nome, v.cliente.tipo, v.cliente.nif, v.cliente.telefone, v.cliente.email, (v.itens || []).map((i) => i.descricao).join(" | "), v.metodo, v.total, ESTADO_VENDA[v.estado], v.pagoEm ? dCurta(v.pagoEm) : "", v.canal])));

  function linhaItem(i = {}) { return `<div class="adm-item"><input type="text" name="it_desc" placeholder="Serviço (ex.: Domínio .ao)" maxlength="200" value="${esc(i.descricao || "")}" aria-label="Serviço"><input type="number" name="it_valor" min="0" step="0.01" placeholder="Valor Kz" value="${i.valor || ""}" aria-label="Valor"><button type="button" data-rm aria-label="Remover linha">×</button></div>`; }
  function formVenda(v) {
    const novo = !v, c = v ? v.cliente : {};
    abrir(`<form novalidate><h2>${novo ? "Nova venda" : "Editar venda " + esc(v.id)}</h2>
      <div class="r2"><label>Nome do cliente<input type="text" name="nome" required maxlength="120" value="${esc(c.nome || "")}"></label>
        <label>Tipo<select name="tipo"><option${c.tipo !== "Empresa" ? " selected" : ""}>Particular</option><option${c.tipo === "Empresa" ? " selected" : ""}>Empresa</option></select></label></div>
      <div class="r3"><label>Telefone / WhatsApp<input type="tel" name="telefone" value="${esc(c.telefone || "")}" placeholder="923 000 000"></label><label>E-mail<input type="email" name="email" value="${esc(c.email || "")}"></label><label>NIF<input type="text" name="nif" maxlength="20" value="${esc(c.nif || "")}"></label></div>
      <label>Morada<input type="text" name="morada" maxlength="200" value="${esc(c.morada || "")}"></label>
      <div><strong style="font-size:.88rem;color:var(--ink)">Serviços vendidos</strong><div class="adm-itens" id="itens">${((v && v.itens.length) ? v.itens : [{}]).map(linhaItem).join("")}</div>
        <button class="adm-b" type="button" id="maisItem" style="margin-top:8px">+ Adicionar serviço</button></div>
      <div class="r3"><label>Total (Kz)<input type="number" name="total" min="0" step="0.01" required value="${v ? v.total : ""}"></label>
        <label>Forma de pagamento<select name="metodo"><option value="">—</option>${opcoes(METODOS, v && v.metodo)}</select></label>
        <label>Estado<select name="estado"><option value="em_aberto"${!v || v.estado === "em_aberto" ? " selected" : ""}>Em aberto (não paga)</option><option value="pago"${v && v.estado === "pago" ? " selected" : ""}>Paga</option><option value="cancelado"${v && v.estado === "cancelado" ? " selected" : ""}>Cancelada</option></select></label></div>
      <div class="r2"><label>Data da venda<input type="date" name="data" value="${(v ? v.data : new Date().toISOString()).slice(0, 10)}"></label><label>Data do pagamento <small>(se paga)</small><input type="date" name="pagoEm" value="${v && v.pagoEm ? v.pagoEm.slice(0, 10) : ""}"></label></div>
      <label>Notas<textarea name="notas" maxlength="600">${esc(v ? v.notas : "")}</textarea></label>
      <p class="adm-msg err" data-erro></p><div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" type="submit">Guardar venda</button></div></form>`,
    async (f) => {
      const itens = $$(".adm-item", f).map((r) => ({ descricao: $("[name=it_desc]", r).value.trim(), valor: Number($("[name=it_valor]", r).value) || 0 })).filter((i) => i.descricao);
      await chamar("vendas.guardar", { id: v && v.id, cliente: { nome: f.nome.value, tipo: f.tipo.value, telefone: f.telefone.value, email: f.email.value, nif: f.nif.value, morada: f.morada.value },
        itens, total: f.total.value, metodo: f.metodo.value, estado: f.estado.value, data: f.data.value, pagoEm: f.pagoEm.value, notas: f.notas.value });
      aviso("Venda guardada."); vVendas(); actualizarBadge();
    });
    const f = $("form", modal); let manual = !!v;
    const somar = () => { if (!manual) f.total.value = $$("[name=it_valor]", f).reduce((t, i) => t + (Number(i.value) || 0), 0) || ""; };
    f.total.addEventListener("input", () => (manual = true));
    f.addEventListener("input", (e) => { if (e.target.name === "it_valor") somar(); });
    $("#maisItem", f).addEventListener("click", () => { $("#itens", f).insertAdjacentHTML("beforeend", linhaItem()); });
    $("#itens", f).addEventListener("click", (e) => { if (e.target.closest("[data-rm]") && $$(".adm-item", f).length > 1) { e.target.closest(".adm-item").remove(); somar(); } });
  }

  /* ============================================================== CLIENTES */
  const C = { lista: [], q: "" };
  async function vClientes() {
    C.lista = (await chamar("clientes.listar")).clientes;
    vista.innerHTML = `<div class="adm-tools"><p style="margin:0;color:var(--muted)">Os clientes são registados automaticamente quando uma venda é marcada como <strong>paga</strong>.</p><span class="adm-grow"></span>
      <input type="search" id="cBusca" placeholder="Pesquisar nome, telefone, e-mail, NIF…" aria-label="Pesquisar clientes" value="${esc(C.q)}"><button class="adm-b" data-act="clientes-csv">Exportar CSV</button></div>
      <div class="adm-scroll"><table class="adm-table"><thead><tr><th>Cliente</th><th>Contacto</th><th>NIF</th><th class="n">Compras</th><th class="n">Total comprado</th><th>Última compra</th><th></th></tr></thead><tbody id="cCorpo"></tbody></table></div>`;
    $("#cBusca").addEventListener("input", (e) => { C.q = e.target.value; desenharClientes(); });
    desenharClientes();
  }
  const clientesFiltrados = () => { const q = C.q.trim().toLowerCase(); return C.lista.filter((c) => !q || [c.nome, c.telefone, c.email, c.nif].join(" ").toLowerCase().includes(q)); };
  function desenharClientes() {
    const l = clientesFiltrados();
    $("#cCorpo").innerHTML = l.length ? l.map((c) => `<tr><td><strong>${esc(c.nome)}</strong><small>${esc(c.tipo)}${c.emAberto ? ` · <span style="color:var(--accent);font-weight:700">${c.emAberto} em aberto</span>` : ""}</small></td>
      <td>${esc(c.telefone || "—")}<small>${esc(c.email || "")}</small></td><td>${esc(c.nif || "—")}</td><td class="n">${c.compras}</td><td class="n"><strong>${kz(c.totalComprado)}</strong></td><td>${dCurta(c.ultimaCompra)}</td>
      <td><div class="adm-acc"><button class="adm-b" data-act="cliente-ver" data-id="${esc(c.id)}">Histórico</button>${waLink(c.telefone) ? `<a class="adm-b wa" target="_blank" rel="noopener" href="${esc(waLink(c.telefone, "Olá " + c.nome + "! "))}">WhatsApp</a>` : ""}<button class="adm-b" data-act="cliente-editar" data-id="${esc(c.id)}">Editar</button><button class="adm-b del" data-act="cliente-apagar" data-id="${esc(c.id)}">Eliminar</button></div></td></tr>`).join("")
      : '<tr><td colspan="7" class="adm-vazio">Ainda não há clientes registados.</td></tr>';
  }
  const clientePorId = (id) => C.lista.find((c) => c.id === id);
  H["clientes-csv"] = () => csv("clientes-ecomulti", [["Nome", "Tipo", "Telefone", "E-mail", "NIF", "Morada", "Compras", "Total comprado (Kz)", "Última compra", "Notas"]]
    .concat(clientesFiltrados().map((c) => [c.nome, c.tipo, c.telefone, c.email, c.nif, c.morada, c.compras, c.totalComprado, c.ultimaCompra ? dCurta(c.ultimaCompra) : "", c.notas])));
  H["cliente-ver"] = async (id) => {
    const c = clientePorId(id); if (!c) return;
    const vendas = (await chamar("vendas.listar")).vendas.filter((v) => v.clienteId === c.id || (c.email && v.cliente.email === c.email));
    abrir(`<div class="adm-md"><h2>${esc(c.nome)}</h2><div class="adm-det"><dl><dt>Tipo</dt><dd>${esc(c.tipo)}</dd><dt>Contacto</dt><dd>${esc(c.telefone || "—")} · ${esc(c.email || "—")}</dd>${c.nif ? `<dt>NIF</dt><dd>${esc(c.nif)}</dd>` : ""}${c.morada ? `<dt>Morada</dt><dd>${esc(c.morada)}</dd>` : ""}<dt>Cliente desde</dt><dd>${dCurta(c.criadoEm)}</dd><dt>Total comprado</dt><dd><strong>${kz(c.totalComprado)}</strong> em ${c.compras} ${c.compras === 1 ? "compra" : "compras"}</dd>${c.notas ? `<dt>Notas</dt><dd>${esc(c.notas)}</dd>` : ""}</dl>
      <h3 style="margin:10px 0 0;font-size:1rem">Histórico de vendas</h3>
      <table class="adm-table" style="min-width:0"><tbody>${vendas.map((v) => { const [k, t] = estadoVenda(v); return `<tr><td><strong>${esc(v.id)}</strong><small>${dCurta(v.data)}</small></td><td>${esc((v.itens || []).map((i) => i.descricao).join(", "))}</td><td class="n">${kz(v.total)}</td><td><span class="adm-badge ${k}">${t}</span></td></tr>`; }).join("") || '<tr><td>Sem vendas associadas.</td></tr>'}</tbody></table></div>
      <div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Fechar</button></div></div>`);
  };
  function formCliente(c) {
    const novo = !c; c = c || {};
    abrir(`<form novalidate><h2>${novo ? "Novo cliente" : "Editar cliente"}</h2>
      <div class="r2"><label>Nome<input type="text" name="nome" required maxlength="120" value="${esc(c.nome || "")}"></label><label>Tipo<select name="tipo"><option${c.tipo !== "Empresa" ? " selected" : ""}>Particular</option><option${c.tipo === "Empresa" ? " selected" : ""}>Empresa</option></select></label></div>
      <div class="r3"><label>Telefone / WhatsApp<input type="tel" name="telefone" value="${esc(c.telefone || "")}"></label><label>E-mail<input type="email" name="email" value="${esc(c.email || "")}"></label><label>NIF<input type="text" name="nif" maxlength="20" value="${esc(c.nif || "")}"></label></div>
      <label>Morada<input type="text" name="morada" maxlength="200" value="${esc(c.morada || "")}"></label>
      <label>Notas<textarea name="notas" maxlength="600">${esc(c.notas || "")}</textarea></label>
      <p class="adm-msg err" data-erro></p><div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" type="submit">Guardar</button></div></form>`,
    async (f) => { await chamar("clientes.guardar", { id: c.id, nome: f.nome.value, tipo: f.tipo.value, telefone: f.telefone.value, email: f.email.value, nif: f.nif.value, morada: f.morada.value, notas: f.notas.value }); aviso("Cliente guardado."); vClientes(); });
  }
  H["cliente-novo"] = () => formCliente(null);
  H["cliente-editar"] = (id) => formCliente(clientePorId(id));
  H["cliente-apagar"] = (id) => { const c = clientePorId(id); if (c) confirmar(`Eliminar o cliente ${c.nome}? As vendas dele ficam guardadas.`, async () => { await chamar("clientes.apagar", { id }); aviso("Cliente eliminado."); vClientes(); }); };

  /* ================================================================== BLOG */
  const B = { posts: [], estaticos: new Set(), tab: "artigos", editando: null, slugManual: false };
  async function carregarPosts() {
    const [fich, rem] = await Promise.all([fetch(FICHEIRO).then((r) => (r.ok ? r.json() : { posts: [] })).catch(() => ({ posts: [] })), chamarBlog(API_BLOG + "?todos=1")]);
    B.estaticos = new Set((fich.posts || []).map((p) => p.slug));
    const m = new Map(); (fich.posts || []).forEach((p) => m.set(p.slug, { ...p, fonte: "ficheiro" })); (rem.posts || []).forEach((p) => m.set(p.slug, { ...p, fonte: "api" }));
    B.posts = [...m.values()].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  }
  const guardarPost = (p) => chamarBlog(API_BLOG, { method: "POST", body: JSON.stringify(p) });
  function rotuloPost(p) { if (p.estado === "publicado") return (p.data || "") > hoje() ? ["agendado", "Agendado"] : ["publicado", "Publicado"]; return [p.estado, p.estado === "rascunho" ? "Rascunho" : "Arquivado"]; }
  async function vBlog() {
    await carregarPosts(); B.editando = null;
    desenharBlog();
  }
  function desenharBlog() {
    vista.innerHTML = `<div class="adm-tools"><div class="adm-pills"><button class="adm-pill" data-act="blog-tab" data-id="artigos" aria-pressed="${B.tab === "artigos"}">Artigos<b>${B.posts.length}</b></button><button class="adm-pill" data-act="blog-tab" data-id="categorias" aria-pressed="${B.tab === "categorias"}">Categorias (secções)</button></div><span class="adm-grow"></span><a class="adm-b" href="blog.html" target="_blank" rel="noopener">Ver blog ↗</a></div><div id="blogCorpo"></div>`;
    B.tab === "artigos" ? listaArtigos() : listaCategorias();
  }
  H["blog-tab"] = (t) => { B.tab = t; desenharBlog(); };
  function listaArtigos() {
    $("#blogCorpo").innerHTML = B.posts.length ? B.posts.map((p) => { const [c, t] = rotuloPost(p); return `<div class="adm-linha"><div><h3>${esc(p.titulo || p.slug)}</h3><small><span class="adm-badge ${c}">${t}</span> ${p.destaque ? '<span class="adm-badge fx">Destaque</span> ' : ""}${esc(p.categoria || "")} · ${esc(dataLonga(p.data))}${p.fonte === "ficheiro" ? " · exemplo do site" : ""}</small></div>
      <div class="adm-acc"><a class="adm-b" href="artigo.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">Ver</a><button class="adm-b" data-act="artigo-editar" data-id="${esc(p.slug)}">Editar</button>${p.estado === "publicado" ? `<button class="adm-b" data-act="artigo-ocultar" data-id="${esc(p.slug)}">Despublicar</button>` : `<button class="adm-b ok" data-act="artigo-publicar" data-id="${esc(p.slug)}">Publicar</button>`}<button class="adm-b del" data-act="artigo-apagar" data-id="${esc(p.slug)}">Eliminar</button></div></div>`; }).join("") : '<p class="adm-vazio">Ainda não há artigos. Clique em “+ Novo artigo”.</p>';
  }
  const postPorSlug = (s) => B.posts.find((p) => p.slug === s);
  H["artigo-novo"] = () => abrirEditor(null);
  H["artigo-editar"] = (s) => abrirEditor(postPorSlug(s));
  H["artigo-publicar"] = async (s) => { const p = postPorSlug(s); try { await guardarPost({ ...p, estado: "publicado", data: p.data || hoje() }); aviso("Artigo publicado."); await vBlog(); } catch (e) { aviso(e.message, "err"); } };
  H["artigo-ocultar"] = async (s) => { try { await guardarPost({ ...postPorSlug(s), estado: "rascunho" }); aviso("Artigo despublicado."); await vBlog(); } catch (e) { aviso(e.message, "err"); } };
  H["artigo-apagar"] = (s) => { const p = postPorSlug(s); if (!p) return; confirmar(`Eliminar “${p.titulo}”?`, async () => {
    if (B.estaticos.has(p.slug)) await guardarPost({ ...p, estado: "arquivado" }); else await chamarBlog(API_BLOG + "?slug=" + encodeURIComponent(p.slug), { method: "DELETE" });
    aviso("Artigo eliminado."); await vBlog(); }); };

  /* categorias = secções do blog */
  function listaCategorias() {
    const m = new Map(); B.posts.forEach((p) => { const k = p.categoria || "Notícias"; const o = m.get(k) || { t: 0, p: 0 }; o.t++; if (p.estado === "publicado") o.p++; m.set(k, o); });
    const l = [...m].sort((a, b) => b[1].t - a[1].t);
    $("#blogCorpo").innerHTML = `<p style="color:var(--muted);margin-top:0">As categorias são as secções do blog. Renomeie, junte ou elimine (os artigos são movidos para outra categoria). Para criar uma nova, use “Nova categoria”.</p>
      <p><button class="btn btn-outline btn-sm" data-act="cat-nova">+ Nova categoria</button></p>
      <div class="adm-scroll"><table class="adm-table" style="min-width:0"><thead><tr><th>Categoria</th><th class="n">Publicados</th><th class="n">Total</th><th></th></tr></thead><tbody>${l.map(([n, o]) => `<tr><td><strong>${esc(n)}</strong></td><td class="n">${o.p}</td><td class="n">${o.t}</td><td><div class="adm-acc"><button class="adm-b" data-act="cat-renomear" data-id="${esc(n)}">Renomear</button><button class="adm-b del" data-act="cat-apagar" data-id="${esc(n)}">Eliminar</button></div></td></tr>`).join("") || '<tr><td colspan="4" class="adm-vazio">Sem categorias.</td></tr>'}</tbody></table></div>`;
  }
  async function moverCategoria(de, para) {
    for (const p of B.posts.filter((x) => (x.categoria || "Notícias") === de)) await guardarPost({ ...p, categoria: para });
    await vBlog(); B.tab = "categorias"; desenharBlog();
  }
  H["cat-nova"] = () => abrir(`<form><h2>Nova categoria</h2><label>Nome da categoria<input type="text" name="nome" maxlength="40" required></label><p style="color:var(--muted);margin:0">Será criada ao guardar o primeiro artigo nela.</p><p class="adm-msg err" data-erro></p><div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" type="submit">Criar artigo nesta categoria</button></div></form>`,
    (f) => { const n = f.nome.value.trim(); if (!n) throw new Error("Indique o nome."); setTimeout(() => abrirEditor(null, n), 50); });
  H["cat-renomear"] = (nome) => abrir(`<form><h2>Renomear “${esc(nome)}”</h2><label>Novo nome<input type="text" name="nome" maxlength="40" required value="${esc(nome)}"></label><p class="adm-msg err" data-erro></p><div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" type="submit">Guardar</button></div></form>`,
    async (f) => { const n = f.nome.value.trim(); if (!n) throw new Error("Indique o nome."); if (n !== nome) { await moverCategoria(nome, n); aviso("Categoria renomeada."); } });
  H["cat-apagar"] = (nome) => { const outras = [...new Set(B.posts.map((p) => p.categoria || "Notícias"))].filter((c) => c !== nome);
    abrir(`<form><h2>Eliminar “${esc(nome)}”</h2><p>Os artigos desta categoria serão movidos para:</p><label>Categoria de destino<input type="text" name="dest" list="catsDest" maxlength="40" required value="${esc(outras[0] || "Notícias")}"></label><datalist id="catsDest">${outras.map((c) => `<option>${esc(c)}</option>`).join("")}</datalist><p class="adm-msg err" data-erro></p><div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" type="submit" style="background:var(--err);box-shadow:none">Mover e eliminar</button></div></form>`,
    async (f) => { const d = f.dest.value.trim(); if (!d || d === nome) throw new Error("Escolha outra categoria de destino."); await moverCategoria(nome, d); aviso("Categoria eliminada."); }); };

  /* editor de artigo */
  function abrirEditor(p, categoria) {
    const nova = !p;
    B.editando = p || { slug: "", estado: "rascunho", data: hoje(), categoria: categoria || "Notícias da empresa", autor: "Equipa ECOMULTI", tags: [], conteudo: "" };
    B.slugManual = !nova; const e = B.editando;
    $("#titulo").textContent = nova ? "Novo artigo" : "Editar artigo";
    $("#accoesTopo").innerHTML = '<button class="btn btn-outline btn-sm" data-act="editor-voltar">← Voltar à lista</button>';
    vista.innerHTML = `<form id="fEd" novalidate><div class="ed">
      <div class="ed-col">
        <label>Título<input type="text" name="titulo" maxlength="160" required value="${esc(e.titulo || "")}"></label>
        <label>Endereço (slug) <small>letras minúsculas, números e hífens — define o link</small><input type="text" name="slug" maxlength="90" required value="${esc(e.slug)}" ${nova ? "" : "readonly"}></label>
        <label>Resumo <small>aparece nos cartões e no Google (até 320 caracteres)</small><textarea name="resumo" maxlength="320" style="min-height:80px">${esc(e.resumo || "")}</textarea></label>
        <div class="r2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><label>Categoria<input type="text" name="categoria" list="cats" maxlength="40" value="${esc(e.categoria || "")}"></label><label>Autor<input type="text" name="autor" maxlength="60" value="${esc(e.autor || "")}"></label></div>
        <datalist id="cats">${[...new Set(["Notícias da empresa", "Domínios", "Hospedagem", "E-mail", "Websites", "Automação e IA", "Dicas", ...B.posts.map((x) => x.categoria)])].map((c) => `<option>${esc(c)}</option>`).join("")}</datalist>
        <label>Etiquetas <small>separadas por vírgulas</small><input type="text" name="tags" value="${esc((e.tags || []).join(", "))}"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><label>Data de publicação <small>no futuro = agendado</small><input type="date" name="data" value="${esc(e.data || hoje())}"></label>
          <label>Estado<select name="estado"><option value="rascunho"${e.estado === "rascunho" ? " selected" : ""}>Rascunho (escondido)</option><option value="publicado"${e.estado === "publicado" ? " selected" : ""}>Publicado</option><option value="arquivado"${e.estado === "arquivado" ? " selected" : ""}>Arquivado (escondido)</option></select></label></div>
        <label>Imagem de capa <small>opcional — endereço https://. Sem imagem, a capa é gerada.</small><input type="url" name="imagem" value="${esc(e.imagem || "")}" placeholder="https://..."></label>
        <label class="ed-chk"><input type="checkbox" name="destaque"${e.destaque ? " checked" : ""}> Mostrar em destaque no topo do blog</label>
      </div>
      <div class="ed-col"><label for="edTexto">Texto do artigo</label>
        <div class="ed-tools" role="toolbar" aria-label="Formatação"><button type="button" data-f="h2">H2</button><button type="button" data-f="h3">H3</button><button type="button" data-f="b"><b>B</b></button><button type="button" data-f="i"><i>I</i></button><button type="button" data-f="ul">• Lista</button><button type="button" data-f="ol">1. Lista</button><button type="button" data-f="q">❝</button><button type="button" data-f="a">Link</button></div>
        <textarea class="corpo" id="edTexto" name="conteudo" maxlength="60000" placeholder="Use ## para títulos, - para listas, **negrito**, [texto](endereço) para links.">${esc(e.conteudo || "")}</textarea><small id="edCont"></small></div>
      </div>
      <section class="adm-card" style="margin-top:20px"><h2>Pré-visualização</h2><div class="ed-prev"><div class="b-prose" id="edPrev"></div></div></section>
      <div class="adm-sticky"><button class="btn btn-primary" type="submit" id="edGuardar">Guardar</button><button class="btn btn-outline" type="button" data-act="editor-voltar">Voltar à lista</button><span class="adm-msg" id="edMsg" role="status" aria-live="polite" style="margin:0"></span></div></form>`;
    const f = $("#fEd");
    const prever = () => { const t = f.conteudo.value; $("#edPrev").innerHTML = renderMd(t).html || '<p style="color:var(--muted)">A pré-visualização aparece aqui.</p>'; const n = t.split(/\s+/).filter(Boolean).length; $("#edCont").textContent = `${n} palavras · ${Math.max(1, Math.round(n / 200))} min de leitura`; };
    prever();
    f.addEventListener("input", (ev) => { if (ev.target.name === "conteudo") prever(); if (ev.target.name === "titulo" && !B.slugManual) f.slug.value = slugify(ev.target.value); if (ev.target.name === "slug") B.slugManual = true; });
    $(".ed-tools", f).addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-f]"); if (!b) return;
      const t = f.conteudo, i = t.selectionStart, j = t.selectionEnd, sel = t.value.slice(i, j);
      const M = { h2: () => "\n## " + (sel || "Título da secção") + "\n", h3: () => "\n### " + (sel || "Subtítulo") + "\n", b: () => "**" + (sel || "texto") + "**", i: () => "*" + (sel || "texto") + "*",
        ul: () => "\n" + (sel || "item").split("\n").map((l) => "- " + l).join("\n") + "\n", ol: () => "\n" + (sel || "item").split("\n").map((l, k) => `${k + 1}. ${l}`).join("\n") + "\n", q: () => "\n> " + (sel || "citação") + "\n",
        a: () => { const u = prompt("Endereço da ligação (https://… ou dominios.html):", "https://"); return u ? `[${sel || "texto"}](${u})` : sel; } };
      t.setRangeText(M[b.dataset.f](), i, j, "end"); t.focus(); prever();
    });
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const msg = $("#edMsg"), btn = $("#edGuardar");
      const post = { slug: f.slug.value.trim(), titulo: f.titulo.value.trim(), resumo: f.resumo.value.trim(), conteudo: f.conteudo.value, categoria: f.categoria.value.trim(), autor: f.autor.value.trim(), data: f.data.value || hoje(), estado: f.estado.value, imagem: f.imagem.value.trim(), destaque: f.destaque.checked, tags: f.tags.value.split(",").map((s) => s.trim()).filter(Boolean) };
      if (post.estado === "publicado" && (!post.resumo || !post.conteudo.trim())) { msg.className = "adm-msg err"; msg.textContent = "Para publicar, preencha o resumo e o texto."; return; }
      btn.disabled = true; msg.className = "adm-msg"; msg.textContent = "A guardar…";
      try { await guardarPost(post); f.slug.readOnly = true; B.slugManual = true; msg.className = "adm-msg ok"; msg.textContent = post.estado === "publicado" ? (post.data > hoje() ? "Guardado. Será publicado em " + dataLonga(post.data) + "." : "Guardado e publicado no blog.") : "Guardado como " + post.estado + "."; }
      catch (er) { msg.className = "adm-msg err"; msg.textContent = er.message; } finally { btn.disabled = false; }
    });
    scrollTo({ top: 0 });
  }
  H["editor-voltar"] = async () => { $("#accoesTopo").innerHTML = VISTAS.blog.topo(); $("#titulo").textContent = VISTAS.blog.titulo; carregando(); try { await vBlog(); } catch (e) { falhou(e); } };

  /* ================================================================= LEADS */
  const L = { lista: [], f: "todos", q: "" };
  const ESTADO_LEAD = { novo: "Novo", contactado: "Contactado", convertido: "Convertido", descartado: "Descartado" };
  async function vLeads() {
    L.lista = (await chamar("leads.listar")).leads;
    vista.innerHTML = `<div class="adm-kpis" id="lStats"></div>
      <div class="adm-tools"><div class="adm-pills" id="lFiltros" role="group" aria-label="Filtrar leads"></div><span class="adm-grow"></span>
        <input type="search" id="lBusca" placeholder="Pesquisar nome, e-mail, WhatsApp…" aria-label="Pesquisar leads" value="${esc(L.q)}"><button class="adm-b" data-act="leads-copiar">Copiar e-mails</button><button class="adm-b" data-act="leads-csv">Exportar CSV</button></div>
      <div class="adm-scroll"><table class="adm-table" style="min-width:900px"><thead><tr><th>Data</th><th>Lead</th><th>WhatsApp</th><th>Interesses</th><th>Origem</th><th>Estado</th><th></th></tr></thead><tbody id="lCorpo"></tbody></table></div>`;
    $("#lBusca").addEventListener("input", (e) => { L.q = e.target.value; desenharLeads(); });
    $("#lFiltros").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) { L.f = b.dataset.f; desenharLeads(); } });
    $("#lCorpo").addEventListener("change", async (e) => {
      const s = e.target.closest("select[data-email]"); if (!s) return;
      try { await chamar("leads.actualizar", { email: s.dataset.email, estado: s.value }); L.lista.find((l) => l.email === s.dataset.email).estado = s.value; aviso("Estado actualizado."); desenharLeads(); } catch (er) { aviso(er.message, "err"); }
    });
    desenharLeads();
  }
  const leadsFiltrados = () => { const q = L.q.trim().toLowerCase(); return L.lista.filter((l) => (L.f === "todos" || l.estado === L.f) && (!q || [l.nome, l.email, l.whatsapp, (l.interesses || []).join(" "), l.notas].join(" ").toLowerCase().includes(q))); };
  function desenharLeads() {
    const sem7 = new Date(Date.now() - 7 * 864e5).toISOString();
    $("#lStats").innerHTML = [[L.lista.length, "Total de contactos"], [L.lista.filter((l) => (l.data || "") >= sem7).length, "Novos (7 dias)"], [L.lista.filter((l) => l.whatsapp).length, "Com WhatsApp"], [L.lista.filter((l) => l.estado === "convertido").length, "Convertidos em clientes"]]
      .map(([n, t]) => `<div class="adm-kpi"><small>${t}</small><strong>${n}</strong></div>`).join("");
    const n = (e) => L.lista.filter((l) => e === "todos" || l.estado === e).length;
    $("#lFiltros").innerHTML = [["todos", "Todos"], ...Object.entries(ESTADO_LEAD)].map(([k, t]) => `<button class="adm-pill" data-f="${k}" aria-pressed="${L.f === k}">${t}<b>${n(k)}</b></button>`).join("");
    const l = leadsFiltrados();
    $("#lCorpo").innerHTML = l.length ? l.map((x) => `<tr><td>${dCurta(x.data)}</td><td><strong>${esc(x.nome || "—")}</strong><small>${esc(x.email)}</small>${x.consentimento ? "" : '<small style="color:var(--warn)">sem consentimento de newsletter</small>'}${x.notas ? `<small>📝 ${esc(x.notas)}</small>` : ""}</td>
      <td>${esc(x.whatsapp || "—")}</td><td><small>${esc((x.interesses || []).join(", ") || "—")}</small></td><td><small>${esc(x.origem || "")}${x.pagina ? " · " + esc(x.pagina) : ""}</small></td>
      <td><select class="adm-sel" data-email="${esc(x.email)}" aria-label="Estado do lead">${Object.entries(ESTADO_LEAD).map(([k, t]) => `<option value="${k}"${x.estado === k ? " selected" : ""}>${t}</option>`).join("")}</select></td>
      <td><div class="adm-acc">${waLink(x.whatsapp) ? `<a class="adm-b wa" target="_blank" rel="noopener" href="${esc(waLink(x.whatsapp, "Olá " + (x.nome || "") + "! Obrigado pelo seu interesse na ECOMULTI. Em que podemos ajudar?"))}">WhatsApp</a>` : ""}<a class="adm-b" href="mailto:${esc(x.email)}">E-mail</a>
        <button class="adm-b" data-act="lead-notas" data-id="${esc(x.email)}">Notas</button>${x.estado !== "convertido" ? `<button class="adm-b ok" data-act="lead-converter" data-id="${esc(x.email)}">Criar cliente</button>` : ""}<button class="adm-b del" data-act="lead-apagar" data-id="${esc(x.email)}">Eliminar</button></div></td></tr>`).join("")
      : '<tr><td colspan="7" class="adm-vazio">Nenhum lead encontrado.</td></tr>';
  }
  const leadPorEmail = (e) => L.lista.find((l) => l.email === e);
  H["lead-novo"] = () => abrir(`<form><h2>Novo lead</h2><div class="r2"><label>Nome<input type="text" name="nome" maxlength="80"></label><label>E-mail<input type="email" name="email" required></label></div><label>WhatsApp<input type="tel" name="whatsapp" placeholder="923 000 000"></label><label>Notas<textarea name="notas" maxlength="600"></textarea></label>
    <p style="color:var(--muted);margin:0;font-size:.88rem">Leads adicionados manualmente ficam <strong>sem consentimento de newsletter</strong>: não os inclua em envios em massa.</p><p class="adm-msg err" data-erro></p><div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" type="submit">Guardar</button></div></form>`,
  async (f) => { await chamar("leads.criar", { nome: f.nome.value, email: f.email.value, whatsapp: f.whatsapp.value, notas: f.notas.value }); aviso("Lead adicionado."); vLeads(); });
  H["lead-notas"] = (email) => { const l = leadPorEmail(email); if (!l) return;
    abrir(`<form><h2>Notas — ${esc(l.nome || l.email)}</h2><label>Notas internas<textarea name="notas" maxlength="600">${esc(l.notas || "")}</textarea></label><p class="adm-msg err" data-erro></p><div class="adm-modal-acc"><button class="btn btn-outline btn-sm" type="button" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" type="submit">Guardar</button></div></form>`,
    async (f) => { await chamar("leads.actualizar", { email, notas: f.notas.value }); aviso("Notas guardadas."); vLeads(); }); };
  H["lead-converter"] = (email) => confirmar(`Criar um cliente a partir de ${email}? O lead passa a “Convertido”.`, async () => { await chamar("leads.converter", { email }); aviso("Cliente criado."); vLeads(); }, "Criar cliente");
  H["lead-apagar"] = (email) => confirmar(`Eliminar ${email} da lista? (Também deixa de receber a newsletter.)`, async () => { await chamar("leads.apagar", { email }); aviso("Lead eliminado."); vLeads(); });
  H["leads-copiar"] = async () => {
    const t = leadsFiltrados().filter((l) => l.consentimento && l.estado !== "descartado").map((l) => l.email).join(", ");
    if (!t) return aviso("Não há e-mails com consentimento.", "err");
    try { await navigator.clipboard.writeText(t); aviso("E-mails copiados (só os que aceitaram a newsletter)."); } catch { prompt("Copie os e-mails:", t); }
  };
  H["leads-csv"] = () => csv("leads-ecomulti", [["Data", "Nome", "E-mail", "WhatsApp", "Interesses", "Origem", "Página", "Estado", "Consentimento newsletter", "Consentimento em", "Notas"]]
    .concat(leadsFiltrados().map((l) => [dCurta(l.data), l.nome, l.email, l.whatsapp, (l.interesses || []).join(" | "), l.origem, l.pagina, ESTADO_LEAD[l.estado], l.consentimento ? "Sim" : "Não", l.consentidoEm ? dCurta(l.consentidoEm) : "", l.notas])));

  /* ================================================================= CONTA */
  function vConta() {
    vista.innerHTML = `<div class="adm-card adm-conta"><h2>Alterar senha</h2><p style="color:var(--muted)">Sessão iniciada como <strong>${esc(utilizador)}</strong>. Ao mudar a senha, todas as sessões abertas terminam.</p>
      <form id="fSenha" novalidate><label>Senha actual<input type="password" name="actual" autocomplete="current-password" required></label>
      <label>Nova senha <small style="font-weight:500;color:var(--muted)">(mínimo 10 caracteres, com letras e números)</small><input type="password" name="nova" autocomplete="new-password" minlength="10" required></label>
      <label>Repetir a nova senha<input type="password" name="rep" autocomplete="new-password" required></label>
      <p class="adm-msg" id="sMsg" role="status"></p><button class="btn btn-primary" type="submit">Guardar nova senha</button></form></div>
      <div class="adm-card adm-conta" style="margin-top:16px"><h2>Terminar sessão</h2><p style="color:var(--muted)">A sessão termina sozinha ao fim de 8 horas.</p><button class="btn btn-outline" data-act="sair">Terminar sessão</button></div>`;
    $("#fSenha").addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target, m = $("#sMsg"); m.className = "adm-msg";
      if (f.nova.value !== f.rep.value) { m.className = "adm-msg err"; m.textContent = "As senhas novas não coincidem."; return; }
      try { const j = await chamar("senha", { actual: f.actual.value, nova: f.nova.value }); token = j.token; try { sessionStorage.setItem(KT, token); } catch {} f.reset(); $("#avisoSenha").hidden = true; m.className = "adm-msg ok"; m.textContent = "Senha alterada com sucesso."; }
      catch (er) { m.className = "adm-msg err"; m.textContent = er.message; }
    });
  }
  H["sair"] = () => sair();

  /* ============================================================= ARRANQUE */
  if (token) arrancar().catch(() => sair());
})();
