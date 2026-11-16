/* Popups promocionais (artes da ECOMULTI), cada um na página do seu serviço.
   - Aparecem UMA vez por visita (sessão do navegador) em cada página.
   - Nas páginas com várias artes, cada visita mostra a seguinte (rotação).
   - Para testar: acrescente ?promo ao endereço (ex.: hospedagem-ecomulti.html?promo).
   Para mudar artes ou textos, edite só a lista PROMOS abaixo. */
(function () {
  "use strict";

  const PROMOS = {
    "hospedagem-ecomulti.html": [{
      img: "assets/img/promo/alojamento-email.jpg",
      alt: "Planos de alojamento web e e-mails corporativos ECOMULTI: Start, Pro e Business",
      titulo: "Uma casa rápida e segura para o seu site",
      texto: "Alojamento em SSD, com certificado SSL, e-mails com o seu domínio e cópias de segurança. Escolha o plano e veja já quanto paga por 1, 2 ou 3 anos.",
      cta: { texto: "Ver planos", href: "#planos" },
      wa: "Olá ECOMULTI! Vi os planos de alojamento web e gostaria de saber mais."
    }],
    "email-corporativo-ecomulti.html": [{
      img: "assets/img/promo/alojamento-email.jpg",
      alt: "Planos de alojamento web e e-mails corporativos ECOMULTI: Start, Pro e Business",
      titulo: "A sua marca em cada mensagem",
      texto: "Troque o e-mail gratuito por endereços com o nome da sua empresa, como geral@suaempresa.ao. Mais credibilidade, comunicação organizada e acesso em qualquer dispositivo.",
      cta: { texto: "Ver pacotes", href: "#pacotes" },
      wa: "Olá ECOMULTI! Vi os planos de e-mail profissional e gostaria de saber mais."
    }],
    "desenvolvimento-ecomulti.html": [{
      img: "assets/img/promo/websites-planos.jpg",
      alt: "Planos de website ECOMULTI: Start, Pro e Business",
      titulo: "Um website à medida do seu negócio",
      texto: "O seu site é a sua melhor montra, aberta 24 horas. Criamos sites modernos, rápidos e adaptados ao telemóvel — escolha o pacote, junte os extras e veja o valor na hora.",
      cta: { texto: "Ver pacotes", href: "#pacotes" },
      wa: "Olá ECOMULTI! Vi os planos de website e gostaria de saber qual é o mais indicado para mim."
    }, {
      img: "assets/img/promo/website-start.jpg",
      alt: "Plano Start ECOMULTI: website essencial para presença online",
      titulo: "Website essencial para estar online",
      texto: "Uma página forte para apresentar uma oferta ou captar contactos. Design adaptado a telemóvel, tablet e computador, com formulário de contacto e botão de WhatsApp.",
      cta: { texto: "Calcular orçamento", href: "#calculadora" },
      wa: "Olá ECOMULTI! Tenho interesse no Plano Start (website essencial)."
    }, {
      img: "assets/img/promo/website-pro.jpg",
      alt: "Plano Pro ECOMULTI: website para evoluir, com mais recursos para crescimento",
      titulo: "Website para evoluir e crescer",
      texto: "Uma presença digital completa e profissional: design personalizado, formulários e mapa de localização, e estrutura preparada para o Google.",
      cta: { texto: "Calcular orçamento", href: "#calculadora" },
      wa: "Olá ECOMULTI! Tenho interesse no Plano Pro (website para crescimento)."
    }, {
      img: "assets/img/promo/website-pro-2.jpg",
      alt: "Plano Pro ECOMULTI: website para evoluir, com mais recursos para crescimento",
      titulo: "Website para evoluir e crescer",
      texto: "Uma presença digital completa e profissional: design personalizado, formulários e mapa de localização, e estrutura preparada para o Google.",
      cta: { texto: "Calcular orçamento", href: "#calculadora" },
      wa: "Olá ECOMULTI! Tenho interesse no Plano Pro (website para crescimento)."
    }]
  };

  const ATRASO_MS = 4000;
  const pagina = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const lista = PROMOS[pagina];
  if (!lista || !lista.length) return;

  const forcar = /[?&]promo\b/.test(location.search);
  const ler = (s, k) => { try { return window[s].getItem(k); } catch (e) { return null; } };
  const gravar = (s, k, v) => { try { window[s].setItem(k, v); } catch (e) { /* armazenamento bloqueado */ } };
  const chaveVisto = "ecomulti_promo_visto_" + pagina;
  const chaveRodar = "ecomulti_promo_rodar_" + pagina;
  if (!forcar && ler("sessionStorage", chaveVisto)) return;

  /* rotação entre visitas */
  const n = parseInt(ler("localStorage", chaveRodar) || "0", 10) || 0;
  const arte = lista[n % lista.length];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const linkWa = (t) => (window.EcoApp && EcoApp.linkWhatsApp ? EcoApp.linkWhatsApp(t) : "https://wa.me/244923340895?text=" + encodeURIComponent(t));

  function abrir() {
    if (document.querySelector("dialog[open]")) return;            // não abre por cima de outro diálogo
    const img = new Image();
    img.onload = () => mostrar(img);
    img.src = arte.img;                                             // só abre depois de a arte carregar
  }

  function mostrar(img) {
    gravar("sessionStorage", chaveVisto, "1");
    gravar("localStorage", chaveRodar, String(n + 1));

    const d = document.createElement("dialog");
    d.className = "promo";
    d.setAttribute("aria-labelledby", "promoTitulo");
    d.innerHTML =
      '<button class="promo-fechar" type="button" aria-label="Fechar">&times;</button>' +
      '<div class="promo-arte"></div>' +
      '<div class="promo-corpo">' +
        '<span class="eyebrow">ECOMULTI</span>' +
        '<h2 id="promoTitulo">' + esc(arte.titulo) + "</h2>" +
        "<p>" + esc(arte.texto) + "</p>" +
        '<div class="promo-accoes">' +
          '<a class="btn btn-accent" data-promo-cta href="' + esc(arte.cta.href) + '">' + esc(arte.cta.texto) + "</a>" +
          '<a class="btn btn-whatsapp" target="_blank" rel="noopener" href="' + esc(linkWa(arte.wa)) + '">Falar no WhatsApp</a>' +
        "</div>" +
        '<button class="promo-depois" type="button">Agora não</button>' +
      "</div>";
    img.alt = arte.alt; img.width = 1080; img.height = 1350;
    d.querySelector(".promo-arte").appendChild(img);
    document.body.appendChild(d);

    const fechar = () => { d.classList.add("saindo"); setTimeout(() => { if (d.open) d.close(); d.remove(); }, 180); };
    d.querySelector(".promo-fechar").addEventListener("click", fechar);
    d.querySelector(".promo-depois").addEventListener("click", fechar);
    d.querySelector("[data-promo-cta]").addEventListener("click", fechar);  // fecha e segue para a secção
    d.addEventListener("click", (e) => { if (e.target === d) fechar(); });  // clique fora da caixa
    d.addEventListener("cancel", (e) => { e.preventDefault(); fechar(); });  // tecla Esc

    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    d.querySelector(".promo-fechar").focus({ preventScroll: true });
  }

  const iniciar = () => setTimeout(abrir, forcar ? 300 : ATRASO_MS);
  if (document.readyState === "complete") iniciar(); else window.addEventListener("load", iniciar);
})();
