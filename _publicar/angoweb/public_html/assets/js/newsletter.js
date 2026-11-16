/* =====================================================================
   ECOMULTI — Newsletter (captação de leads)
   Uso:  <div data-newsletter="site"></div>          formulário completo
         <div data-newsletter="artigo" data-compact></div>   versão curta (nome + e-mail)
   Envia para config.js → newsletter.endpoint. Se a API não estiver
   disponível, oferece enviar o pedido por WhatsApp ou e-mail (nunca perde o lead).
   ===================================================================== */
(function () {
  "use strict";
  const CFG = window.ECOMULTI || {};
  const EMP = CFG.empresa || {};
  const ENDPOINT = (CFG.newsletter && CFG.newsletter.endpoint) || "/api/newsletter";
  const INTERESSES = ["Notícias da empresa", "Domínios .ao", "Hospedagem", "Websites e lojas online", "E-mail profissional", "VPS", "Automação com IA", "Dicas e novidades digitais"];
  const CHAVE = "ecomulti_newsletter";
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  let n = 0;

  const lerFlag = () => { try { return localStorage.getItem(CHAVE) === "1"; } catch { return false; } };
  const gravarFlag = () => { try { localStorage.setItem(CHAVE, "1"); } catch {} };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* telefone angolano: 9 dígitos a começar por 9 (aceita +244) */
  function telefoneAO(v) {
    const d = String(v || "").replace(/[\s().-]/g, "").replace(/^(\+|00)?244/, "");
    return /^9\d{8}$/.test(d) ? d : null;
  }

  function montar(host) {
    const id = "nl" + ++n;
    const origem = host.dataset.newsletter || "site";
    const compacto = host.hasAttribute("data-compact");
    host.classList.add("nl");
    host.innerHTML = `
      <form class="nl-form${compacto ? " compact" : ""}" novalidate>
        <div class="nl-row">
          <label for="${id}-nome"><span>Nome</span><input id="${id}-nome" name="nome" type="text" autocomplete="name" placeholder="O seu nome" maxlength="80"></label>
          <label for="${id}-email"><span>E-mail</span><input id="${id}-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="nome@empresa.ao" maxlength="254" required></label>
        </div>
        ${compacto ? "" : `
        <label class="nl-wa" for="${id}-wa"><span>WhatsApp <em>(opcional — para novidades e ofertas rápidas)</em></span>
          <span class="nl-phone"><b>+244</b><input id="${id}-wa" name="whatsapp" type="tel" autocomplete="tel-national" inputmode="tel" placeholder="9XX XXX XXX" maxlength="16"></span>
        </label>
        <fieldset class="nl-interesses">
          <legend>O que lhe interessa? <em>(opcional)</em></legend>
          <div class="nl-chips">${INTERESSES.map((i, k) => `<label class="nl-chip"><input type="checkbox" name="interesses" value="${esc(i)}" ${k === 0 ? "checked" : ""}><span>${esc(i)}</span></label>`).join("")}</div>
        </fieldset>`}
        <input class="nl-isco" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label class="nl-consent"><input type="checkbox" name="consentimento" required> <span>Aceito receber a newsletter da ECOMULTI e o tratamento dos meus dados conforme a <a href="privacidade.html">política de privacidade</a>. Posso cancelar quando quiser.</span></label>
        <button class="btn btn-accent nl-btn" type="submit"><svg class="icon"><use href="#i-mail"/></svg><span>Quero receber as novidades</span></button>
        <p class="nl-msg" role="status" aria-live="polite"></p>
      </form>
      <div class="nl-ok" hidden></div>`;

    const form = host.querySelector("form"), msg = host.querySelector(".nl-msg"), ok = host.querySelector(".nl-ok");
    const btn = host.querySelector(".nl-btn"), rotulo = btn.querySelector("span");

    function erro(texto, campo) {
      msg.className = "nl-msg err"; msg.textContent = texto;
      if (campo) { campo.classList.add("invalid"); campo.focus(); }
    }
    function sucesso(jaExistia, dados) {
      gravarFlag();
      form.hidden = true; ok.hidden = false;
      ok.innerHTML = `
        <div class="nl-ok-ico"><svg class="icon"><use href="#i-check"/></svg></div>
        <h3>${jaExistia ? "Já estava na nossa lista!" : "Subscrição confirmada!"}</h3>
        <p>${jaExistia ? "Actualizámos as suas preferências." : "Obrigado" + (dados.nome ? ", " + esc(dados.nome.split(" ")[0]) : "") + "! Vai receber as nossas novidades em"} <strong>${esc(dados.email)}</strong>.</p>
        <div class="nl-ok-acts">
          ${origem === "site" ? '<a class="btn btn-primary btn-sm" href="blog.html">Ler o blog</a>' : '<a class="btn btn-primary btn-sm" href="blog.html">Ver mais artigos</a>'}
          <a class="btn btn-outline btn-sm" data-wa="Olá ECOMULTI! Acabei de subscrever a newsletter." href="#">Falar no WhatsApp</a>
        </div>`;
      const wa = ok.querySelector("[data-wa]");
      if (EMP.whatsapp) { wa.href = "https://wa.me/" + EMP.whatsapp + "?text=" + encodeURIComponent(wa.dataset.wa); wa.target = "_blank"; wa.rel = "noopener"; }
      else wa.remove();
      ok.setAttribute("tabindex", "-1");
      ok.focus({ preventScroll: true });
    }
    /* A API falhou: o lead não se perde — envia por WhatsApp ou e-mail */
    function alternativa(dados) {
      const texto = `Olá ECOMULTI! Quero subscrever a newsletter.\nNome: ${dados.nome || "-"}\nE-mail: ${dados.email}` + (dados.whatsapp ? `\nWhatsApp: ${dados.whatsapp}` : "") + (dados.interesses.length ? `\nInteresses: ${dados.interesses.join(", ")}` : "");
      msg.className = "nl-msg err";
      msg.innerHTML = "Não conseguimos guardar a subscrição agora. Envie-nos o pedido por: ";
      const wa = document.createElement("a"), em = document.createElement("a");
      wa.textContent = "WhatsApp"; wa.href = "https://wa.me/" + (EMP.whatsapp || "") + "?text=" + encodeURIComponent(texto); wa.target = "_blank"; wa.rel = "noopener";
      em.textContent = "e-mail"; em.href = "mailto:" + (EMP.email || "") + "?subject=" + encodeURIComponent("Subscrição da newsletter") + "&body=" + encodeURIComponent(texto);
      msg.append(wa, " ou ", em, ".");
    }

    host.addEventListener("input", (e) => e.target.classList && e.target.classList.remove("invalid"));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      host.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
      const f = new FormData(form);
      const email = String(f.get("email") || "").trim();
      const whatsappCru = String(f.get("whatsapp") || "").trim();
      if (f.get("website")) { sucesso(false, { email, nome: "" }); return; }                // robô
      if (!EMAIL.test(email)) return erro("Indique um e-mail válido, por exemplo nome@empresa.ao.", form.elements.email);
      if (whatsappCru && !telefoneAO(whatsappCru)) return erro("O WhatsApp deve ter 9 dígitos, por exemplo 923 000 000.", form.elements.whatsapp);
      if (!form.elements.consentimento.checked) return erro("Confirme que aceita a política de privacidade para subscrever.", form.elements.consentimento);

      const dados = {
        nome: String(f.get("nome") || "").trim(), email,
        whatsapp: whatsappCru ? "+244" + telefoneAO(whatsappCru) : "",
        interesses: f.getAll("interesses"), consentimento: true,
        origem, pagina: location.pathname.split("/").pop() || "index.html"
      };
      btn.disabled = true; rotulo.textContent = "A enviar…"; msg.className = "nl-msg"; msg.textContent = "";
      try {
        const r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) sucesso(!!j.jaExistia, dados);
        else if (r.status === 400 || r.status === 429) erro(j.erro || "Não foi possível subscrever. Tente novamente.");
        else alternativa(dados);
      } catch {
        alternativa(dados);
      } finally {
        btn.disabled = false; rotulo.textContent = "Quero receber as novidades";
      }
    });

    /* quem já subscreveu neste navegador: lembra com discrição */
    if (lerFlag() && !compacto) {
      const nota = document.createElement("p");
      nota.className = "nl-ja";
      nota.innerHTML = '<svg class="icon"><use href="#i-check"/></svg> Já subscreveu neste dispositivo. Pode usar outro e-mail se quiser.';
      form.prepend(nota);
    }
  }

  function arrancar() { document.querySelectorAll("[data-newsletter]:not(.nl)").forEach(montar); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
  document.addEventListener("eco:newsletter", arrancar);   // blocos criados depois (ex.: artigo do blog)
})();
