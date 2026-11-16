/* =====================================================================
   ECOMULTI — CONFIGURAÇÃO CENTRAL
   Tudo o que muda com frequência está aqui: contactos, dados da empresa
   e tabela de preços. Altere SÓ este ficheiro; todas as páginas lêem daqui.
   ===================================================================== */
window.ECOMULTI = {
  empresa: {
    nome: "ECOMULTI",
    email: "suporte@ecomulti.ao",
    // WhatsApp: só números, com indicativo do país (244 = Angola)
    whatsapp: "244923340895",
    telefoneVisivel: "+244 923 340 895",
    // Campos opcionais: se ficarem vazios, não aparecem no site.
    morada: "",            // ex.: "Rua X, n.º 10, Talatona, Luanda"
    nif: "",               // ex.: "5000000000"
    horario: "Segunda a sexta, 08h00–18h00", // confirme o horário real
    redes: {
      facebook: "",        // ex.: "https://facebook.com/ecomulti"
      instagram: "",
      linkedin: ""
    }
  },

  /* Endereços da API. Todos são servidos pelo servidor Node.js da ECOMULTI no mesmo domínio
     (cPanel da AngoWeb, "Setup Node.js App" em ecomulti.ao/api — ver LEIA-ME.md).

     Assistente de atendimento (chat). Sem agente disponível (ou sem chave da IA),
     o chat funciona em modo guiado (sem IA). */
  agente: {
    endpoint: "/api/agente"
  },

  /* Blog e newsletter. Sem API, o blog mostra os artigos de blog/posts.json
     e a newsletter abre o e-mail/WhatsApp. */
  blog: {
    endpoint: "/api/blog",
    ficheiro: "blog/posts.json"
  },
  newsletter: {
    endpoint: "/api/newsletter"
  },

  /* Dashboard administrativo (admin.html) e registo dos pedidos de orçamento nas vendas */
  admin: {
    endpoint: "/api/admin"
  },
  pedidos: {
    endpoint: "/api/pedido"
  },

  /* Impostos — confirme com o seu contabilista */
  fiscal: {
    taxaIVA: 0.14,
    precosIncluemIVA: false
  },

  /* Tabela de preços (Kz). Se o servidor tiver api/catalogo.php,
     os valores de lá substituem estes automaticamente. */
  precos: {
    "hospedagem.starter": 3325,
    "hospedagem.business": 6660,
    "hospedagem.premium": 15900,

    "vps.desde": 35000,
    "automacao.desde": 75000,

    "email.essencial": 1500,
    "email.profissional": 4500,
    "email.empresarial": 9000,

    "desenvolvimento.landing": 120000,
    "desenvolvimento.institucional": 280000,
    "desenvolvimento.loja": 650000,
    "regra.pagina_extra": 15000,
    "extra.blog": 40000,
    "extra.idiomas": 50000,
    "extra.seo": 45000,
    "extra.logo": 35000,
    "extra.formacao": 20000,
    "regra.prioritario": 20,       // %

    "dominio.ao": 35000,
    "dominio.co.ao": 40000,
    "dominio.it.ao": 32400,
    "dominio.edu.ao": 32400,
    "dominio.org.ao": 32400,
    "dominio.com": 32000,
    "dominio.net": 32000,
    "dominio.org": 32000,

    "regra.desconto_2anos": 10,    // %
    "regra.desconto_3anos": 15     // %
  }
};
