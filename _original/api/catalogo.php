(function () {
  "use strict";
  const valores  = {"hospedagem.starter":10,"hospedagem.business":5500,"hospedagem.premium":12000,"email.essencial":1500,"email.profissional":4500,"email.empresarial":9000,"desenvolvimento.landing":120000,"desenvolvimento.institucional":280000,"desenvolvimento.loja":650000,"regra.pagina_extra":15000,"extra.blog":40000,"extra.idiomas":50000,"extra.seo":45000,"extra.logo":35000,"extra.formacao":20000,"regra.prioritario":20,"dominio.ao":35000,"dominio.co.ao":40000,"dominio.com":25000,"dominio.net":22000,"dominio.org":22000,"regra.desconto_2anos":10,"regra.desconto_3anos":15,"regra.desconto_multi":5};
  const unidades = {"hospedagem.starter":"kz_mes","hospedagem.business":"kz_mes","hospedagem.premium":"kz_mes","email.essencial":"kz_mes","email.profissional":"kz_mes","email.empresarial":"kz_mes","desenvolvimento.landing":"kz","desenvolvimento.institucional":"kz","desenvolvimento.loja":"kz","regra.pagina_extra":"kz","extra.blog":"kz","extra.idiomas":"kz","extra.seo":"kz","extra.logo":"kz","extra.formacao":"kz","regra.prioritario":"pct","dominio.ao":"kz_ano","dominio.co.ao":"kz_ano","dominio.com":"kz_ano","dominio.net":"kz_ano","dominio.org":"kz_ano","regra.desconto_2anos":"pct","regra.desconto_3anos":"pct","regra.desconto_multi":"pct"};

  const formatar = (chave) => unidades[chave] === "pct"
    ? valores[chave] + "%"
    : new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 0 }).format(valores[chave]) + " Kz";

  window.precoDe = function (chave) {
    if (!(chave in valores)) throw new Error("Preço desconhecido: " + chave);
    return valores[chave];
  };

  function preencher() {
    document.querySelectorAll("[data-preco]").forEach((el) => {
      const chaves = el.dataset.preco.split(",").filter((c) => c in valores);
      if (!chaves.length) return;
      const menor  = chaves.reduce((a, b) => (valores[b] < valores[a] ? b : a));
      const iguais = chaves.every((c) => valores[c] === valores[menor]);
      el.textContent = (el.dataset.modelo || "{}").replace("{}", (iguais ? "" : "desde ") + formatar(menor));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", preencher);
  else preencher();
})();
